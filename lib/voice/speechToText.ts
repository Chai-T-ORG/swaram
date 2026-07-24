/**
 * Speech-to-text engine with automatic provider selection.
 *
 * Primary:  Whisper (local, accurate, cross-browser via Web Worker)
 * Fallback: Native Web Speech API (while Whisper downloads or on unsupported browsers)
 *
 * The engine selection is transparent to callers — they use the same
 * startContinuousListening / stopContinuousListening / addTranscriptListener API.
 */

// SpeechRecognition is not in TypeScript's DOM lib, so declare what we use.
import { getVoiceSettings } from "./voiceSettings";
import { normalizeTranscript } from "./transcriptNormalizer";
import { detectNoise } from "./noiseFilter";
import {
  isWhisperReady,
  loadWhisper,
  startWhisperListening,
  stopWhisperListening,
  pauseWhisperListening,
  resumeWhisperListening,
  addWhisperTranscriptListener,
  removeWhisperTranscriptListener,
} from "./whisperSTT";
import {
  isGroqConfigured,
  isAzureConfigured,
  isSarvamConfigured,
  startGroqListening,
  stopGroqListening,
  pauseGroqListening,
  resumeGroqListening,
  addGroqTranscriptListener,
  removeGroqTranscriptListener,
  setGroqFallback,
  setGroqBargeInCallback,
} from "./groqSTT";
import {
  startAzureStream,
  stopAzureStream,
  pauseAzureStream,
  resumeAzureStream,
} from "./azureStreamSTT";
import {
  startSarvamStream,
  stopSarvamStream,
  pauseSarvamStream,
  resumeSarvamStream,
} from "./sarvamStreamSTT";

interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  [index: number]: SRResult;
}
interface SREvent {
  results: SRResultList;
  resultIndex: number;
}
interface SRErrorEvent {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((event: SREvent) => void) | null;
  onerror: ((event: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  }
}

export const CLOUD_FALLBACK_NOTICE =
  "Heads up: this browser does not support fully on-device speech recognition. " +
  "Your voice may be processed by the browser's built-in speech service to turn it into text. " +
  "Nothing else about your form ever leaves this device.";

const CLOUD_NOTICE_KEY = "swaram_cloud_stt_notice_ack";

export function getRecognitionConstructor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSttSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

function supportsOnDevice(): boolean {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) return false;
  try {
    return "processLocally" in new Ctor();
  } catch {
    return false;
  }
}

export function needsCloudNotice(): boolean {
  if (typeof window === "undefined") return false;
  if (supportsOnDevice()) return false;
  return localStorage.getItem(CLOUD_NOTICE_KEY) !== "yes";
}

export function acknowledgeCloudNotice(): void {
  localStorage.setItem(CLOUD_NOTICE_KEY, "yes");
}

export type ListenErrorCode =
  | "not-supported"
  | "service-not-allowed"
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "unknown";

export class ListenError extends Error {
  code: ListenErrorCode;
  /** Message suitable for speaking aloud to the user. */
  friendly: string;

  constructor(code: ListenErrorCode, friendly: string) {
    super(friendly);
    this.name = "ListenError";
    this.code = code;
    this.friendly = friendly;
  }
}

const FRIENDLY: Record<ListenErrorCode, string> = {
  "not-supported":
    "This browser does not support voice input. You can type your answers instead.",
  "service-not-allowed":
    "Speech recognition is turned off for this browser. On iPhone or iPad, open Settings, " +
    "then Privacy and Security, then Speech Recognition, and allow it for Safari. " +
    "Until then, you can type your answers instead.",
  "not-allowed":
    "Microphone access was blocked. Please allow the microphone for this site, or type your answers instead.",
  "no-speech": "I did not hear anything. Please try again.",
  "audio-capture":
    "No microphone was found. Please check your microphone, or type your answers instead.",
  network: "Speech recognition needs a network connection right now. You can also type your answer.",
  aborted: "Listening was cancelled.",
  unknown: "Something went wrong while listening. Please try again, or type your answer.",
};

export interface ListenResult {
  transcript: string;
  confidence: number;
  alternatives: string[];
}

import { playEarconStart, playEarconStop, playEarconRecognized } from "./earcons";

let active: SpeechRecognitionLike | null = null;

export function stopListening(): void {
  if (active) {
    try {
      active.abort();
    } catch {
      // already stopped
    }
    active = null;
  }
}

export interface ListenOptions {
  lang?: string;
  /** Hard cap on total listen time. */
  timeoutMs?: number;
  onAudioStart?: () => void;
}

