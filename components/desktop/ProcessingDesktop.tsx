"use client";

/**
 * Processing, desktop (spec D5) — a thinking orb over a stage checklist,
 * then a ready summary card with stat chips and "Start filling".
 */

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import VoiceOrb from "@/components/ui/VoiceOrb";
import { useProcessing, PROCESSING_STEPS } from "@/components/screens/useProcessing";
import { IconLoader, IconDoc, IconAlertCircle, IconPlay, IconRepeat, IconSparkle } from "@/components/icons";

function DrawnCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-ok"
      aria-hidden="true"
    >
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

export default function ProcessingDesktop() {
  const p = useProcessing();
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-7 pt-2 animate-fade-in">
      {!p.done && !p.failed ? (
        <div className="card w-full flex flex-col items-center gap-5 p-7">
          <VoiceOrb state="thinking" size="md" />
          <header className="text-center flex flex-col items-center gap-2">
            {/* Document Thumbnail / PDF Placeholder */}
            {p.thumbnailUrl ? (
              <img
                src={p.thumbnailUrl}
                alt="Document preview"
                className="h-16 w-12 rounded border border-line object-cover shadow-sm mt-1"
              />
            ) : (
              <div aria-hidden="true" className="grid h-16 w-12 place-items-center rounded border border-line bg-sunken text-soft mt-1">
                <IconDoc className="h-6 w-6" />
              </div>
            )}
            <h1 className="font-display text-3xl text-ink">Reading your form…</h1>
            <p className="mt-1 text-sm text-soft">This usually takes 20 to 40 seconds. I&rsquo;ll tell you when it&rsquo;s done.</p>
            <Link href="/" className="text-xs text-soft underline underline-offset-2 hover:text-ink mt-0.5 no-underline">
              Cancel
            </Link>
          </header>

          <div className="w-full">
            <StatusAnnouncer message={p.status} tone="info" />
          </div>

          <ol className="m-0 flex w-full list-none flex-col gap-1 border-t border-line/50 pt-5 w-full" aria-label="Analysis progress">
            {PROCESSING_STEPS.map((step) => {
              const state = p.stepState(step.key);
              return (
                <motion.li
                  key={step.key}
                  animate={
                    prefersReducedMotion
                      ? {}
                      : {
                          backgroundColor: state === "done" ? "rgba(21, 128, 61, 0.03)" : "rgba(21, 128, 61, 0)",
                          scale: state === "done" ? [1, 1.015, 1] : 1,
                        }
                  }
                  transition={{
                    backgroundColor: { type: "spring", stiffness: 300, damping: 20 },
                    scale: { type: "tween", duration: 0.35, ease: "easeOut" }
                  }}
                  className="flex min-h-12 items-center gap-4 border-b border-line/40 pb-1 last:border-0 rounded-lg px-2 -mx-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-300 ${
                      state === "done"
                        ? "bg-ok-soft"
                        : state === "active"
                          ? "bg-accent-soft text-accent ring-2 ring-accent/15"
                          : "border border-line text-faint"
                    }`}
                  >
                    {state === "done" ? (
                      <DrawnCheck />
                    ) : state === "active" ? (
                      <IconLoader className="h-4 w-4 animate-spin" />
                    ) : null}
                  </span>
                  <span className={`text-sm ${state === "active" ? "font-bold text-ink" : state === "pending" ? "text-faint" : "font-semibold text-soft"}`}>
                    {step.label}
                    {state === "active" && p.detail ? <span className="font-normal text-soft"> · {p.detail}</span> : ""}
                    <span className="sr-only">
                      {state === "done" ? " finished" : state === "active" ? " in progress" : " waiting"}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </div>
      ) : (
        <>
          <VoiceOrb state="idle" size="md" />
          <header className="text-center">
            <h1 className="font-display text-3xl text-ink">
              {p.failed ? "That didn’t work" : "Your form is ready"}
            </h1>
          </header>

          <div className="w-full">
            <StatusAnnouncer message={p.status} tone={p.failed ? "error" : p.done ? "success" : "info"} />
          </div>

          {p.done && p.fieldCount > 0 && (
            <div className="card flex w-full flex-col gap-5 p-7 animate-slide-up">
              <div className="flex items-center gap-4 border-b border-line pb-4">
                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ok-soft text-ok">
                  <IconDoc className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="font-display text-2xl leading-tight text-ink">{p.fieldCount} fields detected</h2>
                  {p.record?.isAcroForm && (
                    <p className="mt-0.5 text-xs text-soft">This PDF has built-in fillable fields — answers land precisely.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {p.autofillable > 0 && (
                  <button
                    type="button"
                    onClick={p.goReview}
                    aria-label={`See the ${p.autofillable} auto-fill fields`}
                    className="chip bg-accent-soft text-xs font-bold text-accent cursor-pointer hover:bg-accent-soft/80"
                  >
                    <IconSparkle className="h-3.5 w-3.5" aria-hidden="true" />
                    {p.autofillable} auto-fill from your profile
                  </button>
                )}
                {p.unclearCount > 0 && (
                  <button
                    type="button"
                    onClick={p.goReview}
                    aria-label={`See the ${p.unclearCount} unclear fields`}
                    className="chip bg-warn-soft text-xs font-bold text-warn cursor-pointer hover:bg-warn-soft/80"
                  >
                    <IconAlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {p.unclearCount} unclear — I&rsquo;ll double-check with you
                  </button>
                )}
              </div>

              {p.shapesNote && (
                <p className="rounded-2xl border border-line bg-sunken p-3 text-[11px] leading-relaxed text-soft">
                  Layout grid detection was limited, so field order was estimated sequentially.
                </p>
              )}

              <div className="mt-1 flex flex-wrap gap-3">
                <button type="button" className="btn-primary min-h-12 px-8" onClick={p.goFill}>
                  <IconPlay className="h-4 w-4 fill-current" />
                  Start filling
                </button>
                <button type="button" className="btn-secondary min-h-12 px-6" onClick={p.goReview}>
                  Preview all fields first
                </button>
              </div>
            </div>
          )}

          {(p.failed || (p.done && p.fieldCount === 0)) && (
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link href="/upload" className="btn-primary min-h-12 px-6 no-underline">
                <IconRepeat className="h-4 w-4" />
                Upload again
              </Link>
              <Link href="/scan" className="btn-secondary min-h-12 px-6 no-underline">
                Scan again
              </Link>
              <Link href="/" className="btn-secondary min-h-12 px-6 no-underline">
                Go home
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
