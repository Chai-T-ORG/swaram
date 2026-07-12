"use client";

import { motion, useReducedMotion } from "framer-motion";
import { IconWave } from "./icons";
import { useEffect, useState } from "react";

interface VoiceOrbProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  volume?: number;
  speakingActive?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function VoiceOrb({
  state,
  volume = 0,
  speakingActive = false,
  size = "md",
  className = "",
}: VoiceOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const [pulseScale, setPulseScale] = useState(1);

  // Active state dimensions
  const dims = {
    sm: { container: "w-12 h-12", core: "w-8 h-8", icon: "w-4 h-4", outerPulse: "-inset-1.5", innerPulse: "-inset-0.5" },
    md: { container: "w-24 h-24", core: "w-14 h-14", icon: "w-6.5 h-6.5", outerPulse: "-inset-3", innerPulse: "-inset-1.5" },
    lg: { container: "w-36 h-36 md:w-40 md:h-40", core: "w-20 h-20 md:w-24 md:h-24", icon: "w-8 h-8 md:w-9 md:h-9", outerPulse: "-inset-6", innerPulse: "-inset-3" },
  }[size];

  // Speaking state helper
  useEffect(() => {
    if (state !== "speaking" || prefersReducedMotion) {
      setPulseScale(1);
      return;
    }
    const interval = setInterval(() => {
      setPulseScale(1.02 + Math.sin(Date.now() * 0.015) * 0.02);
    }, 30);
    return () => clearInterval(interval);
  }, [state, prefersReducedMotion]);

  // Reduced motion animation rules
  const scaleAnim = prefersReducedMotion
    ? { scale: 1 }
    : {
        scale:
          state === "listening"
            ? 1 + volume * 0.4
            : state === "speaking"
            ? pulseScale
            : 1,
      };

  const ringScaleAnim = prefersReducedMotion
    ? { scale: 1 }
    : {
        scale:
          state === "listening"
            ? 1 + volume * 0.25
            : state === "speaking"
            ? 1 + (pulseScale - 1) * 0.6
            : 1,
      };

  const outerPulseOpacity = state === "listening" ? 0.3 + volume * 0.7 : state === "speaking" ? 0.4 : 0.12;
  const innerPulseOpacity = state === "listening" ? 0.4 + volume * 0.6 : state === "speaking" ? 0.5 : 0.2;

  // Blob shape animations
  const outerBlobRadius = prefersReducedMotion
    ? "50%"
    : state === "thinking"
    ? [
        "45% 55% 70% 30% / 45% 45% 55% 55%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "45% 55% 70% 30% / 45% 45% 55% 55%",
      ]
    : state === "listening"
    ? [
        "42% 58% 70% 30% / 45% 45% 55% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "42% 58% 70% 30% / 45% 45% 55% 55%",
      ]
    : "50%";

  const innerBlobRadius = prefersReducedMotion
    ? "50%"
    : state === "thinking"
    ? [
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "42% 58% 70% 30% / 45% 45% 55% 55%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
      ]
    : state === "listening"
    ? [
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "42% 58% 70% 30% / 45% 45% 55% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
      ]
    : "50%";

  return (
    <div className={`relative flex items-center justify-center ${dims.container} ${className}`} aria-label={`Voice Orb: ${state}`}>
      {/* Concentric Pulses - Outer */}
      <motion.div
        className="absolute rounded-full border border-teal-500/20 bg-teal-500/5 pointer-events-none"
        style={{ top: dims.outerPulse, bottom: dims.outerPulse, left: dims.outerPulse, right: dims.outerPulse, opacity: outerPulseOpacity }}
        animate={scaleAnim}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
      />
      {/* Concentric Pulses - Inner */}
      <motion.div
        className="absolute rounded-full border border-teal-500/30 bg-teal-500/10 pointer-events-none"
        style={{ top: dims.innerPulse, bottom: dims.innerPulse, left: dims.innerPulse, right: dims.innerPulse, opacity: innerPulseOpacity }}
        animate={ringScaleAnim}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
      />

      {/* Outer Morphing Blob */}
      <motion.div
        className="absolute inset-0 bg-[#f0fdfa] dark:bg-[#002e2c]/40 border border-[#ccfbf1] dark:border-[#115e59]/30 rounded-full shadow-inner pointer-events-none"
        animate={{
          scale: state === "listening" ? 1 + volume * 0.18 : state === "speaking" ? 1.02 : 1,
          borderRadius: outerBlobRadius,
        }}
        transition={{
          scale: { type: "spring", stiffness: 200, damping: 15 },
          borderRadius: { repeat: Infinity, duration: 8, ease: "easeInOut" },
        }}
      />

      {/* Inner Morphing Blob */}
      <motion.div
        className="absolute inset-[10%] bg-[#ccfbf1] dark:bg-[#004d47]/30 border border-[#99f6e4]/40 rounded-full pointer-events-none"
        animate={{
          scale: state === "listening" ? 1 + volume * 0.1 : state === "speaking" ? 1.01 : 1,
          borderRadius: innerBlobRadius,
        }}
        transition={{
          scale: { type: "spring", stiffness: 220, damping: 18 },
          borderRadius: { repeat: Infinity, duration: 10, ease: "easeInOut" },
        }}
      />

      {/* Core Button & Icon */}
      <motion.div
        className={`relative flex items-center justify-center rounded-full shadow-lg text-white pointer-events-none ${dims.core} ${
          state === "listening"
            ? "bg-[#0f766e] dark:bg-[#14b8a6]"
            : state === "thinking"
            ? "bg-[#0d9488]/80 dark:bg-[#0f766e]/80"
            : "bg-[#0d9488] dark:bg-[#0f766e]"
        }`}
        animate={{
          scale: state === "listening" ? 1 + volume * 0.08 : 1,
          rotate: state === "thinking" && !prefersReducedMotion ? 360 : 0,
        }}
        transition={{
          scale: { type: "spring", stiffness: 240, damping: 20 },
          rotate: { repeat: Infinity, duration: 3, ease: "linear" },
        }}
      >
        <IconWave className={dims.icon} />
      </motion.div>
    </div>
  );
}
