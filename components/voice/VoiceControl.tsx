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
import { useVoice, useVoiceShell } from "./VoiceProvider";
import VoiceOrb from "@/components/ui/VoiceOrb";
import Waveform from "@/components/Waveform";

interface VoiceControlProps {
  variant: "hero" | "docked" | "fab";
  className?: string;
}

export default function VoiceControl({ variant, className = "" }: VoiceControlProps) {
  const voice = useVoice();
  const shell = useVoiceShell();
  if (!voice) return null;

  const { sttState, micMode, toast, micVolume, ttsActive, wakeMic } = voice;
  const { isTouch, onMicPointerDown, onMicPointerUp, onMicPointerCancel, togglePtt } = shell;

  const listening = sttState === "listening";
  const thinking = !listening && toast.startsWith("Thinking");
  const orbState = listening ? "listening" : ttsActive ? "speaking" : thinking ? "thinking" : "idle";

  const heading = listening
    ? "Listening…"
    : ttsActive
    ? "Speaking"
    : thinking
    ? "Thinking…"
    : sttState === "paused-silence"
    ? "Microphone paused"
    : micMode === "ptt"
    ? "I'm listening whenever you're ready."
    : "Microphone off";

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
    return (
      <div
        {...interaction}
        className={`relative grid h-16 w-16 place-items-center rounded-full bg-raised border border-line shadow-float touch-none select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      >
        <VoiceOrb state={orbState} volume={micVolume} size="sm" />
      </div>
    );
  }

  if (variant === "docked") {
    return (
      <div
        {...interaction}
        className={`fixed bottom-6 left-1/2 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-full border border-line bg-raised/95 py-3 pl-4 pr-6 shadow-float backdrop-blur touch-none select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      >
        <VoiceOrb state={orbState} volume={micVolume} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-ink">{heading}</p>
          <p className="mt-0.5 truncate text-[11px] text-soft">{toast || hint}</p>
        </div>
        <div className="w-16 shrink-0" aria-hidden="true">
          <Waveform active={listening} speaking={ttsActive} volume={micVolume} />
        </div>
      </div>
    );
  }

  // hero
  return (
    <div
      {...interaction}
      className={`flex flex-col items-center gap-5 touch-none select-none cursor-pointer rounded-3xl p-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${className}`}
    >
      <VoiceOrb state={orbState} volume={micVolume} size="lg" />
      <div className="text-center">
        <h2 className="font-display text-2xl text-ink md:text-3xl">{heading}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-soft">{toast || hint}</p>
      </div>
      <div className="w-full max-w-[200px]" aria-hidden="true">
        <Waveform active={listening} speaking={ttsActive} volume={micVolume} />
      </div>
    </div>
  );
}

/** Small helper so shells can label the control area for screen readers. */
export function VoiceControlRegion({ children }: { children: ReactNode }) {
  return <div aria-label="Voice control">{children}</div>;
}
