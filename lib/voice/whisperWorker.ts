/**
 * whisperWorker.ts — Web Worker for Whisper speech recognition.
 *
 * Runs the @huggingface/transformers Whisper pipeline off the main thread.
 * Receives Float32Array audio chunks and returns transcripts.
 *
 * This file is loaded as a Web Worker via `new Worker(new URL(...))`.
 */

// Message types from main thread → worker
import { pipeline as createPipeline, env } from "@huggingface/transformers";

interface LoadMessage {
  type: "load";
  model: string;
  device: "webgpu" | "wasm";
  dtype: "fp32" | "q8" | "fp16";
}

interface TranscribeMessage {
  type: "transcribe";
  audio: Float32Array;
  language: string;
  id: number; // request ID for matching responses
}

type InMessage = LoadMessage | TranscribeMessage;

// Message types from worker → main thread
interface ProgressMessage {
  type: "progress";
  progress: number;
  detail: string;
  file?: string;
  loaded?: number;
  total?: number;
}

interface ReadyMessage {
  type: "ready";
}

interface TranscriptMessage {
  type: "transcript";
  id: number;
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
}

interface ErrorMessage {
  type: "error";
  message: string;
  id?: number;
}

type OutMessage = ProgressMessage | ReadyMessage | TranscriptMessage | ErrorMessage;

// ─── Worker State ──────────────────────────────────────────────────────

let pipeline: any = null;
let isLoading = false;

// ─── Message Handler ───────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "load":
      await handleLoad(msg);
      break;
    case "transcribe":
      await handleTranscribe(msg);
      break;
  }
};

async function handleLoad(msg: LoadMessage): Promise<void> {
  if (pipeline || isLoading) return;
  isLoading = true;

  try {
    post({ type: "progress", progress: 0, detail: "Loading Whisper engine…" });

    // Configure ONNX runtime
    if (env?.backends?.onnx) {
      env.backends.onnx.logLevel = "error";
    }

    // Track per-file download progress
    const fileProgress = new Map<string, { loaded: number; total: number }>();

    const progressCallback = (event: any) => {
      if (event.status === "progress" && event.file && event.total) {
        fileProgress.set(event.file, {
          loaded: event.loaded ?? 0,
          total: event.total,
        });

        let loaded = 0;
        let total = 0;
        for (const f of fileProgress.values()) {
          loaded += f.loaded;
          total += f.total;
        }

        // Don't report misleading early 100% from tiny config files
        if (total < 1_000_000) return;

        const progress = total > 0 ? loaded / total : 0;
        post({
          type: "progress",
          progress,
          detail: `Downloading speech model — ${Math.round(progress * 100)}%`,
          file: event.file,
          loaded: event.loaded,
          total: event.total,
        });
      } else if (event.status === "initiate") {
        post({
          type: "progress",
          progress: 0,
          detail: `Preparing ${event.file ?? "model files"}…`,
        });
      } else if (event.status === "done") {
        // Individual file done — don't update overall progress here
      }
    };

    // Create the ASR pipeline
    post({ type: "progress", progress: 0.95, detail: "Initializing speech model…" });

    pipeline = await createPipeline(
      "automatic-speech-recognition",
      msg.model,
      {
        dtype: msg.dtype,
        device: msg.device,
        progress_callback: progressCallback,
      },
    );

    // Warm up with a tiny silent buffer
    post({ type: "progress", progress: 0.98, detail: "Warming up speech recognition…" });
    try {
      const silence = new Float32Array(16000); // 1 second of silence at 16kHz
      await Promise.race([
        pipeline(silence, { language: "en", return_timestamps: false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Warm-up timeout")), 8000),
        ),
      ]);
    } catch {
      // Warm-up is best-effort — skip on timeout (Safari WASM can be slow)
      console.warn("[WhisperWorker] Warm-up skipped (timeout or error)");
    }

    isLoading = false;
    post({ type: "ready" });
  } catch (err: any) {
    isLoading = false;
    pipeline = null;
    post({ type: "error", message: err?.message ?? "Failed to load Whisper model" });
  }
}

async function handleTranscribe(msg: TranscribeMessage): Promise<void> {
  if (!pipeline) {
    post({ type: "error", message: "Whisper model not loaded", id: msg.id });
    return;
  }

  try {
    const result = await pipeline(msg.audio, {
      language: "en",
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = typeof result === "string"
      ? result
      : (result as any)?.text ?? "";

    post({
      type: "transcript",
      id: msg.id,
      text: text.trim(),
      chunks: (result as any)?.chunks,
    });
  } catch (err: any) {
    post({
      type: "error",
      message: err?.message ?? "Transcription failed",
      id: msg.id,
    });
  }
}

function post(msg: OutMessage): void {
  self.postMessage(msg);
}
