"use client";

import { IconMic } from "./icons";

interface MicButtonProps {
  listening: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  size?: "md" | "lg";
}

/** Large round microphone button — the main control on voice screens. */
export default function MicButton({ listening, disabled, onClick, label, size = "lg" }: MicButtonProps) {
  const dims = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  const icon = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={label ?? (listening ? "Stop listening" : "Start listening")}
      className={`grid ${dims} place-items-center rounded-full text-on-accent shadow-float transition-all duration-300 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-90 disabled:opacity-45 hover:scale-105 cursor-pointer ${
        listening
          ? "mic-live bg-[#0f766e] text-white"
          : "bg-accent hover:bg-accent-deep"
      }`}
    >
      <IconMic className={icon} strokeWidth={2} />
    </button>
  );
}
