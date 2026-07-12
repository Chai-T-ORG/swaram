/**
 * pushToTalk.ts — capture audio only while the user is actively holding /
 * tapping to talk, then transcribe the whole clip at once.
 *
 * Why this beats always-on listening in a crowd: nothing is recorded between
 * activations, so bystander chatter is never captured. The user controls when
 * the utterance ends (no waiting on a silence detector), so it's also lower
 * latency, and Whisper gets one clean clip, so accuracy is much better.
 *
 * Uses MediaRecorder (webm/opus on Chrome, mp4 on Safari) → our /api/transcribe
 * proxy → Groq Whisper. Falls back through the same proxy fallbacks.
 */
import { getStream, initMic } from "./micManager";
import { getGroqKey } from "./groqSTT";
import { getVoiceSettings } from "./voiceSettings";
import { emitExternalTranscript } from "./speechToText";
import { blobToWav16k } from "./wavEncode";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let capturing = false;
let startedAt = 0;
const stateListeners = new Set<(capturing: boolean) => void>();

export function onPttStateChange(listener: (capturing: boolean) => void): () => void {
  stateListeners.add(listener);
  listener(capturing);
  return () => stateListeners.delete(listener);
}

function setCapturing(value: boolean): void {
  capturing = value;
  for (const l of stateListeners) {
    try { l(value); } catch { /* ignore */ }
  }
}

export function isPttCapturing(): boolean {
  return capturing;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

/** Begin capturing. Returns false if the mic can't be acquired. */
export async function startPtt(): Promise<boolean> {
  if (capturing) return true;
  let stream = getStream();
  if (!stream) stream = await initMic();
  if (!stream) return false;

  chunks = [];
  const mimeType = pickMimeType();
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    recorder = new MediaRecorder(stream);
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  startedAt = Date.now();
  setCapturing(true);
  return true;
}

/**
 * Stop capturing, transcribe the clip, and fan the transcript into the shared
 * listener pipeline (the same one continuous listening uses). Resolves with the
 * transcript, or "" if nothing usable was said.
 */
export async function stopPtt(): Promise<string> {
  if (!recorder || !capturing) return "";
  const rec = recorder;
  const heldMs = Date.now() - startedAt;
  recorder = null;

  const blob: Blob = await new Promise((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    try { rec.stop(); } catch { resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); }
  });
  setCapturing(false);

  // Ignore accidental taps (too short to contain speech).
  if (heldMs < 300 || blob.size < 1500) return "";

  const text = await transcribeBlob(blob);
  if (text) emitExternalTranscript(text);
  return text;
}

/** Cancel capture without transcribing (e.g., user aborted). */
export function cancelPtt(): void {
  if (recorder) {
    try { recorder.stop(); } catch { /* ignore */ }
    recorder = null;
  }
  chunks = [];
  setCapturing(false);
}

// Debug/e2e hook: inject a transcript as if the user spoke it (no audio),
// to test the command pipeline. Namespaced and harmless.
if (typeof window !== "undefined") {
  (window as unknown as { __swaramPTT?: unknown }).__swaramPTT = {
    isCapturing: isPttCapturing,
    emitTest: (t: string) => emitExternalTranscript(t),
  };
}

async function transcribeBlob(blob: Blob): Promise<string> {
  const provider = getVoiceSettings().sttProvider;

  // Azure's REST endpoint only accepts 16 kHz mono WAV. MediaRecorder emits
  // webm/mp4/ogg, so decode the clip to 16 kHz WAV via the browser before
  // upload. If decoding fails, send the original and let the server fall back.
  let body: Blob = blob;
  if (provider === "azure") {
    const wav = await blobToWav16k(blob);
    if (wav) body = wav;
  }

  const headers: Record<string, string> = {
    "Content-Type": body.type || "audio/webm",
    "x-language": getVoiceSettings().sttLang || "en-IN",
    "x-stt-provider": provider,
  };
  const localKey = getGroqKey();
  if (localKey) headers["x-groq-key"] = localKey;
  try {
    const res = await fetch("/api/transcribe", { method: "POST", headers, body });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || data.error) {
      console.warn("[PTT] transcription failed:", res.status, data.error);
      return "";
    }
    return (data.text ?? "").trim();
  } catch (err) {
    console.warn("[PTT] transcription error:", err);
    return "";
  }
}
