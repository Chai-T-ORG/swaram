"use client";

import React, { useState, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Springs definition as requested by the direction:
 * - Softer spring for the orb.
 * - Faster spring for small elements/inputs: stiffness 260, damping 24.
 * - Standard spring for card and normal container transitions.
 */
export const SPRING_ORB = { type: "spring", stiffness: 180, damping: 20 };
export const SPRING_FAST = { type: "spring", stiffness: 260, damping: 24 };
export const SPRING_NORMAL = { type: "spring", stiffness: 210, damping: 22 };
export const SPRING_SLOW = { type: "spring", stiffness: 120, damping: 18 };

export const TRANSITION_EASE = { type: "tween", ease: "easeInOut", duration: 0.25 };

/**
 * Hook to retrieve the appropriate motion transition config,
 * honoring prefers-reduced-motion.
 */
export function useSwaramTransition(
  config: "orb" | "fast" | "normal" | "slow" | "ease",
  delay: number = 0
) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return { type: "tween", duration: 0.05, delay: 0 };
  }

  const typeMap = {
    orb: SPRING_ORB,
    fast: SPRING_FAST,
    normal: SPRING_NORMAL,
    slow: SPRING_SLOW,
    ease: TRANSITION_EASE,
  };

  return {
    ...typeMap[config],
    delay,
  };
}

/**
 * Stagger container variants.
 */
export function useStaggerContainer(staggerDelay = 0.06, delayChildren = 0) {
  const shouldReduce = useReducedMotion();
  return {
    initial: {},
    animate: {
      transition: {
        staggerChildren: shouldReduce ? 0 : staggerDelay,
        delayChildren,
      },
    },
  };
}

/**
 * Helper motion variant properties for staggered entrance.
 */
export function useItemTransition(yOffset = 8) {
  const shouldReduce = useReducedMotion();
  return {
    initial: { opacity: 0, y: shouldReduce ? 0 : yOffset },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: shouldReduce ? 0 : -yOffset },
  };
}
