/**
 * Text-to-speech with several engines, picked in settings:
 *  - "cloud":  neural MP3 from our /api/tts proxy, played through one
 *              gesture-unlocked <audio> element. The default — the only path
 *              that reliably speaks on iOS Safari and low-end phones.
 *  - "system": the browser's SpeechSynthesis, best available voice auto-ranked
 *  - "local":  Kokoro-82M neural TTS running fully on-device (WebGPU/WASM via
 *              ONNX). Genuinely human-sounding but heavy; opt-in for offline use.
 *  - "google": legacy alias, routed through the "cloud" path.
 * SpeechSynthesis remains the automatic fallback whenever an engine fails.
 */
import { getVoiceSettings } from "./voiceSettings";
import { pauseContinuousListening, resumeContinuousListening } from "./speechToText";
import {
  updateTtsProgress,
  markTtsReady,
  markTtsError,
  getDeviceConfig,
  registerRetryCallback,
} from "./modelManager";

type KokoroModel = {
  generate: (text: string, options: { voice: string }) => Promise<{ audio: Float32Array; sampling_rate: number }>;
};

export type KokoroStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number; detail: string }
  | { state: "ready" }
  | { state: "error"; message: string };

let kokoroTTS: KokoroModel | null = null;
let kokoroLoading: Promise<KokoroModel | null> | null = null;
/** After a GPU/device error mid-session, reload on WASM instead of giving up. */
let kokoroPreferWasm = false;
let kokoroStatus: KokoroStatus = { state: "idle" };
const kokoroStatusListeners = new Set<(status: KokoroStatus) => void>();

function setKokoroStatus(status: KokoroStatus): void {
  kokoroStatus = status;
  for (const listener of kokoroStatusListeners) {
    try {
      listener(status);
    } catch {
      // listener errors must not break the engine
    }
  }
}

export function getKokoroStatus(): KokoroStatus {
  return kokoroStatus;
}

/** Subscribe to AI-voice download/ready state. Fires immediately with the current status. */
export function subscribeKokoroStatus(listener: (status: KokoroStatus) => void): () => void {
  kokoroStatusListeners.add(listener);
  listener(kokoroStatus);
  return () => kokoroStatusListeners.delete(listener);
}
let currentAudioSource: AudioBufferSourceNode | null = null;
let audioCtx: AudioContext | null = null;
let activeAudio: HTMLAudioElement | null = null;

let voicesReady = false;
let cached: SpeechSynthesisVoice[] = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn("[TTS] Failed to init AudioContext:", e);
    return null;
  }
}

/** The model, but only if it is already loaded — never blocks. */
export function kokoroModelIfReady(): KokoroModel | null {
  return kokoroTTS;
}

/**
 * onnxruntime prints benign "[W:onnxruntime ...] node not assigned to
 * preferred execution provider" notices through console.error, which
 * Next's dev overlay renders as scary errors. Filter exactly that
 * signature; every real message passes through untouched.
 */
let onnxFilterInstalled = false;
function silenceOnnxWarnings(): void {
  if (onnxFilterInstalled || typeof window === "undefined") return;
  onnxFilterInstalled = true;
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("[W:onnxruntime")) return;
    originalError(...args);
  };
}
silenceOnnxWarnings();

interface DownloadProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

/**
 * Load the Kokoro neural TTS model in the background (once). Uses WebGPU
 * when available, WASM otherwise. Weights are fetched from HuggingFace on
 * first use (~90-300 MB) and cached by the browser for offline reuse.
 * Never blocks speech: callers keep using the system voice until
 * kokoroModelIfReady() returns the model. Failed loads can be retried —
 * a new call after an error starts over.
 */
