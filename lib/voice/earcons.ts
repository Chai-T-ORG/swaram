/**
 * Programmatic audio feedback (earcons) via the Web Audio API — no media files,
 * fully offline. For a blind user these carry the entire "whose turn is it"
 * signal (there is no Alexa ring-light to see), so the set is deliberately
 * DISTINCT per state and loud enough to survive a phone speaker in a noisy room.
 *
 * Kinds:
 *   listen   — mic just opened, your turn (rising)
 *   stop     — mic closed / processing (falling)
 *   captured — your speech was heard (crisp double blip)
 *   success  — answer accepted / step done (bright ascending pair)
 *   error    — didn't catch / invalid (low descending buzz — unmistakably "no")
 */

export type EarconKind = "listen" | "stop" | "captured" | "success" | "error";

let audioCtx: AudioContext | null = null;
let enabled = true;

/** Profile toggle. Earcons default on — they are the core eyes-free cue. */
export function setEarconsEnabled(on: boolean): void {
  enabled = on;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch (e) {
    console.warn("[Earcons] Failed to initialize AudioContext:", e);
    return null;
  }
}

interface Segment {
  from: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  /** Peak gain for this segment (default 0.18 — ~2x the old 0.08). */
  peak?: number;
  /** Delay before this segment starts, seconds. */
  at?: number;
}

function playSegments(segments: Segment[]): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const base = ctx.currentTime;
  for (const s of segments) {
    const start = base + (s.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = s.type ?? "sine";
    osc.frequency.setValueAtTime(s.from, start);
    if (s.to && s.to !== s.from) {
      osc.frequency.exponentialRampToValueAtTime(s.to, start + s.dur);
    }
    const peak = s.peak ?? 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + s.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + s.dur + 0.02);
  }
}

/** The one entry point. Distinct, louder-than-before, per-state cues. */
export function playEarcon(kind: EarconKind): void {
  if (!enabled) return;
  switch (kind) {
    case "listen": // your turn — rising, inviting
      playSegments([{ from: 480, to: 760, dur: 0.2, peak: 0.2 }]);
      break;
    case "stop": // mic closed / thinking — falling
      playSegments([{ from: 560, to: 300, dur: 0.19, peak: 0.16 }]);
      break;
    case "captured": // heard you — crisp double blip
      playSegments([
        { from: 900, dur: 0.05, peak: 0.16 },
        { from: 900, dur: 0.06, peak: 0.16, at: 0.07 },
      ]);
      break;
    case "success": // accepted / advancing — bright ascending pair
      playSegments([
        { from: 660, dur: 0.1, peak: 0.18 },
        { from: 990, dur: 0.16, peak: 0.2, at: 0.1 },
      ]);
      break;
    case "error": // didn't catch / invalid — low descending buzz
      playSegments([{ from: 240, to: 150, dur: 0.28, type: "sawtooth", peak: 0.16 }]);
      break;
  }
}

/* ------- Legacy named wrappers (existing callers keep working) ------- */
export function playEarconStart(): void {
  playEarcon("listen");
}
export function playEarconStop(): void {
  playEarcon("stop");
}
export function playEarconRecognized(): void {
  playEarcon("captured");
}
