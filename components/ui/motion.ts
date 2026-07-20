"use client";

import { type Variants, useReducedMotion } from "framer-motion";

/**
 * Swaram Global Motion Tiers & Spring Specs
 * - Immediate interaction feedback (taps/buttons): 120–180ms
 * - State changes, cards & inputs: 180–280ms
 * - Page & step transitions: 250–350ms
 * - Ambient effects: slow, subtle, 60fps composited
 */
export const SPRING_ORB = { type: "spring" as const, stiffness: 180, damping: 20 };
export const SPRING_FAST = { type: "spring" as const, stiffness: 260, damping: 24 };
export const SPRING_NORMAL = { type: "spring" as const, stiffness: 210, damping: 22 };
export const SPRING_SLOW = { type: "spring" as const, stiffness: 120, damping: 18 };

export const TRANSITION_EASE = { type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.25 };

/**
 * Hook to retrieve motion transition configs while respecting prefers-reduced-motion.
 */
export function useSwaramTransition(
  config: "orb" | "fast" | "normal" | "slow" | "ease",
  delay: number = 0
) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return { type: "tween" as const, duration: 0.05, delay: 0 };
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
export function useStaggerContainer(staggerDelay = 0.05, delayChildren = 0): Variants {
  const shouldReduce = useReducedMotion();
  return {
    hidden: {},
    visible: {
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
export function useItemTransition(yOffset = 8): Variants {
  const shouldReduce = useReducedMotion();
  return {
    hidden: { opacity: 0, y: shouldReduce ? 0 : yOffset },
    visible: {
      opacity: 1,
      y: 0,
      transition: shouldReduce
        ? { duration: 0.05 }
        : { type: "spring" as const, stiffness: 210, damping: 22 },
    },
    exit: { opacity: 0, y: shouldReduce ? 0 : -yOffset, transition: { duration: 0.15 } },
  };
}

/**
 * Common page route transition variants.
 */
export function usePageTransition() {
  const shouldReduce = useReducedMotion();
  return {
    initial: { opacity: 0, y: shouldReduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: shouldReduce ? 0 : -10 },
    transition: shouldReduce ? { duration: 0.05 } : { duration: 0.25, ease: "easeInOut" as const },
  };
}