export function loadKokoro(): Promise<KokoroModel | null> {
  if (kokoroTTS) return Promise.resolve(kokoroTTS);
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!kokoroLoading) {
    setKokoroStatus({ state: "loading", progress: 0, detail: "Starting download…" });
    updateTtsProgress(0, "Starting download…");
    kokoroLoading = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      silenceOnnxWarnings();
      // kokoro-js's own `env` export only proxies wasmPaths, so reach the
      // real onnxruntime env through its transformers dependency.
      try {
        const transformers = (await import("@huggingface/transformers")) as unknown as {
          env?: { backends?: { onnx?: { logLevel?: string } } };
        };
        const onnxEnv = transformers.env?.backends?.onnx;
        if (onnxEnv) onnxEnv.logLevel = "error";
      } catch {
        // log level tuning is best-effort
      }

      // Use modelManager's device config for cross-browser compatibility
      const config = getDeviceConfig();
      const useWebGPU = config.device === "webgpu" && !kokoroPreferWasm;

      // Aggregate per-file progress into one overall fraction.
      const fileProgress = new Map<string, { loaded: number; total: number }>();
      const onProgress = (event: DownloadProgressEvent) => {
        if (event.status !== "progress" || !event.file || !event.total) return;
        fileProgress.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
        let loaded = 0;
        let total = 0;
        for (const f of fileProgress.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        // Tiny config files finish before the model file registers; don't
        // report a misleading early "100%".
        if (total < 5_000_000) return;
        const progress = total > 0 ? loaded / total : 0;
        const detail = `Downloading AI voice — ${Math.round(progress * 100)}%`;
        setKokoroStatus({ state: "loading", progress, detail });
        updateTtsProgress(progress, detail);
      };

      const tts = (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: useWebGPU ? "fp32" : "q8",
        device: useWebGPU ? "webgpu" : "wasm",
        progress_callback: onProgress,
      })) as unknown as KokoroModel;

      // Warm up once so the first real sentence doesn't stutter.
      // On Safari/WASM, this can hang indefinitely — add a safety timeout.
      setKokoroStatus({ state: "loading", progress: 1, detail: "Preparing the voice…" });
      updateTtsProgress(0.98, "Preparing the voice…");
      try {
        await Promise.race([
          tts.generate("Ready.", { voice: "af_heart" }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Warm-up timeout")), 6000),
          ),
        ]);
      } catch {
        // warm-up is best-effort — skip on timeout (common on Safari WASM)
        console.warn("[TTS] Kokoro warm-up skipped (timeout or error)");
      }

      kokoroTTS = tts;
      setKokoroStatus({ state: "ready" });
      markTtsReady();
      return tts;
    })().catch((error: unknown) => {
      console.warn("[TTS] Kokoro failed to load, falling back to system voice:", error);
      kokoroLoading = null; // allow a retry later
      const msg = "The AI voice could not be downloaded. Check your connection and try again.";
      setKokoroStatus({ state: "error", message: msg });
      markTtsError(msg);
      return null;
    });
  }
  return kokoroLoading;
}

/**
 * A generation error mid-session usually means the GPU context died (tab
 * suspended, driver reset). Drop the model and reload on WASM so the AI
 * voice comes back instead of staying silent forever.
 */
function handleKokoroRuntimeFailure(error: unknown): void {
  console.warn("[TTS] Kokoro generation failed — reloading on WASM:", error);
  kokoroTTS = null;
  kokoroLoading = null;
  kokoroPreferWasm = true;
  setKokoroStatus({ state: "idle" });
  void loadKokoro();
}

function initVoices(): void {
  if (voicesReady || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  voicesReady = true;
  cached = window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cached = window.speechSynthesis.getVoices();
    // Voices arrive async in Chrome — re-pick the best one once they load,
    // then keep it stable for the rest of the session.
    stickyVoice = null;
  });
}

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && ("speechSynthesis" in window || getAudioContext() !== null);
}

const ENHANCED_MAC = /alex|samantha|ava|allison|susan|zoe|karen|daniel|serena|moira|tessa|fiona|rishi|veena|isha|lekha|siri/i;

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;
  
  if (/natural|neural|siri/i.test(name)) {
    score += 1500; // Super high priority for Siri / Natural Neural voices (equivalent to ChatGPT)
  }
  if (/alex/i.test(name)) {
    score += 1200; // Prefer Alex highly on macOS as it is pre-installed and highly realistic (takes breaths!)
  }
  if (name.includes("google")) {
    score += 800; // Prefer Google WebNet/Translate voices
  }
  if (/premium|enhanced/i.test(name)) {
    score += 600;
  }
  if (ENHANCED_MAC.test(name)) {
    score += 400;
  }

  if (!lang.startsWith("en")) {
    score -= 5000; // Only use English voices
  } else {
    if (lang === "en-in") score += 100;
    else if (lang === "en-gb") score += 80;
    else if (lang === "en-us") score += 60;
    else score += 40;
  }

  if (voice.localService) {
    score += 10;
  }
  return score;
}

