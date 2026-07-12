/**
 * whisperSTT.ts — Main-thread bridge to the Whisper Web Worker.
 *
 * Captures audio from the shared micManager stream, performs Voice Activity
 * Detection (VAD), and sends speech segments to the Whisper worker for
 * transcription. Exposes a listener-based API compatible with the existing
 * STT infrastructure.
 *
 * Works on Chrome (WebGPU), Safari (WASM), desktop & mobile.
 */

import { getStream, initMic } from "./micManager";
import {
  getDeviceConfig,
  updateSttProgress,
  markSttReady,
  markSttError,
  registerRetryCallback,
} from "./modelManager";

// ─── Types ─────────────────────────────────────────────────────────────

type TranscriptListener = (text: string, confidence: number) => void;

interface WorkerMessage {
  type: "progress" | "ready" | "transcript" | "error";
  progress?: number;
  detail?: string;
  id?: number;
  text?: string;
  message?: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
}

// ─── State ─────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let workerReady = false;
let workerLoading = false;

let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processorNode: ScriptProcessorNode | null = null;

let isListening = false;
let isPaused = false;

const transcriptListeners = new Set<TranscriptListener>();
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>();

// VAD state
let audioBuffer: Float32Array[] = [];
let silenceFrames = 0;
let speechFrames = 0;
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 4096;           // samples per processing frame
const SPEECH_THRESHOLD = 0.015;    // energy threshold for speech detection
const MIN_SPEECH_FRAMES = 3;       // minimum frames to consider as speech
const MAX_SILENCE_FRAMES = 15;     // frames of silence before flushing
const MAX_BUFFER_SECONDS = 10;     // max audio buffer before forced flush
const MAX_BUFFER_FRAMES = Math.ceil((MAX_BUFFER_SECONDS * SAMPLE_RATE) / FRAME_SIZE);

// ─── Worker Management ─────────────────────────────────────────────────

export function isWhisperReady(): boolean {
  return workerReady;
}

export function isWhisperLoading(): boolean {
  return workerLoading;
}

export function loadWhisper(): Promise<void> {
  if (workerReady || workerLoading) return Promise.resolve();
  workerLoading = true;

  return new Promise<void>((resolve, reject) => {
    try {
      // Create the worker
      worker = new Worker(
        new URL("./whisperWorker.ts", import.meta.url)
      );

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;

        switch (msg.type) {
          case "progress":
            updateSttProgress(msg.progress ?? 0, msg.detail ?? "Loading…");
            break;

          case "ready":
            workerReady = true;
            workerLoading = false;
            markSttReady();
            resolve();
            break;

          case "transcript": {
            const text = msg.text ?? "";
            if (text && msg.id !== undefined) {
              const pending = pendingRequests.get(msg.id);
              if (pending) {
                pending.resolve(text);
                pendingRequests.delete(msg.id);
              }

              // Notify all listeners
              // Whisper doesn't provide a confidence score, so we use 0.95
              // as a default (it's consistently more accurate than Web Speech API)
              for (const listener of transcriptListeners) {
                try {
                  listener(text, 0.95);
                } catch (e) {
                  console.error("[WhisperSTT] Listener error:", e);
                }
              }
            }
            break;
          }

          case "error": {
            const errMsg = msg.message ?? "Unknown error";
            if (msg.id !== undefined) {
              const pending = pendingRequests.get(msg.id);
              if (pending) {
                pending.reject(new Error(errMsg));
                pendingRequests.delete(msg.id);
              }
            }
            if (!workerReady) {
              workerLoading = false;
              markSttError(errMsg);
              reject(new Error(errMsg));
            }
            break;
          }
        }
      };

      worker.onerror = (err) => {
        console.error("[WhisperSTT] Worker error:", err);
        workerLoading = false;
        if (!workerReady) {
          markSttError("Failed to initialize speech recognition worker");
          reject(new Error("Worker initialization failed"));
        }
      };

      // Send load command
      const config = getDeviceConfig();
      worker.postMessage({
        type: "load",
        model: "onnx-community/whisper-base.en",
        device: config.device,
        dtype: config.dtype,
      } satisfies { type: "load"; model: string; device: string; dtype: string });

    } catch (err: any) {
      workerLoading = false;
      markSttError(err?.message ?? "Failed to create worker");
      reject(err);
    }
  });
}

// Register retry callback with model manager
registerRetryCallback("stt", () => {
  worker?.terminate();
  worker = null;
  workerReady = false;
  workerLoading = false;
  loadWhisper().catch(console.error);
});

// ─── Audio Capture ─────────────────────────────────────────────────────

function resampleTo16k(audioData: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === SAMPLE_RATE) return audioData;

  const ratio = inputSampleRate / SAMPLE_RATE;
  const outputLength = Math.round(audioData.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, audioData.length - 1);
    const frac = srcIndex - srcFloor;
    output[i] = audioData[srcFloor] * (1 - frac) + audioData[srcCeil] * frac;
  }

  return output;
}

