"use client";

/**
 * VoiceControl — THE one voice control in the app.
 *
 * Every screen shows exactly one of these; it owns the push-to-talk pointer
 * interaction (hold to talk / release to send, quick-tap toggle, tap-to-talk
 * on touch) exactly as the voice engine expects. Three presentations:
 *
 *  - "hero":   large orb + state heading + hint + waveform (home / stage)
 *  - "docked": floating pill, bottom-center (desktop task screens)
 *  - "fab":    round orb button for the mobile tab bar's center slot
 */

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { useVoice, useVoiceShell } from "./VoiceProvider";
import { useMicVolume } from "@/lib/voice/micLevel";
import VoiceOrb from "@/components/ui/VoiceOrb";
import VoiceStrands from "@/components/ui/VoiceStrands";

interface VoiceControlProps {
  variant: "hero" | "docked" | "fab";
  className?: string;
}

export default function VoiceControl({ variant, className = "" }: VoiceControlProps) {
  const voice = useVoice();
  const shell = useVoiceShell();
  const micVolume = useMicVolume(); // hook must run before the early return
  if (!voice) return null;

  const { sttState, micMode, toast, ttsActive, wakeMic, voiceUiState } = voice;
  const { isTouch, onMicPointerDown, onMicPointerUp, onMicPointerCancel, togglePtt } = shell;

  const orbState = voiceUiState;

  const heading =
    orbState === "listening"
      ? "Listening…"
      : orbState === "speaking"
      ? "Speaking"
      : orbState === "thinking"
      ? "Thinking…"
      : orbState === "paused"
      ? "Microphone paused"
      : orbState === "success"
      ? "Ready"
      : orbState === "error"
      ? "Microphone issue"
      : micMode === "ptt"
      ? "I'm listening whenever you're ready."
      : "Microphone off";

  const listening = orbState === "listening";

  const hint = listening
    ? micMode === "ptt"
      ? isTouch
        ? "Speak now, then tap to send."
        : "Speak now, then release."
      : "Speak naturally, I'll take it from here."
    : micMode === "ptt"
    ? isTouch
      ? "Tap anywhere to talk, tap again to send."
      : "Hold the space bar or hold here, then speak."
    : "Tap to resume listening";

  const ariaLabel =
    micMode === "ptt"
      ? isTouch
        ? "Tap to talk, tap again to send"
        : "Hold to talk, release to send"
      : "Tap to listen";

  // The interaction contract, verbatim from the voice engine's expectations:
  // continuous mode wakes on click; touch push-to-talk toggles on tap; desktop
  // push-to-talk is owned by the pointer handlers (hold/release + quick-tap).
  const interaction = {
    onClick: () => {
      if (micMode !== "ptt") wakeMic();
      else if (isTouch) togglePtt();
    },
    onPointerDown: onMicPointerDown,
    onPointerUp: onMicPointerUp,
    onPointerCancel: onMicPointerCancel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (micMode !== "ptt") wakeMic();
        else togglePtt();
      }
    },
    role: "button" as const,
    tabIndex: 0,
    "aria-label": ariaLabel,
  };

  if (variant === "fab") {
    const isIdle = orbState === "idle";
    return (
      <motion.div
        {...interaction}
        whileTap={{ scale: 0.97, boxShadow: "var(--shadow-sm)" }}
        className={`relative grid h-16 w-16 place-items-center rounded-full bg-raised border border-line shadow-float touch-none select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          isIdle ? "animate-glow-breath" : ""
        } ${className}`}
      >
        <VoiceOrb state={orbState} volume={micVolume} size="sm" />
      </motion.div>
    );
  }

  if (variant === "docked") {
    const isIdle = orbState === "idle";
    return (
      <motion.div
        {...interaction}
        whileTap={{ scale: 0.97, boxShadow: "var(--shadow-sm)" }}
        className={`fixed bottom-6 left-1/2 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-full glass-raised py-3 pl-4 pr-6 touch-none select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          isIdle ? "animate-glow-breath" : ""
        } ${className}`}
      >
        <VoiceOrb state={orbState} volume={micVolume} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-ink">{heading}</p>
          <p className="mt-0.5 truncate text-[11px] text-soft">{toast || hint}</p>
        </div>
      </motion.div>
    );
  }

  // hero
  return (
    <div
      {...interaction}
      className={`flex flex-col items-center gap-1 touch-none select-none cursor-pointer rounded-3xl p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${className}`}
    >
      <VoiceOrb state={orbState} volume={micVolume} size="lg" />
      <div
        className="-mt-3 w-[460px] max-w-full [mask-image:radial-gradient(ellipse_65%_90%_at_center,black_55%,transparent_98%)]"
        aria-hidden="true"
      >
        <VoiceStrands height={120} />
      </div>
    </div>
  );
}

/** Small helper so shells can label the control area for screen readers. */
export function VoiceControlRegion({ children }: { children: ReactNode }) {
  return <div aria-label="Voice control">{children}</div>;
}