/** English voices, best first — for the settings picker fallback. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const raw = window.speechSynthesis.getVoices() || [];
  
  // Deduplicate by voiceURI to prevent any browser duplicate bugs
  const unique: SpeechSynthesisVoice[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!seen.has(v.voiceURI)) {
      seen.add(v.voiceURI);
      unique.push(v);
    }
  }

  return unique
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (voices.length === 0) return null;
  const preferred = getVoiceSettings().voiceURI;
  if (preferred && preferred !== "null" && preferred !== "undefined") {
    const match = voices.find((v) => v.voiceURI === preferred);
    if (match) return match;
  }
  return voices[0]; // Best scored voice
}

// The chosen system voice is resolved once and cached, so it can't flip
// between utterances (a common cause of "it spoke in a different voice").
let stickyVoice: SpeechSynthesisVoice | null = null;
let stickyVoiceKey: string | null = null;
function getStickyVoice(): SpeechSynthesisVoice | null {
  const key = getVoiceSettings().voiceURI ?? "auto";
  if (stickyVoice && stickyVoiceKey === key) return stickyVoice;
  const picked = pickVoice();
  if (picked) {
    stickyVoice = picked;
    stickyVoiceKey = key;
  }
  return picked;
}

/** Split long text into utterance-sized sentence chunks (for fallback speechSynthesis). */
function chunkText(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 220) return trimmed ? [trimmed] : [];
  const sentences = trimmed.match(/[^.!?]+[.!?]*/g) ?? [trimmed];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 220 && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

let generation = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    if (!window.speechSynthesis.speaking) {
      stopHeartbeat();
      return;
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 4000);
}

function stopHeartbeat(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

/** Play the raw wav Float32Array buffer using Web Audio API */
function playWavBuffer(wav: Float32Array, sampleRate: number = 44100, playbackRate = 1): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    if (!ctx) {
      resolve();
      return;
    }

    if (currentAudioSource) {
      try {
        currentAudioSource.stop();
      } catch (e) {}
      currentAudioSource = null;
    }

    const buffer = ctx.createBuffer(1, wav.length, sampleRate);
    buffer.getChannelData(0).set(wav);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(ctx.destination);

    currentAudioSource = source;

    source.onended = () => {
      if (currentAudioSource === source) {
        currentAudioSource = null;
      }
      resolve();
    };

    source.start();
  });
}

/* ------------------------------------------------------------------ *
 * Cloud voice — MP3 from our /api/tts proxy, played through a single    *
 * <audio> element. This is the default engine: unlike WebGPU models or  *
 * speechSynthesis, an <audio> element fed real MP3 bytes plays on iOS    *
 * Safari and low-end phones, once unlocked by a tap.                     *
 * ------------------------------------------------------------------ */

// One reusable, gesture-unlocked element — the reliable iOS pattern. A fresh
// Audio() per line is autoplay-blocked on iOS outside the originating gesture.
let ttsAudioEl: HTMLAudioElement | null = null;
function getTtsAudioEl(): HTMLAudioElement {
  if (!ttsAudioEl) {
    ttsAudioEl = new Audio();
    ttsAudioEl.preload = "auto";
  }
  return ttsAudioEl;
}

// A separate element used only for unlockAudioPlayback so it never races with
// an in-flight playServerTTS call on the shared ttsAudioEl.
let unlockAudioEl: HTMLAudioElement | null = null;

// A 44-byte silent WAV — played once on a user gesture to unlock playback.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/**
 * Unlock audio output. MUST be called from a real user gesture (tap/click/key).
 * Primes a hidden <audio> element plus the speechSynthesis/AudioContext
 * fallbacks so the first spoken line isn't swallowed by autoplay policy.
 * Uses a dedicated element so it never races with playServerTTS on the shared
 * ttsAudioEl.
 */
export function unlockAudioPlayback(): void {
  if (typeof window === "undefined") return;
  if (!unlockAudioEl) {
    unlockAudioEl = new Audio();
    unlockAudioEl.preload = "auto";
  }
  try {
    unlockAudioEl.muted = true;
    unlockAudioEl.src = SILENT_WAV;
    const p = unlockAudioEl.play();
    if (p && typeof p.then === "function") {
      const el = unlockAudioEl;
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      }).catch(() => {
        el.muted = false;
      });
    }
  } catch {}
  unlockSafariSpeech();
  getAudioContext();
}

