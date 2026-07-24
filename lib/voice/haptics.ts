/**
 * haptics.ts — tactile state cues mirroring the earcon set. A redundant channel
 * for when audio is masked by TTS, a Bluetooth speaker's latency, or a noisy
 * room — exactly the conditions Swaram's blind users hit.
 *
 * TWO backends, picked by capability:
 *  - Android web: the standard Vibration API (navigator.vibrate) — real patterns.
 *  - iOS Safari: no Vibration API, but a `<input type="checkbox" switch>` fires
 *    the Taptic Engine when toggled. Clicking the LABEL (not the input)
 *    propagates the toggle and triggers a single system tick. This is the
 *    well-known ios-haptics trick — works iOS 17.4–26.4 (Apple patched
 *    programmatic firing in 26.5), only within a user-activation context, and
 *    only a single tick (no arbitrary patterns). So it is BEST-EFFORT: cues
 *    fired right after a tap land; async ones (e.g. "answer accepted" seconds
 *    later) may not. The audio earcon remains the guaranteed channel either way.
 */

export type HapticKind = "listen" | "stop" | "captured" | "success" | "error";

// Android patterns (ms). Kept brief so they read as cues, not alerts. iOS gets a
// single tick per call regardless of kind (the switch trick can't vary it).
const PATTERNS: Record<HapticKind, number | number[]> = {
  listen: 25,
  stop: 15,
  captured: [12, 30, 12],
  success: 45,
  error: [70, 40, 70],
};

let enabled = true;

/** Profile toggle. Default on; no-op where no backend is available. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function androidVibrate(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

// --- iOS Safari Taptic switch trick ---
// A persistent, visually-hidden switch we toggle to fire the Taptic Engine.
// aria-hidden + tabindex=-1 keep it out of VoiceOver, and we restore DOM focus
// after the synthetic click so the VO/keyboard cursor doesn't jump.
let switchLabel: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (switchLabel && switchLabel.isConnected) return switchLabel;
  try {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText =
      "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.tabIndex = -1;
    // The Safari 17.4+ switch control is what carries the haptic.
    input.setAttribute("switch", "");
    label.appendChild(input);
    (document.body || document.documentElement).appendChild(label);
    switchLabel = label;
    return label;
  } catch {
    return null;
  }
}

function iosHapticTick(): void {
  const label = ensureSwitch();
  if (!label) return;
  const prev = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
  try {
    label.click(); // toggling via the label is what fires the Taptic Engine
  } catch {
    /* ignore */
  }
  // Don't let the synthetic click steal focus from the user's place.
  if (prev && prev !== document.activeElement && typeof prev.focus === "function") {
    try { prev.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  // Android's real Vibration API wins where present; otherwise the iOS tick.
  if (!androidVibrate(PATTERNS[kind])) {
    iosHapticTick();
  }
}