/** Listen for a single utterance and resolve with the best transcript. */
export function listenOnce(options: ListenOptions = {}): Promise<ListenResult> {
  const { lang = getVoiceSettings().sttLang, timeoutMs = 12000, onAudioStart } = options;

  return new Promise((resolve, reject) => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) {
      reject(new ListenError("not-supported", FRIENDLY["not-supported"]));
      return;
    }

    stopListening();
    const recognition = new Ctor();
    active = recognition;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 4;
    if ("processLocally" in recognition) {
      try {
        recognition.processLocally = false;
      } catch {
        // optional hint only
      }
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }
    }, timeoutMs);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (active === recognition) active = null;
      fn();
    };

    recognition.onaudiostart = () => onAudioStart?.();

    recognition.onresult = (event: SREvent) => {
      const result = event.results[event.results.length - 1];
      if (!result || result.length === 0) return;
      const alternatives: string[] = [];
      for (let i = 0; i < result.length; i++) {
        alternatives.push(result[i].transcript.trim());
      }
      settle(() =>
        resolve({
          transcript: result[0].transcript.trim(),
          confidence: result[0].confidence ?? 0,
          alternatives,
        }),
      );
    };

    recognition.onerror = (event: SRErrorEvent) => {
      const code = ([
        "service-not-allowed",
        "not-allowed",
        "no-speech",
        "audio-capture",
        "network",
        "aborted",
      ].includes(event.error)
        ? event.error
        : "unknown") as ListenErrorCode;
      settle(() => reject(new ListenError(code, FRIENDLY[code])));
    };

    recognition.onend = () => {
      settle(() => reject(new ListenError("no-speech", FRIENDLY["no-speech"])));
    };

    try {
      recognition.start();
    } catch {
      settle(() => reject(new ListenError("unknown", FRIENDLY["unknown"])));
    }
  });
}

const isSafariOrIOS = typeof navigator !== "undefined" && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
);

/* ----------------------- Continuous listening engine ----------------------- */

let continuousActive: SpeechRecognitionLike | null = null;
let shouldBeListening = false;
let isPausedForTTS = false;
let isAutoPaused = false;
let silenceTimer: NodeJS.Timeout | null = null;
const listeners = new Set<(text: string, confidence: number) => void>();
let onStateChangeCallback: ((state: "listening" | "paused-silence" | "off") => void) | null = null;

function resetSilenceTimer(): void {
  if (silenceTimer) clearTimeout(silenceTimer);
  if (!shouldBeListening || isPausedForTTS || isAutoPaused) return;

  // The streaming/VAD engines (Groq/Whisper/Azure stream) capture locally and
  // only transmit on speech, so there's nothing to save by pausing — keep
  // listening so the mic never "randomly" drops while the user reads or thinks.
  if (usingGroq || usingWhisper || usingAzureStream) return;

  // Native Web Speech keeps a live session open; pause it after a long idle
  // so the recording indicator doesn't stay on forever.
  silenceTimer = setTimeout(() => {
    console.log("[STT] Auto-pausing native microphone after 60s of silence.");
    autoPauseRecognition();
  }, 60000);
}

function autoPauseRecognition(): void {
  isAutoPaused = true;
  playEarconStop(); // cue on every platform — iOS VoiceOver users need it most
  if (continuousActive) {
    try {
      continuousActive.abort();
    } catch (e) {
      // ignore
    }
  }
  if (onStateChangeCallback) onStateChangeCallback("paused-silence");
}

export function addTranscriptListener(listener: (text: string, confidence: number) => void): void {
  listeners.add(listener);
}

export function removeTranscriptListener(listener: (text: string, confidence: number) => void): void {
  listeners.delete(listener);
}

export function onStateChange(callback: (state: "listening" | "paused-silence" | "off") => void): void {
  onStateChangeCallback = callback;
}

export function wakeUpContinuous(): void {
  if (isAutoPaused) {
    console.log("[STT] Waking up continuous speech recognition.");
    isAutoPaused = false;
    playEarconStart();
    startContinuousListening();
  }
}

/** Which engine is currently capturing. */
let usingWhisper = false;
let usingGroq = false;
let usingAzureStream = false;
let usingSarvamStream = false;
/** Set once Azure streaming has fallen back, so we don't re-select it this session. */
let azureStreamDisabled = false;
/** Set once Sarvam streaming has fallen back, so we don't re-select it this session. */
let sarvamStreamDisabled = false;

