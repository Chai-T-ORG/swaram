"use client";

/**
 * micLevel.ts — the live microphone level (0–1) as a tiny external store,
 * deliberately OUTSIDE React state.
 *
 * Why: the analyser updates this ~60 times/second while listening. If it lived
 * in the VoiceProvider's React state / context, every `useVoice()` consumer —
 * including the heavy fill-session hook and both shells — would re-render 60fps
 * during a voice turn (real jank on a low-end phone). Here, only the components
 * that actually visualise the level (the orb, aurora, strands) subscribe via
 * `useMicVolume()`; nothing else re-renders.
 */
import { useSyncExternalStore } from "react";

let level = 0;
const listeners = new Set<() => void>();

/** Push a new level. Micro-changes are dropped to cut needless renders; an
 *  explicit 0 (mic closed) always propagates so the orb settles. */
export function setMicLevel(v: number): void {
  const next = v < 0 ? 0 : v > 1 ? 1 : v;
  if (next !== 0 && Math.abs(next - level) < 0.012) return;
  if (next === level) return;
  level = next;
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function getMicLevel(): number {
  return level;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to the live mic level without touching voice context. */
export function useMicVolume(): number {
  return useSyncExternalStore(subscribe, getMicLevel, () => 0);
}
