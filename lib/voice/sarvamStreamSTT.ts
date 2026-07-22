/**
 * sarvamStreamSTT.ts — real-time streaming STT via Sarvam Saaras v3
 * WebSocket (opt-in "sarvam-stream" provider).
 *
 * Measured through the local relay: the final transcript for an utterance
 * arrives ~150 ms after speech ends (server processing ~75 ms) — versus a
 * full clip round-trip on the REST path. Sarvam runs its own server-side
 * neural VAD and emits START_SPEECH / END_SPEECH events; every "data"
 * message is a finalized utterance, so turns are server-endpointed.
 *
 * Browsers can't set auth headers on WebSocket connects and Next.js route
 * handlers can't host sockets, so the connection goes through the tiny
 * standalone relay (scripts/sarvam-ws-relay.mjs), discovered via
 * GET /api/transcribe -> streamUrl. Everything fails soft: no relay, a
 * dropped socket, or a connect timeout all fire onFallback and the caller
 * drops to the clip-based capture path unchanged.
 *
 * Audio is pushed from the app's SINGLE shared microphone stream — this
 * module never opens its own mic and never stops the shared tracks.
 */
import { getStream, initMic } from "./micManager";
import { getVoiceSettings } from "./voiceSettings";

export interface SarvamStreamHandlers {
  onFinal: (text: string, confidence: number) => void;
  onFallback: (reason: string) => void;
}

let ws: WebSocket | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let audioCtx: AudioContext | null = null;
let running = false;
let paused = false;
let sentHeader = false;
let handlers: SarvamStreamHandlers | null = null;
let lastFinal = "";
let flushWaiter: ((text: string) => void) | null = null;

/** Relay discovery, cached per session. */
let cachedStreamUrl: string | null | undefined;

async function streamUrl(): Promise<string | null> {
  if (cachedStreamUrl !== undefined) return cachedStreamUrl;
  try {
    const res = await fetch("/api/transcribe");
    cachedStreamUrl = ((await res.json()) as { streamUrl?: string | null }).streamUrl || null;
  } catch {
    cachedStreamUrl = null;
  }
  return cachedStreamUrl;
}

export function isSarvamStreamRunning(): boolean {
  return running;
}

/** Saaras locale for the selected UI language (mirrors the server mapping). */
function sarvamLocale(): string {
  const lang = getVoiceSettings().sttLang || "en-IN";
  return lang.startsWith("en") ? "en-IN" : lang;
}

/** 16 kHz s16le PCM from a mono Float32 frame (linear resample). */
function to16kPcm(input: Float32Array, srcRate: number): Uint8Array {
  const target = 16000;
  let samples = input;
  if (srcRate !== target) {
    const ratio = srcRate / target;
    const out = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
    for (let i = 0; i < out.length; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      out[i] = input[i0] * (1 - (pos - i0)) + input[i1] * (pos - i0);
    }
    samples = out;
  }
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** 44-byte WAV header for a 16 kHz mono s16 stream (length fields nominal). */
function wavHeader(): Uint8Array {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); v.setUint32(4, 0x7fffffff, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, 0x7fffffff, true);
  return h;
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function sendAudio(bytes: Uint8Array): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let payload = bytes;
  if (!sentHeader) {
    payload = new Uint8Array(44 + bytes.length);
    payload.set(wavHeader());
    payload.set(bytes, 44);
    sentHeader = true;
  }
  ws.send(JSON.stringify({ audio: { data: b64(payload), sample_rate: "16000", encoding: "audio/wav" } }));
}

function cleanup(): void {
  running = false;
  paused = false;
  sentHeader = false;
  try { processor?.disconnect(); } catch {}
  if (processor) processor.onaudioprocess = null;
  try { sourceNode?.disconnect(); } catch {}
  processor = null;
  sourceNode = null;
  if (audioCtx && audioCtx.state !== "closed") audioCtx.close().catch(() => {});
  audioCtx = null;
  const socket = ws;
  ws = null;
  if (socket && socket.readyState <= WebSocket.OPEN) {
    try { socket.close(); } catch {}
  }
}

/** Begin streaming. Resolves false on any setup failure (caller falls back). */
export async function startSarvamStream(h: SarvamStreamHandlers): Promise<boolean> {
  if (running) return true;
  const url = await streamUrl();
  if (!url) return false;

  let stream = getStream();
  if (!stream) stream = await initMic();
  if (!stream) return false;

  const lang = sarvamLocale();
  const mode = lang === "hi-IN" ? "codemix" : "transcribe";
  const q = `?language-code=${encodeURIComponent(lang)}&model=saaras:v3&mode=${mode}&flush_signal=true&vad_signals=true`;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const fail = (reason: string) => {
      cleanup();
      if (!settled) { settled = true; resolve(false); }
      else handlers?.onFallback(reason);
    };
    try {
      ws = new WebSocket(url + q);
    } catch (e) {
      console.warn("[SarvamStream] connect threw:", e);
      resolve(false);
      return;
    }
    const connectGuard = setTimeout(() => fail("connect-timeout"), 4000);

    ws.onopen = async () => {
      clearTimeout(connectGuard);
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        sourceNode = audioCtx.createMediaStreamSource(stream!);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (paused) return;
          sendAudio(to16kPcm(e.inputBuffer.getChannelData(0), audioCtx!.sampleRate));
        };
        sourceNode.connect(processor);
        processor.connect(audioCtx.destination);
        handlers = h;
        running = true;
        settled = true;
        console.log(`[SarvamStream] connected (${lang}, ${mode})`);
        resolve(true);
      } catch (e) {
        fail("capture: " + (e instanceof Error ? e.message : String(e)));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type?: string;
          data?: { transcript?: string; signal_type?: string; message?: string };
        };
        if (msg.type === "data") {
          const text = (msg.data?.transcript || "").trim();
          if (text) {
            lastFinal = text;
            if (flushWaiter) { flushWaiter(text); flushWaiter = null; }
            handlers?.onFinal(text, 0.95);
          }
        } else if (msg.type === "error") {
          console.warn("[SarvamStream] server error:", msg.data?.message);
        }
      } catch {
        /* non-JSON frame — ignore */
      }
    };

    ws.onerror = () => { clearTimeout(connectGuard); fail("socket-error"); };
    ws.onclose = () => {
      clearTimeout(connectGuard);
      if (running) fail("socket-closed");
      else if (!settled) { settled = true; resolve(false); }
    };
  });
}

/**
 * Force-finalize whatever has been spoken (PTT release): sends the flush
 * signal and resolves with the final transcript, or "" after a short wait.
 */
export function flushSarvamStream(timeoutMs = 2500): Promise<string> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(lastFinal);
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => { flushWaiter = null; resolve(lastFinal); }, timeoutMs);
    flushWaiter = (text) => { clearTimeout(timer); resolve(text); };
    try { ws!.send(JSON.stringify({ type: "flush" })); } catch { clearTimeout(timer); resolve(lastFinal); }
  });
}

export function stopSarvamStream(): void {
  handlers = null;
  lastFinal = "";
  cleanup();
}

/** Mute the push (assistant speaking) without dropping the connection. */
export function pauseSarvamStream(): void {
  paused = true;
}

export function resumeSarvamStream(): void {
  paused = false;
}