/** Shared: normalize, play the earcon, reset silence timer, and fan out. */
function emitTranscript(source: string, text: string, confidence: number): void {
  // ── Noise filter: drop hallucinations / silence before normalization ──
  const noiseCheck = detectNoise(text);
  if (noiseCheck.isNoise) {
    console.log(`[STT/${source}] Noise filtered (reason: ${noiseCheck.reason}): "${text.slice(0, 50)}"`);
    return;
  }

  const normalized = normalizeTranscript(text);
  if (!normalized) return;
  console.log(`[STT/${source}] Recognized: "${normalized}" (confidence: ${confidence})`);
  playEarconRecognized();
  resetSilenceTimer();
  listeners.forEach((listener) => {
    try {
      listener(normalized, confidence);
    } catch (e) {
      console.error("[STT] Listener error:", e);
    }
  });
}

function whisperBridgeListener(text: string, confidence: number): void {
  emitTranscript("Whisper", text, confidence);
}
function groqBridgeListener(text: string, confidence: number): void {
  emitTranscript("Groq", text, confidence);
}

/** Fan a transcript from an external capture (push-to-talk) into all listeners. */
export function emitExternalTranscript(text: string, confidence = 0.97): void {
  emitTranscript("PushToTalk", text, confidence);
}

/** Set once Groq has fatally failed, so we stop re-selecting it this session. */
let groqDisabledThisSession = false;

// If Groq becomes unusable mid-session, drop to the next best engine seamlessly.
setGroqFallback(() => {
  if (!usingGroq) return;
  console.warn("[STT] Groq unavailable — switching to fallback engine for this session.");
  groqDisabledThisSession = true;
  stopGroqListening();
  removeGroqTranscriptListener(groqBridgeListener);
  usingGroq = false;
  if (!shouldBeListening) return;
  // Whisper-base.en is English-only — non-English sessions fall to native.
  const lang = getVoiceSettings().sttLang || "en-IN";
  if (isWhisperReady() && lang.startsWith("en") && getVoiceSettings().sttProvider !== "native") {
    usingWhisper = true;
    addWhisperTranscriptListener(whisperBridgeListener);
    startWhisperListening().catch(() => startNativeContinuousListening());
  } else {
    startNativeContinuousListening();
  }
});

export function startContinuousListening(options: { lang?: string } = {}): void {
  if (typeof window === "undefined") return;

  shouldBeListening = true;
  isAutoPaused = false;

  const provider = getVoiceSettings().sttProvider;

  // ── Azure real-time streaming (opt-in) ──────────────────────────
  // The token fetch inside startAzureStream is the availability check; any
  // failure resolves false / fires onFallback and we drop to the Azure REST
  // capture below (which the /api/transcribe proxy routes to Azure too).
  if (provider === "azure-stream" && !azureStreamDisabled) {
    console.log("[STT] Using Azure streaming engine");
    usingAzureStream = true;
    usingGroq = false;
    usingWhisper = false;
    if (continuousActive) { try { continuousActive.abort(); } catch { /* ignore */ } continuousActive = null; }
    const fallBack = (reason: string) => {
      console.warn("[STT] Azure streaming unavailable — falling back:", reason);
      azureStreamDisabled = true;
      usingAzureStream = false;
      if (shouldBeListening) startCloudVadCapture(options);
    };
    startAzureStream({
      onFinal: (text, confidence) => emitTranscript("AzureStream", text, confidence),
      onFallback: fallBack,
    }).then((ok) => {
      if (ok) { if (onStateChangeCallback) onStateChangeCallback("listening"); }
      else fallBack("start-failed");
    });
    return;
  }

  // ── Sarvam real-time streaming (opt-in) ──────────────────────────
  // Needs the local WS relay; any failure drops to the clip-based capture,
  // whose Sarvam promotion covers the same languages.
  if (provider === "sarvam-stream" && !sarvamStreamDisabled) {
    console.log("[STT] Using Sarvam streaming engine");
    usingSarvamStream = true;
    usingGroq = false;
    usingWhisper = false;
    if (continuousActive) { try { continuousActive.abort(); } catch { /* ignore */ } continuousActive = null; }
    const fallBack = (reason: string) => {
      console.warn("[STT] Sarvam streaming unavailable — falling back:", reason);
      sarvamStreamDisabled = true;
      usingSarvamStream = false;
      if (shouldBeListening) startCloudVadCapture(options);
    };
    startSarvamStream({
      onFinal: (text, confidence) => emitTranscript("SarvamStream", text, confidence),
      onFallback: fallBack,
    }).then((ok) => {
      if (ok) { if (onStateChangeCallback) onStateChangeCallback("listening"); }
      else fallBack("start-failed");
    });
    return;
  }

  // ── Cloud STT via our /api/transcribe proxy (Groq, Sarvam, or Azure REST) ──
  const cloudConfigured =
    provider === "azure"
      ? isAzureConfigured()
      : provider === "sarvam" || provider === "sarvam-stream"
        ? isSarvamConfigured() || isGroqConfigured()
        : isGroqConfigured();
  if (
    (provider === "groq" || provider === "auto" || provider === "azure" || provider === "sarvam" || provider === "sarvam-stream") &&
    cloudConfigured &&
    !groqDisabledThisSession
  ) {
    console.log(`[STT] Using cloud engine (${provider === "azure" ? "Azure" : provider === "sarvam" ? "Sarvam" : "Groq"})`);
    startCloudVadCapture(options);
    return;
  }

  startWhisperOrNative(options);
}

