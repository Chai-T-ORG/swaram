"use client";

/**
 * AuroraField 2.0 — the living light system.
 *
 * Two layers, driven by the real voice state:
 *  - The mesh: gradient blob centers animating on slow drift.
 *  - EdgeGlow: organic perimeter light glow active during listening/speaking.
 */

import { useVoice } from "@/components/voice/VoiceProvider";
import { useMicVolume } from "@/lib/voice/micLevel";
import EdgeGlow from "./EdgeGlow";

export default function AuroraField() {
  const voice = useVoice();
  const sttState = voice?.sttState ?? "off";
  const ttsActive = voice?.ttsActive ?? false;
  const micVolume = useMicVolume();
  const listening = sttState === "listening";

  const fieldOpacity = listening
    ? "opacity-75 dark:opacity-75"
    : ttsActive
    ? "opacity-60 dark:opacity-60"
    : "opacity-45 dark:opacity-45";

  return (
    <>
      {/* The mesh field behind the stage */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-0 h-[65vh] overflow-hidden transition-opacity duration-1000 contrast-more:hidden ${fieldOpacity}`}
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
