/**
 * groqSTT.ts — cloud speech-to-text via Groq's Whisper (large-v3-turbo).
 *
 * Reuses the shared VAD capture to segment speech, encodes each utterance as
 * WAV, and sends it through our own /api/transcribe proxy (which holds the
 * key server-side). Fast and highly accurate when online; the caller falls
 * back to on-device Whisper or the browser's native recognition when it isn't.
 *
 * Nothing here downloads a model, so it's the most demo-reliable STT path.
 */
import { startVadCapture, setVadSpellMode, type VadHandle } from "./vadCapture";
import { getVoiceSettings } from "./voiceSettings";
import { encodeWav16k } from "./wavEncode";

const LOCAL_KEY = "swaram_groq_key";

export function getGroqKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LOCAL_KEY) ?? "";
}

export function setGroqKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key.trim()) localStorage.setItem(LOCAL_KEY, key.trim());
  else localStorage.removeItem(LOCAL_KEY);
  // Force the availability probe to re-run with the new key.
  probeState = "unknown";
  cachedAvailable = false;
}

/**
 * Field hint for the server-side engine router: "spell" while the user is
 * dictating letters, "name" while answering a name field. Hinted clips run the
 * server's parallel ensemble (every configured engine + LLM fusion) with the
 * field label and the user's confirmed names as context — the same
 * inference-time biasing OpenAI/Deepgram/AssemblyAI expose as prompts.
 */
export type SttFieldHint = "" | "spell" | "name";

export interface SttFieldContext {
  /** The form-field label ("Full Name") — steers Whisper/Gemini/fusion. */
  label?: string;
  /** Names the user already confirmed — biasing vocabulary for the ensemble. */
  names?: string[];
}

let fieldHint: SttFieldHint = "";
let fieldContext: SttFieldContext = {};

export function setSttFieldHint(hint: SttFieldHint, context: SttFieldContext = {}): void {
  fieldHint = hint;
  fieldContext = context;
  // Spelling changes how the VAD must segment: letters come with long
  // pauses, so the capture layer holds the utterance open between them.
  setVadSpellMode(hint === "spell");
}

/** Current hint + context — for capture paths outside this module (PTT). */
export function getSttFieldHint(): { hint: SttFieldHint; context: SttFieldContext } {
  return { hint: fieldHint, context: fieldContext };
}

type TranscriptListener = (text: string, confidence: number) => void;
const listeners = new Set<TranscriptListener>();

export function addGroqTranscriptListener(l: TranscriptListener): void {
  listeners.add(l);
}
export function removeGroqTranscriptListener(l: TranscriptListener): void {
  listeners.delete(l);
}

/* ----------------------------- availability ----------------------------- */

let probeState: "unknown" | "probing" | "done" = "unknown";
let cachedAvailable = false;
let cachedAzureAvailable = false;
let cachedSarvamAvailable = false;
let onFatalFallback: (() => void) | null = null;

/** Register what to do if the cloud engine turns out to be unusable mid-session. */
export function setGroqFallback(cb: () => void): void {
  onFatalFallback = cb;
}

/**
 * Synchronous best-guess used by the router. A locally-stored key means
 * "available" immediately; otherwise we rely on the cached server probe.
 */
export function isGroqConfigured(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (getGroqKey()) return true;
  return cachedAvailable;
}

/**
 * Azure STT availability. Unlike Groq there's no client-key path — it needs a
 * server key + region — so this reflects only the cached server probe.
 */
export function isAzureConfigured(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return cachedAzureAvailable;
}

/** Sarvam STT availability — server key only, like Azure. */
export function isSarvamConfigured(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return cachedSarvamAvailable;
}

/** One-time async probe of the server for env-configured cloud STT keys. */
export async function probeGroqAvailability(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hasLocal = Boolean(getGroqKey());
  if (hasLocal) cachedAvailable = true;
  if (probeState === "done" || probeState === "probing") return cachedAvailable;
  probeState = "probing";
  try {
    const res = await fetch("/api/transcribe", { method: "GET" });
    const data = (await res.json()) as { envKey?: boolean; azure?: boolean; sarvam?: boolean };
    cachedAvailable = hasLocal || Boolean(data.envKey);
    cachedAzureAvailable = Boolean(data.azure);
    cachedSarvamAvailable = Boolean(data.sarvam);
  } catch {
    cachedAvailable = hasLocal;
  }
  probeState = "done";
  return cachedAvailable;
}

