"use client";

/**
 * VoiceOrb — the brand anchor. A dimensional deep-green sphere with soft
 * concentric rings and a living waveform core. Four states, distinguishable
 * by shape and motion (not color alone): idle (breathing), listening
 * (volume-driven pulse), thinking (slow rotate + morph), speaking (voice
 * pulse). Honors prefers-reduced-motion.
 */

import { motion, useReducedMotion } from "framer-motion";
import { IconWave } from "@/components/icons";
import { useEffect, useState } from "react";

interface VoiceOrbProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  volume?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function VoiceOrb({
  state,
  volume = 0,
  size = "md",
  className = "",
}: VoiceOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const [pulseScale, setPulseScale] = useState(1);

  const dims = {
    sm: { container: "w-12 h-12", core: "w-9 h-9", icon: "w-4 h-4", outerPulse: "-6px", innerPulse: "-2px" },
    md: { container: "w-24 h-24", core: "w-15 h-15", icon: "w-6 h-6", outerPulse: "-12px", innerPulse: "-6px" },
    lg: { container: "w-36 h-36 md:w-40 md:h-40", core: "w-22 h-22 md:w-24 md:h-24", icon: "w-8 h-8 md:w-9 md:h-9", outerPulse: "-24px", innerPulse: "-12px" },
  }[size];

  // Speaking state: a gentle voice-driven pulse.
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

  // The halos always morph gently (a slow "breathing" even when idle) —
  // animating from a static percentage value squares off under framer-motion's
  // scale-distortion correction, and the constant motion is the brand anyway.
  const outerBlobRadius = prefersReducedMotion
    ? [
        "50% 50% 50% 50% / 50% 50% 50% 50%",
        "50% 50% 50% 50% / 50% 50% 50% 50%",
      ]
    : [
        "45% 55% 70% 30% / 45% 45% 55% 55%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "45% 55% 70% 30% / 45% 45% 55% 55%",
      ];

  const innerBlobRadius = prefersReducedMotion
    ? [
        "50% 50% 50% 50% / 50% 50% 50% 50%",
        "50% 50% 50% 50% / 50% 50% 50% 50%",
      ]
    : [
        "50% 50% 35% 65% / 40% 60% 45% 55%",
        "70% 30% 52% 48% / 60% 40% 60% 40%",
        "42% 58% 70% 30% / 45% 45% 55% 55%",
        "50% 50% 35% 65% / 40% 60% 45% 55%",
      ];

  // Faster morph while actively listening/thinking; slow breath otherwise.
  const morphDuration = state === "listening" || state === "thinking" ? 5 : 9;

  return (
    <div className={`relative flex items-center justify-center ${dims.container} ${className}`} aria-hidden="true">
      {/* Concentric pulse — outer */}
      <motion.div
        className="absolute rounded-full border border-accent/20 bg-accent/5 pointer-events-none"
        style={{ inset: dims.outerPulse, opacity: outerPulseOpacity }}
        animate={scaleAnim}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
      />
      {/* Concentric pulse — inner */}
      <motion.div
        className="absolute rounded-full border border-accent/30 bg-accent/10 pointer-events-none"
        style={{ inset: dims.innerPulse, opacity: innerPulseOpacity }}
        animate={ringScaleAnim}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
      />

      {/* Outer morphing halo */}
      <motion.div
        className="absolute inset-0 bg-accent-soft border border-accent/15 rounded-full shadow-inner pointer-events-none"
        animate={{
          scale: state === "listening" ? 1 + volume * 0.18 : state === "speaking" ? 1.02 : 1,
          borderRadius: outerBlobRadius,
        }}
        transition={{
          scale: { type: "spring", stiffness: 200, damping: 15 },
          borderRadius: { repeat: Infinity, duration: morphDuration, ease: "easeInOut" },
        }}
      />

      {/* Inner morphing halo */}
      <motion.div
        className="absolute inset-[10%] bg-accent/15 border border-accent/20 rounded-full pointer-events-none"
        animate={{
          scale: state === "listening" ? 1 + volume * 0.1 : state === "speaking" ? 1.01 : 1,
          borderRadius: innerBlobRadius,
        }}
        transition={{
          scale: { type: "spring", stiffness: 220, damping: 18 },
          borderRadius: { repeat: Infinity, duration: morphDuration + 2, ease: "easeInOut" },
        }}
      />

      {/* Core sphere: deep green with a soft top-light for dimension */}
      <motion.div
        className={`relative flex items-center justify-center rounded-full shadow-lg text-on-accent pointer-events-none ${dims.core}`}
        style={{
          background: "radial-gradient(circle at 32% 28%, var(--accent) 0%, var(--accent-hover) 55%, var(--accent-deep) 100%)",
          opacity: state === "thinking" ? 0.85 : 1,
        }}
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
