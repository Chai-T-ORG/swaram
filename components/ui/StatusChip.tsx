"use client";

/**
 * Status chips — always icon + label + color, never color alone (the user may
 * not perceive color; the label is the information).
 */

import { motion, useReducedMotion } from "framer-motion";
import type { FormStatus, FieldStatus } from "@/lib/types";
import {
  IconCheck,
  IconClock,
  IconMic,
  IconPlay,
  IconAlertCircle,
  IconSkip,
  IconSparkle,
} from "@/components/icons";

const FORM_STATUS: Record<FormStatus, { label: string; icon: typeof IconCheck; cls: string }> = {
  processing: { label: "Preparing", icon: IconClock, cls: "bg-warn-soft text-warn" },
  ready: { label: "Ready to fill", icon: IconPlay, cls: "bg-accent-soft text-accent" },
  filling: { label: "In progress", icon: IconMic, cls: "bg-accent-soft text-accent" },
  review: { label: "In review", icon: IconAlertCircle, cls: "bg-warn-soft text-warn" },
  complete: { label: "Complete", icon: IconCheck, cls: "bg-ok-soft text-ok" },
};

const FIELD_STATUS: Record<FieldStatus, { label: string; icon: typeof IconCheck; cls: string }> = {
  pending: { label: "Pending", icon: IconClock, cls: "bg-sunken text-soft" },
  answered: { label: "Answered", icon: IconCheck, cls: "bg-ok-soft text-ok" },
  autofilled: { label: "Auto-filled", icon: IconSparkle, cls: "bg-accent-soft text-accent" },
  skipped: { label: "Skipped", icon: IconSkip, cls: "bg-warn-soft text-warn" },
  unclear: { label: "Unclear", icon: IconAlertCircle, cls: "bg-bad-soft text-bad" },
};

export function StatusChip({ status, className = "" }: { status: FormStatus; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const s = FORM_STATUS[status];
  const Icon = s.icon;
  return (
    <motion.span
      key={status}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`chip ${s.cls} text-[11px] font-bold ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </motion.span>
  );
}

export function FieldStatusChip({ status, className = "" }: { status: FieldStatus; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const s = FIELD_STATUS[status];
  const Icon = s.icon;
  return (
    <motion.span
      key={status}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`chip ${s.cls} text-[11px] font-bold ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </motion.span>
  );
}
