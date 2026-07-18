"use client";

/**
 * One-time cloud-speech consent dialog. Shown by the shells when the voice
 * engine reports the notice is needed; the actions call straight into the
 * engine (acknowledge + start listening) — same behavior on both platforms,
 * different dress: centered modal on desktop, bottom sheet on mobile.
 */

import { CLOUD_FALLBACK_NOTICE } from "@/lib/voice/speechToText";
import { useVoiceShell } from "./VoiceProvider";
import { IconX } from "@/components/icons";

export default function ConsentDialog({ variant }: { variant: "modal" | "sheet" }) {
  const { showNotice, dismissNotice, acknowledgeAndListen } = useVoiceShell();
  if (!showNotice) return null;

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Before we use your voice</h2>
        <button
          type="button"
          aria-label="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-soft hover:bg-surface"
          onClick={dismissNotice}
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-5 text-[0.95rem] leading-relaxed text-soft">{CLOUD_FALLBACK_NOTICE}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={acknowledgeAndListen}>
          Continue with voice
        </button>
        <button type="button" className="btn-secondary" onClick={dismissNotice}>
          Use buttons instead
        </button>
      </div>
    </>
  );

  if (variant === "sheet") {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Speech privacy notice"
        className="fixed inset-0 z-[60] flex items-end bg-ink/40 backdrop-blur-sm"
      >
        <div className="w-full rounded-t-[28px] border-t border-line bg-raised p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-float animate-slide-up">
          {body}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Speech privacy notice"
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="card max-w-md">{body}</div>
    </div>
  );
}
