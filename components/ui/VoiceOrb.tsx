"use client";

/**
 * VoiceOrb — The heart of Swaram's interface. Re-engineered as a professional,
 * high-fidelity 3D-illusion voice sphere matching the mockup reference.
 * Uses layered theme-aware radial gradients, specular hotspot, contact shadow,
 * and a waveform that scales to >=45% of core width.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "paused" | "success" | "error";

interface VoiceOrbProps {
  state: VoiceOrbState;
  volume?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function AnimatedSoundwave({
  state,
  volume,
  size,
}: {
  state: VoiceOrbState;
  volume: number;
  size: "sm" | "md" | "lg";
}) {
  const bars = [0, 1, 2, 3, 4];
  const idleScales = [0.45, 0.75, 0.55, 0.85, 0.45];

  const barHeight = {
    sm: 10,
    md: 18,
    lg: 26,
  }[size];

  const gapClass = {
    sm: "gap-[2px]",
    md: "gap-[3.5px]",
    lg: "gap-[5px]",
  }[size];

  const widthStyle = {
    sm: "w-[2px]",
    md: "w-[3.5px]",
    lg: "w-[5px]",
  }[size];

  return (
    <div className={`flex items-center justify-center ${gapClass}`}>
      {bars.map((bar) => {
        let animateVal: any = { scaleY: idleScales[bar] };

        if (state === "listening") {
          if (volume < 0.05) {
            animateVal = {
              scaleY: [idleScales[bar] * 0.7, idleScales[bar] * 1.3, idleScales[bar] * 0.7],
              transition: {
                duration: 1.2,
                delay: bar * 0.12,
                repeat: Infinity,
                repeatType: "reverse" as const,
                ease: "easeInOut",
              },
            };
          } else {
            animateVal = {
              scaleY: Math.min(1.8, idleScales[bar] + volume * 1.6),
              transition: {
                type: "spring",
                stiffness: 350,
                damping: 20,
              },
            };
          }
        } else if (state === "speaking") {
          animateVal = {
            scaleY: [idleScales[bar] * 0.5, idleScales[bar] * 1.9, idleScales[bar] * 0.5],
            transition: {
              duration: 0.35 + bar * 0.06,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            },
          };
        } else if (state === "thinking") {
          animateVal = {
            scaleY: [idleScales[bar] * 0.8, idleScales[bar] * 1.2, idleScales[bar] * 0.8],
            transition: {
              duration: 0.8 + bar * 0.1,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            },
          };
        } else if (state === "paused") {
          animateVal = { scaleY: 0.3 };
        } else if (state === "success") {
          animateVal = { scaleY: [0.6, 1.2, 0.8] };
        } else if (state === "error") {
          animateVal = { scaleY: 0.4 };
        } else {
          animateVal = {
            scaleY: [idleScales[bar] * 0.8, idleScales[bar] * 1.2, idleScales[bar] * 0.8],
            transition: {
              duration: 2.2,
              delay: bar * 0.15,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            },
          };
        }

        return (
          <motion.div
            key={bar}
            className={`${widthStyle} bg-white rounded-full`}
            style={{
              height: barHeight,
              transformOrigin: "center",
            }}
            animate={animateVal}
          />
        );
      })}
    </div>
  );
}

export default function VoiceOrb({
  state,
  volume = 0,
  size = "md",
  className = "",
}: VoiceOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dims = {
    sm: { container: "w-12 h-12", core: "w-9 h-9" },
    md: { container: "w-24 h-24", core: "w-16 h-16" },
    lg: { container: "w-36 h-36 md:w-40 md:h-40", core: "w-24 h-24 md:w-26 md:h-26" },
  }[size];

  if (!mounted) {
    return (
      <div className={`relative flex items-center justify-center ${dims.container} ${className}`} aria-hidden="true" />
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${dims.container} ${className}`} aria-hidden="true">
      {/* 3D Soft Ambient Backdrop Glow */}
      {!prefersReducedMotion && (
        <motion.div
          className={`absolute rounded-full pointer-events-none ${
            state === "success"
              ? "bg-gradient-to-tr from-ok/30 via-ok/40 to-ok/20"
              : state === "error"
              ? "bg-gradient-to-tr from-bad/30 via-bad/40 to-bad/20"
              : "bg-gradient-to-tr from-accent/30 via-accent/45 to-accent/15"
          }`}
          style={{
            inset: { sm: "-6px", md: "-20px", lg: "-36px" }[size],
            filter: { sm: "blur(10px)", md: "blur(24px)", lg: "blur(38px)" }[size],
          }}
          animate={{
            scale: state === "listening" ? 1.15 + volume * 0.2 : state === "speaking" ? 1.12 : 1.03,
            opacity: state === "listening" ? 0.85 : state === "speaking" ? 0.75 : state === "thinking" ? 0.65 : state === "paused" ? 0.25 : 0.5,
          }}
          transition={{
            scale: { type: "spring", stiffness: 120, damping: 20 },
            opacity: { duration: 0.4 },
          }}
        />
      )}

      {/* Contact shadow */}
      <motion.div
        className="absolute pointer-events-none rounded-full blur-[5px] mix-blend-multiply dark:mix-blend-screen"
        style={{
          width: { sm: "24px", md: "44px", lg: "68px" }[size],
          height: { sm: "4px", md: "6px", lg: "9px" }[size],
          bottom: { sm: "2px", md: "9px", lg: "15px" }[size],
          left: "50%",
          x: "-50%",
          background: "radial-gradient(ellipse at center, var(--accent-deep) 0%, transparent 70%)",
        }}
        animate={{
          scaleX: state === "listening" ? 1.05 + volume * 0.1 : 1,
          opacity: state === "listening" ? 0.5 : 0.4,
        }}
      />

      {/* Concentric listening ripples */}
      {!prefersReducedMotion && (state === "listening" || state === "speaking" || state === "idle") && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-accent/40 pointer-events-none"
              style={{
                width: { sm: "36px", md: "64px", lg: "96px" }[size],
                height: { sm: "36px", md: "64px", lg: "96px" }[size],
              }}
              animate={{
                scale: state === "listening" ? [1, 2.5] : state === "speaking" ? [1, 2.1] : [1, 1.3, 1],
                opacity: state === "listening" ? [0.8, 0] : state === "speaking" ? [0.6, 0] : [0.25, 0.05, 0.25],
              }}
              transition={{
                duration: state === "listening" ? 1.8 : state === "speaking" ? 1.4 : 3.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut",
              }}
            />
          ))}
        </>
      )}

      {/* Success / Error State Rings */}
      {state === "success" && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.15, opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: 1 }}
          className="absolute inset-0 rounded-full border-2 border-ok pointer-events-none"
        />
      )}
      {state === "error" && (
        <motion.div
          initial={{ scale: 1.05 }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 0.4, repeat: 2 }}
          className="absolute inset-0 rounded-full border-2 border-bad pointer-events-none"
        />
      )}

      {/* 3D-Illusion Core Sphere */}
      <motion.div
        className={`relative flex items-center justify-center rounded-full overflow-hidden shadow-lg select-none pointer-events-none ${dims.core}`}
        animate={{
          scale:
            state === "listening" ? 1.03
            : state === "speaking" ? 1.0 + volume * 0.08
            : state === "paused" ? 0.95
            : 1,
          opacity: state === "paused" ? 0.7 : 1,
        }}
        transition={{
          scale: { type: "spring", stiffness: 180, damping: 22 },
          opacity: { duration: 0.3 },
        }}
      >
        {/* Layer 1: Core Gradient */}
        <div 
          className="absolute inset-0 rounded-full" 
          style={{
            background: "radial-gradient(circle at 30% 30%, var(--orb-grad-1) 0%, var(--orb-grad-2) 55%, var(--orb-grad-3) 100%)"
          }}
        />

        {/* Layer 1b: Conic energy core */}
        {(state === "thinking" || state === "speaking") && !prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full mix-blend-screen opacity-65"
            style={{
              background: "conic-gradient(from 0deg, var(--aurora-forest), var(--aurora-emerald), var(--aurora-gold), var(--aurora-mint), var(--aurora-forest))"
            }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
          />
        )}

        {/* Layer 2: Specular Hotspot */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-full mix-blend-overlay opacity-90"
          style={{
            background: "radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0) 50%)"
          }}
        />

        {/* Layer 3: 3D Spherical Shadow Depth */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            boxShadow: size === "sm"
              ? "inset -2px -2px 6px rgba(0,0,0,0.4), inset 2px 2px 6px rgba(255,255,255,0.2)"
              : "inset -4px -4px 12px rgba(0,0,0,0.35), inset 4px 4px 12px rgba(255,255,255,0.25)"
          }}
        />

        {/* Live soundwave animated center */}
        <div className="relative z-20 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
          <AnimatedSoundwave state={state} volume={volume} size={size} />
        </div>
      </motion.div>
    </div>
  );
}