/* ------------------------------------------------------------------ *
 * Two-layer TTS blob cache.                                            *
 *   L1 (memory)  — instant within a session.                          *
 *   L2 (Cache Storage) — survives reloads, so the app's deterministic  *
 *     lines (form questions, "Is this correct?", errors) are spoken    *
 *     with zero network wait AND zero synthesis cost after the first   *
 *     time anyone hears them. Non-English lines benefit most, since    *
 *     they otherwise pay a translate + synth round-trip every reload.  *
 * Everything degrades cleanly: if Cache Storage is unavailable or      *
 * throws, we simply fall back to the network path.                     *
 * ------------------------------------------------------------------ */
const clientTtsCache = new Map<string, Blob>();
const CLIENT_TTS_CACHE_MAX = 40;

// Bump the version to invalidate every persisted clip at once (e.g. if voices
// change). Old caches are pruned lazily on next open.
const TTS_CACHE_NAME = "swaram-tts-v1";
const PERSIST_MAX = 200;

/** A stable, opaque Request key for a (lang, text) pair. */
function persistKey(text: string, lang: string): string {
  return `https://swaram.local/tts/${encodeURIComponent(lang)}/${encodeURIComponent(text)}`;
}

function cacheStorageAvailable(): boolean {
  return typeof caches !== "undefined";
}

async function persistentGet(text: string, lang: string): Promise<Blob | null> {
  if (!cacheStorageAvailable()) return null;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const hit = await cache.match(persistKey(text, lang));
    if (!hit) return null;
    const blob = await hit.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null; // never let a cache hiccup block speech
  }
}

async function persistentSet(text: string, lang: string, blob: Blob): Promise<void> {
  if (!cacheStorageAvailable()) return;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    await cache.put(
      persistKey(text, lang),
      new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }),
    );
    // Bound the store. Cache.keys() is insertion-ordered, so the oldest
    // entries sort first — a simple LRU-ish eviction.
    const keys = await cache.keys();
    if (keys.length > PERSIST_MAX) {
      const overflow = keys.slice(0, keys.length - PERSIST_MAX);
      await Promise.all(overflow.map((k) => cache.delete(k)));
    }
  } catch {
    // best-effort persistence
  }
}

async function fetchTTS(text: string, lang: string): Promise<Blob> {
  const key = `${lang}|${text}`;
  const memBlob = clientTtsCache.get(key);
  if (memBlob) return memBlob;

  // L2: persisted from an earlier session — instant and free.
  const persisted = await persistentGet(text, lang);
  if (persisted) {
    clientTtsCache.set(key, persisted);
    return persisted;
  }

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error("tts-http-" + res.status);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("tts-empty");

  clientTtsCache.set(key, blob);
  if (clientTtsCache.size > CLIENT_TTS_CACHE_MAX) {
    clientTtsCache.delete(clientTtsCache.keys().next().value as string);
  }
  void persistentSet(text, lang, blob); // fire-and-forget
  return blob;
}

/**
 * Warm the cache for a line we're about to need (e.g. the next question) so it
 * plays instantly. Fire-and-forget; failures are ignored.
 */
export function prefetchTTS(text: string, lang = "en-IN"): void {
  if (!text.trim() || typeof window === "undefined") return;
  void fetchTTS(normalizeForSpeech(text), lang).catch(() => {});
}

/** Speak one line via the cloud proxy. Rejects (to trigger fallback) on failure. */
function playServerTTS(text: string, lang: string, rate: number, myGen: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fetchTTS(text, lang)
      .then((blob) => {
        if (jobCancelled(myGen)) return resolve();
        const url = URL.createObjectURL(blob);
        const el = getTtsAudioEl();
        activeAudio = el;
        let settled = false;
        const done = (cb: () => void) => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          el.onended = el.onerror = el.onpause = null;
          if (activeAudio === el) activeAudio = null;
          cb();
        };
        el.src = url;
        el.playbackRate = Math.min(2, Math.max(0.5, rate));
        try {
          (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        } catch {}
        el.onended = () => done(resolve);
        el.onerror = () => done(() => reject(new Error("audio-error")));
        // hardStopPlayback() pauses this element on interrupt; a pause before
        // the natural end means we were superseded — resolve, don't wedge.
        el.onpause = () => {
          if (!el.ended) done(resolve);
        };
        el.play().catch((err) => done(() => reject(err)));
      })
      .catch(reject);
  });
}

