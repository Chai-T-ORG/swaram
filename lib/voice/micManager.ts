/**
 * micManager.ts — Singleton microphone stream manager.
 *
 * Calls getUserMedia exactly ONCE per session on the first user gesture.
 * Stores the MediaStream globally so the visualizer, Whisper STT, and
 * any other consumer share one stream — no duplicate permission prompts.
 *
 * Works on Chrome, Safari (desktop + iOS), Edge, and Firefox.
 */

import { setCookie, getCookie } from "../cookies";

let sharedStream: MediaStream | null = null;
let streamPromise: Promise<MediaStream | null> | null = null;
let permissionState: "unknown" | "granted" | "denied" | "prompt" = "unknown";

const MIC_COOKIE = "swaram_mic";

const stateListeners = new Set<(state: typeof permissionState) => void>();

export function onPermissionChange(listener: (state: typeof permissionState) => void): () => void {
  stateListeners.add(listener);
  listener(permissionState);
  return () => stateListeners.delete(listener);
}

function setPermissionState(state: typeof permissionState): void {
  permissionState = state;
  // Remember a positive grant so future loads know not to re-prompt.
  if (state === "granted") setCookie(MIC_COOKIE, "granted");
  for (const l of stateListeners) {
    try { l(state); } catch { /* listener errors must not break the manager */ }
  }
}

/** Best-effort hint from a prior session (see the secure-origin caveat above). */
export function wasMicGrantedBefore(): boolean {
  return getCookie(MIC_COOKIE) === "granted";
}

/**
 * If the browser already holds a mic grant, open the stream silently — no
 * prompt, no gesture needed — so voice works immediately on reload. Safe to
 * call on mount; it never triggers a permission dialog.
 */
export async function primeMicIfGranted(): Promise<MediaStream | null> {
  const state = await checkPermission();
  if (state === "granted") {
    return initMic();
  }
  return null;
}

/** Check if mic permission is already granted without triggering a prompt. */
export async function checkPermission(): Promise<typeof permissionState> {
  if (typeof navigator === "undefined") return "unknown";
  try {
    // The Permissions API is not available on all browsers (Safari <16)
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      const state = result.state === "granted" ? "granted"
        : result.state === "denied" ? "denied"
        : "prompt";
      setPermissionState(state);

      // Listen for future changes (user toggling in browser settings)
      result.addEventListener("change", () => {
        const s = result.state === "granted" ? "granted"
          : result.state === "denied" ? "denied"
          : "prompt";
        setPermissionState(s);
      });
      return state;
    }
  } catch {
    // Permissions API not supported — we'll find out when getUserMedia is called
  }
  return "unknown";
}

export type MicResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; error: "denied" | "unsupported" | "unavailable" | "unknown"; message: string };

/**
 * Initialize the shared microphone stream with typed detailed status.
 */
export async function initMicDetailed(): Promise<MicResult> {
  if (sharedStream && sharedStream.active) {
    return { ok: true, stream: sharedStream };
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    setPermissionState("denied");
    return {
      ok: false,
      error: "unsupported",
      message: "Microphone access is not supported in this browser environment.",
    };
  }
  try {
    const stream = await initMic();
    if (stream && stream.active) {
      return { ok: true, stream };
    }
    const state = getPermissionState();
    return {
      ok: false,
      error: state === "denied" ? "denied" : "unavailable",
      message: state === "denied"
        ? "Microphone permission was denied by the browser or user."
        : "Microphone input hardware is unavailable or in use by another application.",
    };
  } catch (err: any) {
    const isDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
    const isNotFound = err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError";
    return {
      ok: false,
      error: isDenied ? "denied" : isNotFound ? "unavailable" : "unknown",
      message: err?.message || "Could not access the microphone.",
    };
  }
}

/**
 * Initialize the shared microphone stream. Call this on the first user
 * gesture (click, tap, keypress). Subsequent calls return the same stream.
 *
 * Returns null if mic access is denied or unavailable.
 */
export function initMic(): Promise<MediaStream | null> {
  if (sharedStream && sharedStream.active) return Promise.resolve(sharedStream);
  if (streamPromise) return streamPromise;

  streamPromise = (async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPermissionState("denied");
        return null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // 16kHz is what Whisper expects — request it from the hardware
          // so we don't have to resample. Browsers will pick the closest
          // supported rate if 16000 isn't exact.
          sampleRate: 16000,
        },
      });

      sharedStream = stream;
      setPermissionState("granted");

      // If the stream ends externally (user revoked permission), clean up
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (sharedStream === stream) {
            sharedStream = null;
            streamPromise = null;
            setPermissionState("denied");
          }
        });
      });

      return stream;
    } catch (err: any) {
      console.warn("[MicManager] getUserMedia failed:", err);
      streamPromise = null;

      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setPermissionState("denied");
      } else {
        setPermissionState("denied");
      }
      return null;
    }
  })();

  return streamPromise;
}

/** Get the current shared stream without triggering getUserMedia. */
export function getStream(): MediaStream | null {
  return sharedStream && sharedStream.active ? sharedStream : null;
}

/** Whether a shared mic stream is currently active. */
export function isMicActive(): boolean {
  return sharedStream !== null && sharedStream.active;
}

/** Get current permission state. */
export function getPermissionState(): typeof permissionState {
  return permissionState;
}

/**
 * Release the shared stream. Only call this when the user explicitly
 * wants to stop all voice features (logout, app close). Do NOT call
 * this during normal SPA navigation.
 */
export function releaseMic(): void {
  if (sharedStream) {
    sharedStream.getTracks().forEach((t) => t.stop());
    sharedStream = null;
  }
  streamPromise = null;
  setPermissionState("prompt");
}
