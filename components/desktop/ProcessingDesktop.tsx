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
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-7 pt-2 animate-fade-in">
      {!p.done && !p.failed ? (
        <div className="card w-full p-7">
          <div className="flex w-full items-start gap-8">
            {/* Left Column: Document Thumbnail with Laser Sweep */}
            <div className="w-64 shrink-0 flex flex-col items-center justify-center bg-sunken/40 rounded-xl border border-line p-4">
              <div className="relative overflow-hidden rounded-lg border border-line/60 shadow-sm bg-white w-full">
                {p.thumbnailUrl ? (
                  <img
                    src={p.thumbnailUrl}
                    alt="Document preview"
                    className="w-full h-auto max-h-[320px] object-contain block rounded"
                  />
                ) : (
                  <div aria-hidden="true" className="grid h-64 w-full place-items-center bg-sunken text-soft">
                    <IconDoc className="h-10 w-10" />
                  </div>
                )}
                {/* Laser scan line clipped to thumbnail container */}
                <div
                  suppressHydrationWarning
                  className={
                    prefersReducedMotion
                      ? "absolute inset-0 bg-accent/5 ring-1 ring-inset ring-accent/30 pointer-events-none"
                      : "laser-line pointer-events-none"
                  }
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Right Column: Orb, Header, Progress Bar, and Checklist */}
            <div className="flex flex-1 flex-col gap-4 min-w-0">
              <div className="flex items-center gap-4">
                <VoiceOrb state="thinking" size="sm" />
                <div className="flex flex-col">
                  <h1 className="font-display text-2xl text-ink">Reading your form…</h1>
                  <p className="text-xs text-soft">This usually takes 20 to 40 seconds. I&rsquo;ll tell you when it&rsquo;s done.</p>
                </div>
                <Link href="/" className="ml-auto text-xs text-soft underline underline-offset-2 hover:text-ink no-underline">
                  Cancel
                </Link>
              </div>

              <div className="w-full">
                <StatusAnnouncer message={p.status} tone="info" />
              </div>

              {/* Slim Determinate Progress Bar */}
              <div className="w-full bg-sunken h-1.5 rounded-full overflow-hidden border border-line/40 my-1">
                <div
                  className="bg-accent h-full transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${Math.round(p.progressRatio * 100)}%` }}
                />
              </div>

              <ol className="m-0 flex w-full list-none flex-col gap-1 border-t border-line/50 pt-3" aria-label="Analysis progress">
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
                      className="flex min-h-11 items-center gap-3 border-b border-line/40 pb-1 last:border-0 rounded-lg px-2 -mx-2 text-left"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300 ${
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
                          <IconLoader className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                      </span>
                      <span className={`text-xs ${state === "active" ? "font-bold text-ink" : state === "pending" ? "text-faint" : "font-semibold text-soft"}`}>
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
          </div>
        </div>
      ) : (
        <>
          <VoiceOrb state="idle" size="md" />
          <header className="text-center">
            <h1 className="font-display text-3xl text-ink">
              {p.failed ? "That didn’t work" : "Your form is ready"}
            </h1>
          </header>

          <div className="w-full max-w-2xl">
            <StatusAnnouncer message={p.status} tone={p.failed ? "error" : p.done ? "success" : "info"} />
          </div>

          {p.done && p.fieldCount > 0 && (
            <div className="card flex w-full max-w-2xl flex-col gap-5 p-7 animate-slide-up">
              <div className="flex items-center gap-5 border-b border-line pb-4">
                {/* Persistent Thumbnail (No laser line) */}
                <div className="relative overflow-hidden rounded-lg border border-line/60 shadow-sm bg-white h-20 w-16 shrink-0 grid place-items-center">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt="Document preview"
                      className="h-full w-full object-cover block"
                    />
                  ) : (
                    <span aria-hidden="true" className="grid h-full w-full place-items-center bg-sunken text-soft">
                      <IconDoc className="h-6 w-6" />
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-2xl leading-tight text-ink">{p.fieldCount} fields detected</h2>
                  {p.typeBreakdown && (
                    <p className="text-xs font-semibold text-soft">{p.typeBreakdown}</p>
                  )}
                  {p.record?.isAcroForm && (
                    <p className="text-xs text-soft">This PDF has built-in fillable fields — answers land precisely.</p>
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