export interface SpeakOptions {
  rateScale?: number;
  pitch?: number;
  interrupt?: boolean;
  voiceURI?: string;
}

export type SpeechListener = (text: string) => void;
const speechListeners = new Set<SpeechListener>();

export function addSpeechListener(listener: SpeechListener): () => void {
  speechListeners.add(listener);
  return () => {
    speechListeners.delete(listener);
  };
}

export function removeSpeechListener(listener: SpeechListener): void {
  speechListeners.delete(listener);
}

export type TtsStateListener = (active: boolean) => void;
const ttsStateListeners = new Set<TtsStateListener>();
let isTtsActive = false;

export function addTtsStateListener(listener: TtsStateListener): () => void {
  ttsStateListeners.add(listener);
  listener(isTtsActive);
  return () => {
    ttsStateListeners.delete(listener);
  };
}

function setTtsActive(active: boolean) {
  isTtsActive = active;
  ttsStateListeners.forEach((l) => {
    try {
      l(active);
    } catch (e) {
      console.error("[TTS] State listener error:", e);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Speech queue — the single owner of audio output.                    *
 *                                                                     *
 * Every speak() enqueues a job; one worker drains the queue, so       *
 * exactly one utterance is ever audible. interrupt:true (the default) *
 * clears anything pending and aborts what's playing; interrupt:false  *
 * appends. The microphone is paused for the whole speaking burst and  *
 * resumed only once the queue fully drains — so TTS never feeds back   *
 * into recognition and voices never overlap.                          *
 * ------------------------------------------------------------------ */

const KOKORO_VOICE = "af_heart";

/**
 * Respell words the TTS engines mispronounce. Captions still show the
 * original spelling — only the audio uses the respelling.
 */
const PRONUNCIATION: [RegExp, string][] = [
  [/\bSwaram\b/gi, "Swahrum"],
];
function normalizeForSpeech(text: string): string {
  let out = text;
  for (const [re, sub] of PRONUNCIATION) out = out.replace(re, sub);
  return out;
}

interface SpeechJob {
  text: string;
  options: SpeakOptions;
  resolve: () => void;
}

let speechQueue: SpeechJob[] = [];
let queueRunning = false;

/** A render is stale (must abort) once the generation counter moves past it. */
const jobCancelled = (myGen: number) => myGen !== generation;

/** Stop every audio backend immediately. Does not touch the queue. */
function hardStopPlayback(): void {
  if (activeAudio) {
    try { activeAudio.pause(); } catch {}
    activeAudio = null;
  }
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch {}
    currentAudioSource = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {}
    stopHeartbeat();
  }
}

/** Speak text aloud. Resolves when this utterance finishes or is superseded. */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!text.trim() || typeof window === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const job: SpeechJob = { text, options, resolve };
    if (options.interrupt !== false) {
      generation += 1; // invalidate any in-flight render
      hardStopPlayback();
      const dropped = speechQueue;
      speechQueue = [];
      dropped.forEach((j) => j.resolve());
    }
    speechQueue.push(job);
    if (!queueRunning) void runSpeechQueue();
  });
}

async function runSpeechQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  pauseContinuousListening();
  setTtsActive(true);

  while (speechQueue.length > 0) {
    const job = speechQueue.shift()!;
    const myGen = (generation += 1);

    // Captions show the human-readable text, not the phonetic respelling.
    speechListeners.forEach((listener) => {
      try {
        listener(job.text);
      } catch (e) {
        console.error("[TTS] Speech listener error:", e);
      }
    });

    try {
      await renderJob(normalizeForSpeech(job.text), job.options, myGen);
    } catch (e) {
      console.warn("[TTS] render failed:", e);
    }
    job.resolve();
  }

  queueRunning = false;
  setTtsActive(false);
  resumeContinuousListening();
}

