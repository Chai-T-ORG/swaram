"use client";

/**
 * AuroraField 2.0 — the living light system.
 *
 * Two layers, both driven by the real voice state:
 *
 *  - The mesh: one element whose gradient blob centers are CSS registered
 *    properties animating on slow drift (the gradient itself moves, not a
 *    div). Top-anchored, dissolving into plain paper before mid-screen.
 *  - The edge glow: organic canvas-based light orbs drifting around the
 *    screen border while the mic is live — the Siri-pattern "listening"
 *    signal. Four radial-gradient orbs follow the screen perimeter using
 *    requestAnimationFrame with "lighter" compositing for an authentic
 *    luminance bloom, not a rectangular mask.
 *
 * Both couple to micVolume so the atmosphere literally breathes with the
 * user's voice. TTS gives a quiet slow-spin variant.
 */

import { useVoice } from "@/components/voice/VoiceProvider";
import EdgeGlow from "./EdgeGlow";

export default function AuroraField() {
  const voice = useVoice();
  const sttState = voice?.sttState ?? "off";
  const ttsActive = voice?.ttsActive ?? false;
  const micVolume = voice?.micVolume ?? 0;
  const listening = sttState === "listening";

  const fieldOpacity = listening
    ? "opacity-55 dark:opacity-65"
    : ttsActive
    ? "opacity-40 dark:opacity-50"
    : "opacity-30 dark:opacity-40";

  return (
    <>
      {/* The mesh field behind the stage */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-0 h-[58vh] overflow-hidden transition-opacity duration-1000 contrast-more:hidden ${fieldOpacity}`}
        style={{ "--aurora-energy": micVolume } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className="aurora-mesh" />
        {/* Dissolve into plain paper before mid-screen. */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface" />
      </div>

      {/* The listening signal: organic canvas edge glow. */}
      <EdgeGlow
        active={listening || ttsActive}
        micVolume={micVolume}
        mood={listening ? "thinking" : "success"}
      />
    </>
  );
}