function calculateEnergy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function flushAudioBuffer(): void {
  if (audioBuffer.length === 0) return;

  // Concatenate all buffered frames
  const totalSamples = audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
  const fullBuffer = new Float32Array(totalSamples);
  let offset = 0;
  for (const buf of audioBuffer) {
    fullBuffer.set(buf, offset);
    offset += buf.length;
  }

  audioBuffer = [];
  silenceFrames = 0;
  speechFrames = 0;

  // Skip very short segments (less than 0.5 seconds)
  if (fullBuffer.length < SAMPLE_RATE * 0.5) return;

  // Send to worker
  if (worker && workerReady) {
    const id = ++requestId;
    worker.postMessage(
      { type: "transcribe", audio: fullBuffer, language: "en", id },
      [fullBuffer.buffer], // Transfer ownership for performance
    );
  }
}

function processAudioFrame(inputBuffer: Float32Array, inputSampleRate: number): void {
  if (!isListening || isPaused) return;

  const resampled = resampleTo16k(inputBuffer, inputSampleRate);
  const energy = calculateEnergy(resampled);

  if (energy > SPEECH_THRESHOLD) {
    // Speech detected
    speechFrames++;
    silenceFrames = 0;
    audioBuffer.push(resampled);
  } else {
    // Silence
    if (speechFrames >= MIN_SPEECH_FRAMES) {
      // We had speech, now counting silence
      silenceFrames++;
      audioBuffer.push(resampled); // Keep some trailing silence

      if (silenceFrames >= MAX_SILENCE_FRAMES) {
        // End of utterance — flush
        flushAudioBuffer();
      }
    } else {
      // No significant speech yet — reset
      audioBuffer = [];
      speechFrames = 0;
      silenceFrames = 0;
    }
  }

  // Force flush if buffer is too long (prevents memory buildup)
  if (audioBuffer.length >= MAX_BUFFER_FRAMES) {
    flushAudioBuffer();
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export function addWhisperTranscriptListener(listener: TranscriptListener): void {
  transcriptListeners.add(listener);
}

export function removeWhisperTranscriptListener(listener: TranscriptListener): void {
  transcriptListeners.delete(listener);
}

export async function startWhisperListening(): Promise<void> {
  if (isListening) return;
  if (!workerReady) {
    console.warn("[WhisperSTT] Worker not ready, cannot start listening");
    return;
  }

  // Ensure mic stream is available
  let stream = getStream();
  if (!stream) {
    stream = await initMic();
  }
  if (!stream) {
    console.error("[WhisperSTT] No microphone stream available");
    return;
  }

  isListening = true;
  isPaused = false;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioCtx({ sampleRate: SAMPLE_RATE });

    // If AudioContext is suspended (autoplay policy), resume it
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    sourceNode = audioContext.createMediaStreamSource(stream);

    // ScriptProcessorNode is deprecated but universally supported.
    // AudioWorklet would be better but adds complexity with the worker.
    processorNode = audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);

    processorNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      // Copy the data since the buffer is reused
      const copy = new Float32Array(input.length);
      copy.set(input);
      processAudioFrame(copy, audioContext?.sampleRate ?? SAMPLE_RATE);
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    console.log("[WhisperSTT] Listening started");
  } catch (err) {
    console.error("[WhisperSTT] Failed to start audio capture:", err);
    isListening = false;
  }
}

export function stopWhisperListening(): void {
  isListening = false;
  isPaused = false;

  // Flush any remaining audio
  if (audioBuffer.length > 0 && speechFrames >= MIN_SPEECH_FRAMES) {
    flushAudioBuffer();
  }

  // Disconnect audio nodes (but don't close the AudioContext)
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  audioBuffer = [];
  silenceFrames = 0;
  speechFrames = 0;

  console.log("[WhisperSTT] Listening stopped");
}

export function pauseWhisperListening(): void {
  isPaused = true;
  // Flush any current speech
  if (audioBuffer.length > 0 && speechFrames >= MIN_SPEECH_FRAMES) {
    flushAudioBuffer();
  }
}

export function resumeWhisperListening(): void {
  isPaused = false;
  audioBuffer = [];
  silenceFrames = 0;
  speechFrames = 0;
}

/**
 * Transcribe a single audio buffer directly (not from the mic stream).
 * Useful for transcribing recorded audio or testing.
 */
export function transcribeAudio(audio: Float32Array): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!worker || !workerReady) {
      reject(new Error("Whisper model not loaded"));
      return;
    }

    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    worker.postMessage(
      { type: "transcribe", audio, language: "en", id },
      [audio.buffer],
    );

    // Safety timeout
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Transcription timed out"));
      }
    }, 30000);
  });
}
