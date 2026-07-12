/**
 * Programmatic audio feedback (earcons) using Web Audio API.
 * Avoids network requests for media files and runs entirely offline.
 */

let audioCtx: AudioContext | null = null;

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
    console.warn("[Earcons] Failed to initialize AudioContext:", e);
    return null;
  }
}

/** Play a rising chime indicating listening started. */
export function playEarconStart(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  // Start at 440Hz, rise to 660Hz
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);

  // Smooth gain envelope
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/** Play a falling chime indicating listening stopped/paused. */
export function playEarconStop(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  // Start at 520Hz, fall to 330Hz
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.12);

  // Smooth gain envelope
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/** Play a cheerful double-beep indicating command recognized. */
export function playEarconRecognized(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(980, now);

  // Double pulse gain envelope
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
  gain.gain.setValueAtTime(0.001, now + 0.04);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.16);
}