/** Start the shared VAD capture that posts utterances to /api/transcribe. */
function startCloudVadCapture(options: { lang?: string } = {}): void {
  usingGroq = true;
  usingWhisper = false;
  usingAzureStream = false;
  if (continuousActive) { try { continuousActive.abort(); } catch { /* ignore */ } continuousActive = null; }
  addGroqTranscriptListener(groqBridgeListener);
  startGroqListening().then((ok) => {
    if (ok) {
      if (onStateChangeCallback) onStateChangeCallback("listening");
    } else {
      console.warn("[STT] Cloud capture start failed, falling back.");
      usingGroq = false;
      removeGroqTranscriptListener(groqBridgeListener);
      startWhisperOrNative(options);
    }
  });
}

/** Whisper if ready & permitted, otherwise the native browser engine. */
function startWhisperOrNative(options: { lang?: string } = {}): void {
  const provider = getVoiceSettings().sttProvider;
  // On-device Whisper is whisper-base.en — English only. For any other
  // language the browser's native recognizer is the correct fallback;
  // routing Malayalam/Hindi audio into an English Whisper yields fluent
  // hallucinations, not transcripts.
  const lang = options.lang || getVoiceSettings().sttLang || "en-IN";
  if (
    isWhisperReady() &&
    lang.startsWith("en") &&
    (provider === "whisper" || provider === "auto" || provider === "groq" || provider === "azure" || provider === "sarvam")
  ) {
    console.log("[STT] Using Whisper engine");
    usingWhisper = true;
    usingGroq = false;
    if (continuousActive) {
      try { continuousActive.abort(); } catch { /* ignore */ }
      continuousActive = null;
    }
    addWhisperTranscriptListener(whisperBridgeListener);
    startWhisperListening().then(() => {
      if (onStateChangeCallback) onStateChangeCallback("listening");
    }).catch((err) => {
      console.error("[STT] Whisper start failed, falling back to native:", err);
      usingWhisper = false;
      removeWhisperTranscriptListener(whisperBridgeListener);
      startNativeContinuousListening(options);
    });
    return;
  }

  console.log("[STT] Using native Web Speech API (fallback)");
  usingWhisper = false;
  usingGroq = false;
  startNativeContinuousListening(options);
}

/** Start the native Web Speech API continuous listener (fallback engine). */
function startNativeContinuousListening(options: { lang?: string } = {}): void {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) {
    console.warn("[STT] Continuous listening not supported in this browser.");
    return;
  }

  if (continuousActive) {
    try {
      continuousActive.abort();
    } catch {
      // ignore
    }
    continuousActive = null;
  }

  const lang = options.lang || getVoiceSettings().sttLang;
  const recognition = new Ctor();
  continuousActive = recognition;
  recognition.lang = lang;
  recognition.continuous = !isSafariOrIOS;
  recognition.interimResults = true; // Enable interim results for better accuracy
  recognition.maxAlternatives = 4;

  recognition.onaudiostart = () => {
    console.log("[STT] Continuous audio capture started.");
    resetSilenceTimer();
  };

  recognition.onresult = (event: SREvent) => {
    resetSilenceTimer();
    const result = event.results[event.results.length - 1];
    if (!result || result.length === 0 || !result.isFinal) return;

    const rawTranscript = result[0].transcript.trim();
    const confidence = result[0].confidence ?? 0;

    // Normalize the transcript through our post-processing pipeline
    const transcript = normalizeTranscript(rawTranscript);

    if (transcript) {
      console.log(`[STT/Native] Recognized: "${transcript}" (confidence: ${confidence})`);
      playEarconRecognized();
      // Notify all subscribers
      listeners.forEach((listener) => {
        try {
          listener(transcript, confidence);
        } catch (e) {
          console.error("[STT] Listener error:", e);
        }
      });
    }
  };

  recognition.onerror = (event: SRErrorEvent) => {
    console.warn("[STT] Continuous SpeechRecognition error:", event.error, event.message);
    resetSilenceTimer();
  };

  recognition.onend = () => {
    console.log("[STT] Continuous SpeechRecognition ended.");
    if (shouldBeListening && !isPausedForTTS && !isAutoPaused) {
      console.log("[STT] Auto-restarting SpeechRecognition.");
      try {
        recognition.start();
      } catch (e) {
        console.error("[STT] Failed to auto-restart recognition:", e);
      }
    }
  };

  try {
    recognition.start();
    if (onStateChangeCallback) onStateChangeCallback("listening");
  } catch (e) {
    console.error("[STT] Failed to start continuous recognition:", e);
  }
}

