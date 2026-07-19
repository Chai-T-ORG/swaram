"use client";

/**
 * One-time cloud-speech consent dialog. Shown by the shells when the voice
 * engine reports the notice is needed; the actions call straight into the
 * engine (acknowledge + start listening) — same behavior on both platforms,
 * different dress: centered modal on desktop, bottom sheet on mobile.
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CLOUD_FALLBACK_NOTICE } from "@/lib/voice/speechToText";
import { useVoiceShell } from "./VoiceProvider";
import { IconX } from "@/components/icons";

export default function ConsentDialog({ variant }: { variant: "modal" | "sheet" }) {
  const { showNotice, dismissNotice, acknowledgeAndListen } = useVoiceShell();
  const prefersReducedMotion = useReducedMotion();

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Before we use your voice</h2>
        <button
          type="button"
          aria-label="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-soft hover:bg-surface cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
          onClick={dismissNotice}
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-5 text-[0.95rem] leading-relaxed text-soft">{CLOUD_FALLBACK_NOTICE}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary min-h-12" onClick={acknowledgeAndListen}>
          Continue with voice
        </button>
        <button type="button" className="btn-secondary min-h-12" onClick={dismissNotice}>
          Use buttons instead
        </button>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {showNotice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Speech privacy notice"
          className={`fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm ${
            variant === "sheet" ? "flex items-end" : "grid place-items-center p-4"
          }`}
        >
          <motion.div
            initial={
              variant === "sheet"
                ? { y: prefersReducedMotion ? 0 : "100%" }
                : { scale: prefersReducedMotion ? 1 : 0.95, opacity: 0 }
            }
            animate={
              variant === "sheet"
                ? { y: 0 }
                : { scale: 1, opacity: 1 }
            }
            exit={
              variant === "sheet"
                ? { y: prefersReducedMotion ? 0 : "100%" }
                : { scale: prefersReducedMotion ? 1 : 0.95, opacity: 0 }
            }
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className={
              variant === "sheet"
                ? "w-full rounded-t-[28px] border-t border-line bg-raised p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-float"
                : "card max-w-md w-full"
            }
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