/** Render one job on the active engine, with automatic fallbacks. */
async function renderJob(text: string, options: SpeakOptions, myGen: number): Promise<void> {
  const settings = getVoiceSettings();
  const rate = Math.min(2, Math.max(0.5, settings.rate * (options.rateScale ?? 1)));

  if (settings.ttsProvider === "cloud" || settings.ttsProvider === "google") {
    try {
      await playServerTTS(text, settings.sttLang || "en-IN", rate, myGen);
      return;
    } catch (err) {
      console.warn("[TTS] Cloud voice failed, falling back to system:", err);
    }
  }

  if (settings.ttsProvider === "local") {
    const tts = kokoroModelIfReady();
    if (!tts) {
      // Not ready yet: load in the background, speak this line with the
      // system voice so the user is never left in silence.
      if (getKokoroStatus().state !== "error") void loadKokoro();
    } else {
      try {
        for (const chunk of chunkText(text)) {
          if (jobCancelled(myGen)) return;
          const result = await tts.generate(chunk, { voice: KOKORO_VOICE });
          if (jobCancelled(myGen)) return;
          await playWavBuffer(result.audio, result.sampling_rate, rate);
        }
        return;
      } catch (err) {
        handleKokoroRuntimeFailure(err);
        // fall through to the system voice for this one utterance
      }
    }
  }

  await renderSystemSpeech(text, options, myGen);
}

function renderSystemSpeech(text: string, options: SpeakOptions, myGen: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    initVoices();
    const settings = getVoiceSettings();
    const { rateScale = 1, pitch = 1 } = options;
    const voice = options.voiceURI
      ? (listVoices().find((v) => v.voiceURI === options.voiceURI) ?? getStickyVoice())
      : getStickyVoice();

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      resolve();
      return;
    }

    let remaining = chunks.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      stopHeartbeat();
      resolve();
    };
    // Watchdog: Chrome sometimes never fires onend. Resolve anyway so the
    // queue can't wedge on a stuck utterance.
    const guard = setTimeout(finish, chunks.reduce((acc, c) => acc + c.length * 90 + 2500, 0));

    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = Math.min(2, Math.max(0.5, settings.rate * rateScale));
      u.pitch = pitch;
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = "en-IN";
      }
      const settle = () => {
        remaining -= 1;
        if (remaining <= 0 || jobCancelled(myGen)) finish();
      };
      u.onend = settle;
      u.onerror = settle;
      window.speechSynthesis.speak(u);
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    startHeartbeat();
  });
}

/** Spell text letter-by-letter, e.g. "PARISH" -> "P, A, R, I, S, H". */
export function spellOut(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split("")
    .map((ch) => (ch === " " ? "space" : ch.toUpperCase()))
    .join(", ");
}

/** Speak text spelled letter-by-letter, slower for clarity. */
export function speakSpelled(text: string, options: SpeakOptions = {}): Promise<void> {
  return speak(spellOut(text), { rateScale: 0.72, ...options });
}

/** Stop all speech now and drop anything queued. */
export function cancelSpeech(): void {
  generation += 1; // invalidate the in-flight render
  hardStopPlayback();
  const dropped = speechQueue;
  speechQueue = [];
  dropped.forEach((j) => j.resolve());
  if (!queueRunning) {
    // Nothing is draining the queue, so tidy up directly.
    setTtsActive(false);
    resumeContinuousListening();
  }
  // If the queue worker is running it will observe the empty queue,
  // exit, flip TTS state off, and resume the mic itself.
}

export function isSpeaking(): boolean {
  return queueRunning || isTtsActive;
}

/** True once the user has interacted, i.e. speech won't be autoplay-blocked. */
export function speechUnlocked(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation ? activation.hasBeenActive : true;
}

/** Play a silent utterance synchronously on a user gesture to unlock Safari TTS */
export function unlockSafariSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    console.log("[TTS] Safari SpeechSynthesis unlocked successfully.");
  } catch (e) {
    console.warn("[TTS] Failed to unlock Safari SpeechSynthesis:", e);
  }
}

// Debug/e2e handle: lets tests drive the speech queue with precise timing.
// Namespaced and harmless — this is a client-side accessibility assistant.
if (typeof window !== "undefined") {
  (window as unknown as { __swaramTTS?: unknown }).__swaramTTS = {
    speak,
    cancelSpeech,
    isSpeaking,
    queueLength: () => speechQueue.length,
  };
}