/* ------------------------------- capture -------------------------------- */

let handle: VadHandle | null = null;
let listening = false;
let hadSuccess = false;
let consecutiveFailures = 0;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

async function transcribe(pcm: Float32Array, sampleRate: number): Promise<void> {
  const settings = getVoiceSettings();
  const provider = settings.sttProvider;
  // Azure's REST endpoint only accepts 16 kHz mono WAV, and Sarvam is tuned
  // for 16 kHz (and hinted clips may be server-promoted to Sarvam) — those
  // paths get the downsample; Groq resamples the native-rate clip itself.
  const lang = settings.sttLang || "en-IN";
  const wants16k =
    provider === "azure" || provider === "azure-stream" || provider === "sarvam" ||
    provider === "sarvam-stream" ||
    fieldHint !== "" || !lang.startsWith("en");
  const wav = wants16k ? encodeWav16k(pcm, sampleRate) : encodeWav(pcm, sampleRate);
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "x-language": lang,
    "x-stt-provider": provider,
  };
  if (fieldHint) {
    headers["x-stt-hint"] = fieldHint;
    if (fieldContext.label) headers["x-field-label"] = encodeURIComponent(fieldContext.label.slice(0, 80));
    if (fieldContext.names?.length) {
      headers["x-known-names"] = encodeURIComponent(fieldContext.names.join(", ").slice(0, 240));
    }
  }
  const localKey = getGroqKey();
  if (localKey) headers["x-groq-key"] = localKey;

  try {
    const res = await fetch("/api/transcribe", { method: "POST", headers, body: wav });
    const data = (await res.json().catch(() => ({}))) as { text?: string; provider?: string; error?: string };
    if (!res.ok || data.error) {
      handleFailure(`${res.status} ${data.error ?? ""}`);
      return;
    }
    consecutiveFailures = 0;
    hadSuccess = true;
    const text = (data.text ?? "").trim();
    if (!text) return;
    // Confidence mirrors how the ensemble settled: unanimous engines beat a
    // fused disagreement, which beats a lone engine's word.
    const confidence = data.provider === "consensus" ? 0.99 : data.provider === "fusion" ? 0.85 : 0.97;
    for (const l of listeners) {
      try { l(text, confidence); } catch (e) { console.error("[GroqSTT] listener", e); }
    }
  } catch (err) {
    handleFailure(err instanceof Error ? err.message : String(err));
  }
}

function handleFailure(detail: string): void {
  consecutiveFailures += 1;
  console.warn(`[GroqSTT] transcription failed (${detail}); failures=${consecutiveFailures}`);
  // If it never worked, or it's failing repeatedly, hand off to a fallback engine.
  if ((!hadSuccess && consecutiveFailures >= 1) || consecutiveFailures >= 3) {
    console.warn("[GroqSTT] giving up — falling back to another STT engine.");
    onFatalFallback?.();
  }
}

export async function startGroqListening(): Promise<boolean> {
  if (listening) return true;
  handle = await startVadCapture((pcm, sampleRate) => {
    void transcribe(pcm, sampleRate);
  });
  if (!handle) return false;
  listening = true;
  return true;
}

export function stopGroqListening(): void {
  listening = false;
  handle?.stop();
  handle = null;
}

export function pauseGroqListening(): void {
  handle?.pause();
}

export function resumeGroqListening(): void {
  handle?.resume();
}

// Debug/e2e handle: drive the transcription path with a synthetic buffer so
// routing + fallback can be tested without a live microphone. Harmless.
if (typeof window !== "undefined") {
  (window as unknown as { __swaramSTT?: unknown }).__swaramSTT = {
    isGroqConfigured,
    resetFailures: () => { hadSuccess = false; consecutiveFailures = 0; },
    testTranscribe: (n = 16000) => transcribe(new Float32Array(n).fill(0.05), 16000),
  };
}
