/**
 * modelManager.ts — Unified AI model download orchestrator.
 *
 * Manages downloading and caching of both Kokoro (TTS) and Whisper (STT)
 * models. Provides a single unified progress stream with ETA calculation
 * for the setup overlay.
 *
 * Works on Chrome (WebGPU), Safari (WASM), mobile, tablets, and desktop.
 */

import { getVoiceSettings, setVoiceSettings } from "./voiceSettings";

// ─── Types ─────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: "tts" | "stt";
  name: string;
  /** Approximate total size in bytes for ETA estimation. */
  estimatedBytes: number;
  status: "pending" | "downloading" | "warming-up" | "ready" | "error";
  progress: number; // 0..1
  detail: string;
  error?: string;
}

export interface SetupState {
  stage: "checking" | "downloading" | "ready" | "error";
  models: ModelInfo[];
  /** Overall progress 0..1 across all models. */
  overallProgress: number;
  /** Rolling average download speed in bytes/sec. */
  speed: number;
  /** Human-readable ETA string. */
  eta: string;
  /** Human-readable total size string. */
  totalSize: string;
}

type SetupListener = (state: SetupState) => void;

// ─── State ─────────────────────────────────────────────────────────────

const listeners = new Set<SetupListener>();

const ttsModel: ModelInfo = {
  id: "tts",
  name: "AI Voice (Kokoro)",
  estimatedBytes: 90_000_000,   // ~90 MB for q8 WASM
  status: "pending",
  progress: 0,
  detail: "Waiting…",
};

const sttModel: ModelInfo = {
  id: "stt",
  name: "Speech Recognition (Whisper)",
  estimatedBytes: 150_000_000,  // ~150 MB for whisper-base.en
  status: "pending",
  progress: 0,
  detail: "Waiting…",
};

let downloadStartTime = 0;
let totalBytesDownloaded = 0;
let speedSamples: number[] = [];
let lastSpeedUpdate = 0;

function getState(): SetupState {
  const models = [ttsModel, sttModel];
  const totalEstimated = models.reduce((sum, m) => sum + m.estimatedBytes, 0);

  const overallProgress = models.reduce(
    (sum, m) => sum + m.progress * (m.estimatedBytes / totalEstimated), 0,
  );

  // Calculate speed (rolling average of last 10 samples)
  const speed = speedSamples.length > 0
    ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
    : 0;

  // Calculate ETA
  const remainingBytes = totalEstimated * (1 - overallProgress);
  let eta = "Calculating…";
  if (speed > 0 && overallProgress > 0.01) {
    const seconds = Math.ceil(remainingBytes / speed);
    if (seconds < 60) {
      eta = `About ${seconds} seconds remaining`;
    } else if (seconds < 3600) {
      const mins = Math.ceil(seconds / 60);
      eta = `About ${mins} minute${mins > 1 ? "s" : ""} remaining`;
    } else {
      eta = "This may take a while…";
    }
  }

  // Determine overall stage
  const allReady = models.every((m) => m.status === "ready");
  const anyError = models.some((m) => m.status === "error");
  const anyDownloading = models.some((m) => m.status === "downloading" || m.status === "warming-up");

  const stage = allReady ? "ready"
    : anyError ? "error"
    : anyDownloading ? "downloading"
    : "checking";

  // Total size string
  const totalMB = Math.round(totalEstimated / 1_000_000);
  const totalSize = `~${totalMB} MB total`;

  return { stage, models: [...models], overallProgress, speed, eta, totalSize };
}

function notify(): void {
  const state = getState();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // listener errors must not break the manager
    }
  }
}

