/**
 * azureStreamSTT.ts — real-time streaming speech-to-text via the Azure Speech
 * SDK (opt-in "azure-stream" provider).
 *
 * Streaming returns words as they're spoken and lets us bias recognition with a
 * phrase list of the command words. It recognizes in the user's SELECTED
 * language (fast and reliable) rather than auto-detecting every utterance —
 * language is changed by voice command ("speak in Malayalam").
 *
 * Safety: the SDK is lazy-loaded, the connection uses a short-lived token
 * (never the key), and audio is pushed from the app's SINGLE shared microphone
 * stream — the SDK never opens its own mic. Any failure resolves to `false` /
 * fires onFallback, and the caller drops back to the non-streaming paths.
 */
import type * as SpeechSDKType from "microsoft-cognitiveservices-speech-sdk";
import { getStream, initMic } from "./micManager";
import { getVoiceSettings } from "./voiceSettings";
import { INTL_KEYWORDS } from "./intlCommands";
import { knownNames } from "./nameDictionary";

export interface AzureStreamHandlers {
  onFinal: (text: string, confidence: number) => void;
  onInterim?: (text: string) => void;
  onFallback: (reason: string) => void;
}

/* --------------------------- diagnostics ---------------------------------- */
// The streaming path is designed to fail soft, which makes "it didn't work"
// invisible. These let the UI surface *why* (a toast) so problems are debuggable.
type DiagListener = (msg: string, isError: boolean) => void;
const diagListeners = new Set<DiagListener>();
export function onAzureStreamDiag(l: DiagListener): () => void {
  diagListeners.add(l);
  return () => diagListeners.delete(l);
}
function diag(msg: string, isError = false): void {
  if (isError) console.warn("[AzureStream] " + msg);
  else console.log("[AzureStream] " + msg);
  for (const l of diagListeners) {
    try { l(msg, isError); } catch { /* ignore */ }
  }
}

let SDK: typeof SpeechSDKType | null = null;
async function loadSdk(): Promise<typeof SpeechSDKType> {
  if (!SDK) SDK = await import("microsoft-cognitiveservices-speech-sdk");
  return SDK;
}

let recognizer: SpeechSDKType.SpeechRecognizer | null = null;
let pushStream: SpeechSDKType.PushAudioInputStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let paused = false;
let handlers: AzureStreamHandlers | null = null;

export function isAzureStreamRunning(): boolean {
  return running;
}

/** The Azure locale to recognize in — the user's selected assistant language. */
function selectedLocale(): string {
  return getVoiceSettings().sttLang || "en-IN";
}

/**
 * Command words across all languages, so Azure hears them crisply — plus the
 * user's previously-confirmed names, so "Twinsha Thilakan" is biased toward
 * the exact spelling they already approved.
 */
function commandPhrases(): string[] {
  const english = [
    "skip", "next", "repeat", "again", "go back", "previous", "change",
    "yes", "no", "correct", "wrong", "help", "stop", "pause",
    "type", "spell", "upload", "scan", "profile", "home", "start", "continue",
  ];
  const intl = Object.values(INTL_KEYWORDS).flat();
  return Array.from(new Set([...english, ...intl, ...knownNames()])).slice(0, 180);
}

/* ------------------------- shared capture audio --------------------------- */
// One reused AudioContext. Reusing it (rather than new-per-session) matters on
// iOS, where a context created outside a user gesture stays suspended and no
// audio ever flows — the "real-time didn't catch anything" bug.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AC();
  }
  return sharedAudioCtx;
}

/**
 * Create/resume the capture context SYNCHRONOUSLY inside a user gesture (a tap),
 * so it's already running by the time async recognition setup attaches to it.
 * Call this from the tap handler before awaiting anything.
 */
export function primeAzureStreamAudio(): void {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* ignore */
  }
}

