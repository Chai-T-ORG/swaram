"use client";

/**
 * VoiceOrb — The heart of Swaram's interface. Re-engineered as a professional,
 * high-fidelity 3D-illusion voice sphere matching the mockup reference.
 * Uses layered theme-aware radial gradients, specular hotspot, contact shadow,
 * and a waveform that scales to >=45% of core width.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

interface VoiceOrbProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  volume?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function AnimatedSoundwave({
  state,
  volume,
  size,
}: {
  state: "idle" | "listening" | "thinking" | "speaking";
  volume: number;
  size: "sm" | "md" | "lg";
}) {
  const bars = [0, 1, 2, 3, 4];
  const idleScales = [0.45, 0.75, 0.55, 0.85, 0.45];

  // Heights mapping
  const barHeight = {
    sm: 10,
    md: 18,
    lg: 26,
  }[size];

  // Gaps to make soundwave >=45% of core width
  const gapClass = {
    sm: "gap-[2px]",
    md: "gap-[3.5px]",
    lg: "gap-[5px]",
  }[size];

  // Width styles
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
            // Ambient breathing/listening wave during silence, relative to idle heights
            animateVal = {
              scaleY: [idleScales[bar] * 0.7, idleScales[bar] * 1.3, idleScales[bar] * 0.7],
              transition: {
                duration: 1.2,
                delay: bar * 0.12,
                repeat: Infinity,
                repeatType: "reverse" as const,
                ease: "easeInOut",
              }
            };
          } else {
            // Fluid voice intake reaction
            animateVal = {
              scaleY: Math.min(1.8, idleScales[bar] + volume * 1.6),
              transition: {
                type: "spring",
                stiffness: 350,
                damping: 20,
              }
            };
          }
        } else if (state === "speaking") {
          // TTS pulse speaking
          animateVal = {
            scaleY: [idleScales[bar] * 0.5, idleScales[bar] * 1.9, idleScales[bar] * 0.5],
            transition: {
              duration: 0.35 + bar * 0.06,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            }
          };
        } else if (state === "thinking") {
          animateVal = {
            scaleY: [idleScales[bar] * 0.8, idleScales[bar] * 1.2, idleScales[bar] * 0.8],
            transition: {
              duration: 0.8 + bar * 0.1,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            }
          };
        } else {
          // Idle breathing
          animateVal = {
            scaleY: [idleScales[bar] * 0.8, idleScales[bar] * 1.2, idleScales[bar] * 0.8],
            transition: {
              duration: 2.2,
              delay: bar * 0.15,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            }
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
  const [pulseScale, setPulseScale] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dims = {
    sm: { container: "w-12 h-12", core: "w-9 h-9" },
    md: { container: "w-24 h-24", core: "w-16 h-16" },
    lg: { container: "w-36 h-36 md:w-40 md:h-40", core: "w-24 h-24 md:w-26 md:h-26" },
  }[size];

  // Speaking state: a voice-driven pulse scale
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
          className="absolute rounded-full pointer-events-none bg-gradient-to-tr from-accent/12 via-accent/18 to-accent/6"
          style={{
            inset: { sm: "-4px", md: "-16px", lg: "-32px" }[size],
            filter: { sm: "blur(8px)", md: "blur(20px)", lg: "blur(32px)" }[size],
          }}
          animate={{
            scale: state === "listening" ? 1.1 + volume * 0.15 : state === "speaking" ? 1.08 : 1.01,
            opacity: state === "listening" ? 0.75 : state === "speaking" ? 0.65 : state === "thinking" ? 0.55 : 0.35,
          }}
          transition={{
            scale: { type: "spring", stiffness: 120, damping: 20 },
            opacity: { duration: 0.4 },
          }}
        />
      )}

      {/* Contact shadow hugging the sphere's underside (the container is
          larger than the core, so anchor just below the core's bottom edge). */}
      <motion.div
        className="absolute pointer-events-none rounded-full blur-[5px] mix-blend-multiply dark:mix-blend-screen"
        style={{
          width: { sm: "24px", md: "44px", lg: "68px" }[size],
          height: { sm: "4px", md: "6px", lg: "9px" }[size],
          bottom: { sm: "2px", md: "9px", lg: "15px" }[size],
          left: "50%",
          // Centering must ride through motion's transform pipeline (x), or the
          // animated scaleX would overwrite a CSS translateX and shift it right.
          x: "-50%",
          background: "radial-gradient(ellipse at center, var(--accent-deep) 0%, transparent 70%)",
        }}
        animate={{
          scaleX: state === "listening" ? 1.05 + volume * 0.1 : 1,
          opacity: state === "listening" ? 0.5 : 0.4,
        }}
      />

      {/* Concentric listening ripples */}
      {state === "listening" && !prefersReducedMotion && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-accent/30 pointer-events-none"
              style={{
                width: { sm: "36px", md: "64px", lg: "96px" }[size],
                height: { sm: "36px", md: "64px", lg: "96px" }[size],
              }}
              animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
              transition={{
                duration: 2.0,
                repeat: Infinity,
                delay: i * 0.65,
                ease: "easeOut",
                repeatDelay: 0.2,
              }}
            />
          ))}
        </>
      )}

      {/* 3D-Illusion Core Sphere */}
      <motion.div
        className={`relative flex items-center justify-center rounded-full overflow-hidden shadow-lg select-none pointer-events-none ${dims.core}`}
        animate={{
          // Always a plain number — no keyframe arrays — so state transitions
          // never snap mid-cycle. Outer ambient glow handles the breathing.
          scale:
            state === "listening" ? 1.03
            : state === "speaking" ? 1.0 + volume * 0.08
            : 1,
        }}
        transition={{
          scale: { type: "spring", stiffness: 180, damping: 22 },
        }}
      >
        {/* Layer 1: Core Gradient (light from upper-left) */}
        <div 
          className="absolute inset-0 rounded-full" 
          style={{
            background: "radial-gradient(circle at 30% 30%, var(--orb-grad-1) 0%, var(--orb-grad-2) 55%, var(--orb-grad-3) 100%)"
          }}
        />

        {/* Layer 1b: Conic energy core (rotates when thinking or speaking) */}
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