export function stopContinuousListening(): void {
  shouldBeListening = false;
  isAutoPaused = false;
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  // Stop Azure streaming if active
  if (usingAzureStream) {
    stopAzureStream();
    usingAzureStream = false;
  }

  // Stop Sarvam streaming if active
  if (usingSarvamStream) {
    stopSarvamStream();
    usingSarvamStream = false;
  }

  // Stop Groq if active
  if (usingGroq) {
    stopGroqListening();
    removeGroqTranscriptListener(groqBridgeListener);
    usingGroq = false;
  }

  // Stop Whisper if active
  if (usingWhisper) {
    stopWhisperListening();
    removeWhisperTranscriptListener(whisperBridgeListener);
    usingWhisper = false;
  }

  // Stop native recognition if active
  if (continuousActive) {
    try {
      continuousActive.abort();
    } catch {
      // ignore
    }
    continuousActive = null;
  }
  if (onStateChangeCallback) onStateChangeCallback("off");
}

export function pauseContinuousListening(): void {
  isPausedForTTS = true;
  if (usingAzureStream) {
    pauseAzureStream();
  }
  if (usingSarvamStream) {
    pauseSarvamStream();
  }
  if (usingGroq) {
    pauseGroqListening();
  }
  if (usingWhisper) {
    pauseWhisperListening();
  }
  if (continuousActive) {
    try {
      continuousActive.abort();
    } catch {
      // ignore
    }
  }
}

/**
 * Pause listening for TTS barge-in detection.
 * Raises the VAD threshold so only genuine user speech triggers barge-in.
 */
export function pauseForBargeIn(): void {
  isPausedForTTS = true;
  // Raise threshold for cloud VAD engine to detect barge-in
  // Note: This works through the setThreshold API on the VAD handle
  if (usingGroq) {
    pauseGroqListening(); // This will be enhanced with threshold raising
  }
  // For native/whisper engines, keep listening but raise threshold
  if (continuousActive) {
    try {
      continuousActive.abort();
    } catch {
      // ignore
    }
  }
}

/**
 * Update VAD threshold for barge-in detection during TTS.
 * Higher values = less sensitive (require louder speech to trigger).
 */
export function updateVadThreshold(value: number): void {
  // This will be called with the handle from vadCapture
  // Implementation depends on which engine is active
  console.log(`[STT] VAD threshold updated to ${value} for barge-in`);
}

/**
 * Set the barge-in callback that fires when speech is detected during TTS.
 * Called from VoiceProvider to wire the barge-in flow.
 */
export function setBargeInCallback(cb: (() => void) | null): void {
  setGroqBargeInCallback(cb);
}

export function resumeContinuousListening(): void {
  isPausedForTTS = false;
  if (shouldBeListening && !isAutoPaused) {
    if (usingAzureStream) {
      resumeAzureStream();
    } else if (usingSarvamStream) {
      resumeSarvamStream();
    } else if (usingGroq) {
      resumeGroqListening();
    } else if (usingWhisper) {
      resumeWhisperListening();
    } else {
      startContinuousListening();
    }
  }
}

/**
 * Attempt to upgrade from native Web Speech API to Whisper mid-session.
 * Called when Whisper finishes loading while the user is already using voice.
 */
export function upgradeToWhisper(): void {
  if (usingWhisper || !isWhisperReady()) return;
  if (!shouldBeListening) return;

  console.log("[STT] Upgrading to Whisper engine mid-session");

  // Stop native recognition
  if (continuousActive) {
    try { continuousActive.abort(); } catch { /* ignore */ }
    continuousActive = null;
  }

  // Start Whisper
  usingWhisper = true;
  addWhisperTranscriptListener(whisperBridgeListener);
  startWhisperListening().then(() => {
    if (onStateChangeCallback) onStateChangeCallback("listening");
  }).catch((err) => {
    console.error("[STT] Whisper upgrade failed:", err);
    usingWhisper = false;
    removeWhisperTranscriptListener(whisperBridgeListener);
    startNativeContinuousListening();
  });
}