/** Downsample mono Float32 to 16 kHz and pack as little-endian 16-bit PCM. */
function floatTo16kPcm(input: Float32Array, srcRate: number): ArrayBuffer {
  const target = 16000;
  let samples: Float32Array;
  if (srcRate === target) {
    samples = input;
  } else {
    const ratio = srcRate / target;
    const outLen = Math.max(1, Math.round(input.length / ratio));
    samples = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = pos - i0;
      samples[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
  }
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

async function startCapture(stream: MediaStream): Promise<void> {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
  sourceNode = ctx.createMediaStreamSource(stream);
  processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    if (paused || !pushStream) return;
    const input = e.inputBuffer.getChannelData(0);
    try {
      pushStream.write(floatTo16kPcm(input, ctx.sampleRate));
    } catch {
      /* stream closed mid-write */
    }
  };
  sourceNode.connect(processor);
  processor.connect(ctx.destination);
}

function teardownCapture(): void {
  try { processor?.disconnect(); } catch { /* ignore */ }
  if (processor) processor.onaudioprocess = null;
  try { sourceNode?.disconnect(); } catch { /* ignore */ }
  processor = null;
  sourceNode = null;
  // Keep sharedAudioCtx open and running for the next press (iOS-friendly).
}

function cleanup(): void {
  running = false;
  paused = false;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  teardownCapture();
  try { pushStream?.close(); } catch { /* ignore */ }
  pushStream = null;
  const r = recognizer;
  recognizer = null;
  if (r) {
    try {
      r.stopContinuousRecognitionAsync(
        () => { try { r.close(); } catch { /* ignore */ } },
        () => { try { r.close(); } catch { /* ignore */ } },
      );
    } catch { /* ignore */ }
  }
}

async function fetchToken(): Promise<{ token: string; region: string } | null> {
  try {
    const res = await fetch("/api/speech/token");
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      diag(`token request failed (${res.status} ${body.error ?? ""} ${body.detail ?? ""})`.trim(), true);
      return null;
    }
    const data = (await res.json()) as { token?: string; region?: string };
    if (!data.token || !data.region) {
      diag("token response missing token/region", true);
      return null;
    }
    return { token: data.token, region: data.region };
  } catch (err) {
    diag("token request threw: " + (err instanceof Error ? err.message : String(err)), true);
    return null;
  }
}

/**
 * Begin streaming recognition. Emits interim + final transcripts through the
 * handlers. Resolves false on any setup failure so the caller can fall back.
 */
export async function startAzureStream(h: AzureStreamHandlers): Promise<boolean> {
  if (running) return true;
  try {
    diag("starting…");
    primeAzureStreamAudio(); // resume the context early

    let sdk: typeof SpeechSDKType;
    try {
      sdk = await loadSdk();
    } catch (err) {
      diag("SDK failed to load: " + (err instanceof Error ? err.message : String(err)), true);
      return false;
    }

    const cred = await fetchToken();
    if (!cred) return false; // fetchToken already reported why

    let stream = getStream();
    if (!stream) stream = await initMic();
    if (!stream) {
      diag("microphone unavailable", true);
      return false;
    }

    const locale = selectedLocale();
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(cred.token, cred.region);
    speechConfig.speechRecognitionLanguage = locale;
    speechConfig.outputFormat = sdk.OutputFormat.Simple;
    // Snappy endpointing: finalize ~0.5s after speech stops, but give the user
    // time to start talking before timing out.
    try {
      speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "500");
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "8000");
    } catch {
      /* properties are best-effort */
    }

    const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    pushStream = sdk.AudioInputStream.createPushStream(format);
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // Bias recognition toward the command vocabulary.
    const grammar = sdk.PhraseListGrammar.fromRecognizer(recognizer);
    for (const phrase of commandPhrases()) {
      if (phrase) grammar.addPhrase(phrase);
    }
    // Raise the bias weight above the 1.0 default so the user's confirmed
    // names beat their generic English homophones. Guarded — setWeight is
    // only in newer SDK builds.
    try {
      (grammar as unknown as { setWeight?: (w: number) => void }).setWeight?.(1.5);
    } catch {
      /* best-effort */
    }

    recognizer.recognizing = (_s, e) => {
      if (e.result.text) handlers?.onInterim?.(e.result.text);
    };
    recognizer.recognized = (_s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const text = (e.result.text || "").trim();
        if (text) handlers?.onFinal(text, 0.95);
      }
    };
    recognizer.canceled = (_s, e) => {
      const reason = `canceled: ${e.errorDetails || e.reason}`;
      diag(reason, true);
      cleanup();
      handlers?.onFallback(reason);
    };

    handlers = h;
    diag(`connecting (language: ${locale})…`);
    // Begin pushing audio BEFORE the recognition handshake resolves: the push
    // stream buffers it, so words spoken during the ~300 ms connect aren't lost
    // (the "it misses the start of what I say" bug).
    await startCapture(stream);
    await new Promise<void>((resolve, reject) => {
      recognizer!.startContinuousRecognitionAsync(() => resolve(), (err) => reject(new Error(String(err))));
    });
    running = true;
    paused = false;
    diag("connected — listening in real time");

    // Tokens expire in ~10 min; refresh in place for long sessions.
    refreshTimer = setInterval(async () => {
      const next = await fetchToken();
      if (next && recognizer) recognizer.authorizationToken = next.token;
    }, 8 * 60 * 1000);

    return true;
  } catch (err) {
    diag("setup failed: " + (err instanceof Error ? err.message : String(err)), true);
    cleanup();
    return false;
  }
}

/** Preload the SDK + token (and unlock audio) so the first press connects fast. */
export async function warmAzureStream(): Promise<void> {
  try {
    await loadSdk();
    await fetchToken();
  } catch {
    /* best effort */
  }
}

export function stopAzureStream(): void {
  handlers = null;
  cleanup();
}

/** Mute the mic feed (e.g. while the assistant is speaking) without dropping the connection. */
export function pauseAzureStream(): void {
  paused = true;
}

export function resumeAzureStream(): void {
  paused = false;
}
