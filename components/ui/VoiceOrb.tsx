"use client";

/**
 * VoiceOrb — The heart of Swaram's interface. Re-engineered as a professional,
 * high-fidelity 3D-illusion liquid-morphing voice sphere (reminiscent of Gemini Live,
 * Siri, and ChatGPT Live).
 * Uses layered theme-aware green gradients, mix-blend-modes, organic border-radius morphing,
 * and an animated active soundwave indicator in the center.
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
  
  const barHeight = {
    sm: 8,
    md: 14,
    lg: 20,
  }[size];

  const gapClass = {
    sm: "gap-0.5",
    md: "gap-0.75",
    lg: "gap-1.5",
  }[size];

  const widthStyle = {
    sm: "w-[1.5px]",
    md: "w-[2.5px]",
    lg: "w-[3.5px]",
  }[size];

  return (
    <div className={`flex items-center justify-center ${gapClass}`}>
      {bars.map((bar) => {
        let animateVal: any = { scaleY: 1 };
        
        if (state === "listening") {
          if (volume < 0.05) {
            // Ambient breathing/listening wave during silence
            animateVal = {
              scaleY: [0.35, 0.65, 0.35],
              transition: {
                duration: 1.2,
                delay: bar * 0.12,
                repeat: Infinity,
                repeatType: "reverse" as const,
                ease: "easeInOut",
              }
            };
          } else {
            // Fluid voice intake reaction - capped to prevent overfiring
            animateVal = {
              scaleY: Math.min(1.8, 0.45 + volume * 1.25),
              transition: {
                type: "spring",
                stiffness: 300,
                damping: 24,
              }
            };
          }
        } else if (state === "speaking") {
          animateVal = {
            scaleY: [0.3, 1.4, 0.3],
            transition: {
              duration: 0.4 + bar * 0.08,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            }
          };
        } else if (state === "thinking") {
          animateVal = {
            scaleY: [0.6, 1.0, 0.6],
            transition: {
              duration: 0.9 + bar * 0.12,
              repeat: Infinity,
              repeatType: "reverse" as const,
              ease: "easeInOut",
            }
          };
        } else {
          animateVal = {
            scaleY: [0.4, 0.6, 0.4],
            transition: {
              duration: 2.0,
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
  const [rippleTrigger, setRippleTrigger] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dims = {
    sm: { container: "w-12 h-12", core: "w-9 h-9", outerPulse: "-6px", innerPulse: "-2px" },
    md: { container: "w-24 h-24", core: "w-16 h-16", outerPulse: "-12px", innerPulse: "-6px" },
    lg: { container: "w-36 h-36 md:w-40 md:h-40", core: "w-24 h-24 md:w-26 md:h-26", outerPulse: "-24px", innerPulse: "-12px" },
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

  // Sync ripple on transition to listening state
  useEffect(() => {
    if (state === "listening") {
      setRippleTrigger((prev) => prev + 1);
    }
  }, [state]);

  const scaleValue = prefersReducedMotion
    ? 1
    : state === "listening"
    ? 1 + volume * 0.35
    : state === "speaking"
    ? pulseScale
    : 1;

  const ringScaleValue = prefersReducedMotion
    ? 1
    : state === "listening"
    ? 1 + volume * 0.2
    : state === "speaking"
    ? 1 + (pulseScale - 1) * 0.6
    : 1;

  const outerPulseOpacity = state === "listening" ? 0.35 + volume * 0.65 : state === "speaking" ? 0.45 : 0.12;
  const innerPulseOpacity = state === "listening" ? 0.45 + volume * 0.55 : state === "speaking" ? 0.55 : 0.2;

  // CSS animation name mapping based on state and motion preference
  const morphClass1 = prefersReducedMotion ? "rounded-full" : "liquid-layer-1";
  const morphClass2 = prefersReducedMotion ? "rounded-full" : "liquid-layer-2";
  const morphClass3 = prefersReducedMotion ? "rounded-full" : "liquid-layer-3";

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
          className="absolute -inset-3 rounded-full bg-gradient-to-tr from-accent/10 via-accent/15 to-accent/5 filter blur-lg pointer-events-none"
          animate={{
            scale: state === "listening" ? 1.1 + volume * 0.15 : state === "speaking" ? 1.08 : 1.01,
            opacity: state === "listening" ? 0.6 : state === "speaking" ? 0.5 : state === "thinking" ? 0.45 : 0.25,
          }}
          transition={{
            scale: { type: "spring", stiffness: 120, damping: 20 },
            opacity: { duration: 0.4 },
          }}
        />
      )}

      {/* Ripple ring on listening activate */}
      {!prefersReducedMotion && state === "listening" && (
        <motion.div
          key={`ripple-${rippleTrigger}`}
          className="absolute rounded-full border border-accent/40 bg-transparent pointer-events-none"
          style={{ inset: "0px" }}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      )}

      {/* Concentric rings */}
      <motion.div
        className="absolute rounded-full border border-accent/20 bg-accent/3 pointer-events-none"
        style={{ inset: dims.outerPulse, opacity: outerPulseOpacity }}
        animate={{ scale: scaleValue }}
        transition={{ type: "spring", stiffness: 180, damping: 15 }}
      />
      <motion.div
        className="absolute rounded-full border border-accent/35 bg-accent/6 pointer-events-none"
        style={{ inset: dims.innerPulse, opacity: innerPulseOpacity }}
        animate={{ scale: ringScaleValue }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
      />

      {/* 3D-Illusion Liquid Core Sphere */}
      <motion.div
        className={`relative flex items-center justify-center rounded-full overflow-hidden shadow-lg select-none pointer-events-none ${dims.core}`}
        animate={{
          scale: state === "listening" ? [1.0, 1.05, 1.0] : state === "speaking" ? 1 + volume * 0.15 : 1,
          rotate: state === "thinking" && !prefersReducedMotion ? 360 : 0,
        }}
        transition={{
          scale: state === "listening"
            ? { repeat: Infinity, duration: 2.2, ease: "easeInOut" }
            : { type: "spring", stiffness: 240, damping: 20 },
          rotate: { repeat: Infinity, duration: 4, ease: "linear" },
        }}
      >
        {/* Layer 1: Base Swirling Gradient (Forest Green / Dark Emerald) */}
        <div 
          className={`absolute inset-0 filter blur-[12px] opacity-80 ${morphClass1}`} 
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #1e5138 50%, #123021 100%)"
          }}
        />

        {/* Layer 2: Swirling Sage & Mint Blend */}
        <div 
          className={`absolute inset-0 filter blur-[14px] mix-blend-screen opacity-75 ${morphClass2}`} 
          style={{
            background: "linear-gradient(225deg, #475b4c 0%, #8fbf9b 50%, #2e3d30 100%)"
          }}
        />

        {/* Layer 3: Soft Silver-Mint Accent */}
        <div 
          className={`absolute inset-[-10%] filter blur-[10px] mix-blend-overlay opacity-85 ${morphClass3}`}
          style={{
            background: "linear-gradient(45deg, #c8d6cb 0%, var(--accent) 50%, #475b4c 100%)"
          }}
        />

        {/* Specular glossy glass reflection overlay */}
        <div 
          className="absolute top-0.5 left-1 right-1 h-[35%] rounded-[50%_50%_40%_40%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none mix-blend-overlay z-10" 
        />

        {/* Live soundwave animated center */}
        <div className="relative z-20 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
          <AnimatedSoundwave state={state} volume={volume} size={size} />
        </div>
      </motion.div>
    </div>
  );
}