function updateSpeed(bytesJustLoaded: number): void {
  totalBytesDownloaded += bytesJustLoaded;
  const now = Date.now();
  if (lastSpeedUpdate === 0) {
    lastSpeedUpdate = now;
    return;
  }
  const elapsed = (now - lastSpeedUpdate) / 1000;
  if (elapsed > 0.5) {
    const currentSpeed = bytesJustLoaded / elapsed;
    speedSamples.push(currentSpeed);
    if (speedSamples.length > 10) speedSamples.shift();
    lastSpeedUpdate = now;
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export function subscribeSetup(listener: SetupListener): () => void {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export function getSetupState(): SetupState {
  return getState();
}

/** Check if all models are already cached and ready. */
export function isSetupComplete(): boolean {
  return getVoiceSettings().setupComplete;
}

/** Mark setup as complete. */
export function markSetupComplete(): void {
  setVoiceSettings({ setupComplete: true });
}

// ─── Browser Capability Detection ──────────────────────────────────────

export function supportsWebGPU(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}

export function supportsWasmSimd(): boolean {
  // WASM SIMD is supported in all modern browsers (Chrome 91+, Safari 16.4+, Firefox 89+)
  // We just need basic WASM support as a minimum
  if (typeof WebAssembly === "undefined") return false;
  return true;
}

/** Get the optimal execution config for this browser/device. */
export function getDeviceConfig(): { device: "webgpu" | "wasm"; dtype: "fp32" | "q8" | "fp16" } {
  // Safari: always WASM + q8 (no WebGPU support as of 2025)
  const isSafari = typeof navigator !== "undefined" &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isSafari || !supportsWebGPU()) {
    return { device: "wasm", dtype: "q8" };
  }

  // Chrome/Edge with WebGPU: use fp32 for best quality
  return { device: "webgpu", dtype: "fp32" };
}

// ─── TTS Model Loading ────────────────────────────────────────────────

let ttsLoadPromise: Promise<any> | null = null;

export function updateTtsProgress(progress: number, detail: string): void {
  const prevProgress = ttsModel.progress;
  ttsModel.progress = progress;
  ttsModel.detail = detail;
  ttsModel.status = progress >= 1 ? "warming-up" : "downloading";

  // Update speed estimation
  const bytesJustLoaded = (progress - prevProgress) * ttsModel.estimatedBytes;
  if (bytesJustLoaded > 0) updateSpeed(bytesJustLoaded);

  notify();
}

export function markTtsReady(): void {
  ttsModel.status = "ready";
  ttsModel.progress = 1;
  ttsModel.detail = "Ready";
  notify();
  checkAllReady();
}

export function markTtsError(message: string): void {
  ttsModel.status = "error";
  ttsModel.error = message;
  ttsModel.detail = message;
  notify();
}

// ─── STT Model Loading ────────────────────────────────────────────────

export function updateSttProgress(progress: number, detail: string): void {
  const prevProgress = sttModel.progress;
  sttModel.progress = progress;
  sttModel.detail = detail;
  sttModel.status = progress >= 1 ? "warming-up" : "downloading";

  const bytesJustLoaded = (progress - prevProgress) * sttModel.estimatedBytes;
  if (bytesJustLoaded > 0) updateSpeed(bytesJustLoaded);

  notify();
}

export function markSttReady(): void {
  sttModel.status = "ready";
  sttModel.progress = 1;
  sttModel.detail = "Ready";
  notify();
  checkAllReady();
}

export function markSttError(message: string): void {
  sttModel.status = "error";
  sttModel.error = message;
  sttModel.detail = message;
  notify();
}

function checkAllReady(): void {
  if (ttsModel.status === "ready" && sttModel.status === "ready") {
    markSetupComplete();
  }
}

// ─── Retry Logic ───────────────────────────────────────────────────────

let retryCallbacks: { tts?: () => void; stt?: () => void } = {};

export function registerRetryCallback(model: "tts" | "stt", callback: () => void): void {
  retryCallbacks[model] = callback;
}

export function retry(model: "tts" | "stt"): void {
  const modelInfo = model === "tts" ? ttsModel : sttModel;
  modelInfo.status = "pending";
  modelInfo.progress = 0;
  modelInfo.detail = "Retrying…";
  modelInfo.error = undefined;
  notify();

  retryCallbacks[model]?.();
}

/** Format bytes into human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format speed into human-readable string. */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Reset manager state for testing or re-initialization. */
export function resetManager(): void {
  ttsModel.status = "pending";
  ttsModel.progress = 0;
  ttsModel.detail = "Waiting…";
  ttsModel.error = undefined;
  sttModel.status = "pending";
  sttModel.progress = 0;
  sttModel.detail = "Waiting…";
  sttModel.error = undefined;
  totalBytesDownloaded = 0;
  speedSamples = [];
  lastSpeedUpdate = 0;
  downloadStartTime = 0;
  notify();
}
