"use client";

/**
 * Processing, mobile (spec M5) — thinking orb, stage checklist, then a
 * full-width ready card with a big Start button above the orb dock.
 */

import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import VoiceOrb from "@/components/ui/VoiceOrb";
import { useProcessing, PROCESSING_STEPS } from "@/components/screens/useProcessing";
import { IconCheck, IconLoader, IconDoc, IconAlertCircle, IconPlay, IconRepeat, IconSparkle } from "@/components/icons";

export default function ProcessingMobile() {
  const p = useProcessing();

  return (
    <div className="flex flex-col items-center gap-6 pb-6 animate-fade-in">
      <VoiceOrb state={p.done || p.failed ? "idle" : "thinking"} size="md" className="mt-2" />

      <header className="text-center">
        <h1 className="font-display text-2xl leading-tight text-ink">
          {p.failed ? "That didn't work" : p.done ? "Your form is ready" : "Reading your form…"}
        </h1>
        {!p.done && !p.failed && <p className="mt-1.5 text-sm text-soft">Usually 20 to 40 seconds.</p>}
      </header>

      <div className="w-full">
        <StatusAnnouncer message={p.status} tone={p.failed ? "error" : p.done ? "success" : "info"} />
      </div>

      {!p.done && !p.failed && (
        <ol className="card m-0 flex w-full list-none flex-col gap-1 p-5" aria-label="Analysis progress">
          {PROCESSING_STEPS.map((step) => {
            const state = p.stepState(step.key);
            return (
              <li key={step.key} className="flex min-h-12 items-center gap-3.5 border-b border-line/40 pb-1 last:border-0">
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-300 ${
                    state === "done"
                      ? "bg-ok-soft text-ok"
                      : state === "active"
                        ? "bg-accent-soft text-accent ring-2 ring-accent/15"
                        : "border border-line text-faint"
                  }`}
                >
                  {state === "done" ? (
                    <IconCheck className="h-4 w-4" strokeWidth={3} />
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
              </li>
            );
          })}
        </ol>
      )}

      {p.done && p.fieldCount > 0 && (
        <div className="card flex w-full flex-col gap-4 p-5 animate-slide-up">
          <div className="flex items-center gap-3.5 border-b border-line pb-3.5">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ok-soft text-ok">
              <IconDoc className="h-5.5 w-5.5" />
            </span>
            <div>
              <h2 className="font-display text-xl leading-tight text-ink">{p.fieldCount} fields detected</h2>
              {p.record?.isAcroForm && <p className="mt-0.5 text-xs text-soft">Built-in fillable PDF.</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {p.autofillable > 0 && (
              <span className="chip bg-accent-soft text-[11px] font-bold text-accent">
                <IconSparkle className="h-3.5 w-3.5" aria-hidden="true" />
                {p.autofillable} auto-fill
              </span>
            )}
            {p.unclearCount > 0 && (
              <span className="chip bg-warn-soft text-[11px] font-bold text-warn">
                <IconAlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {p.unclearCount} unclear
              </span>
            )}
          </div>

          {p.shapesNote && (
            <p className="rounded-2xl border border-line bg-sunken p-3 text-[11px] leading-relaxed text-soft">
              Layout detection was limited — field order was estimated.
            </p>
          )}

          <button type="button" className="btn-primary min-h-14 w-full" onClick={p.goFill}>
            <IconPlay className="h-4 w-4 fill-current" />
            Start filling
          </button>
          <button type="button" className="btn-secondary min-h-13 w-full" onClick={p.goReview}>
            Preview all fields first
          </button>
        </div>
      )}

      {(p.failed || (p.done && p.fieldCount === 0)) && (
        <div className="flex w-full flex-col gap-2.5">
          <Link href="/upload" className="btn-primary min-h-14 w-full no-underline">
            <IconRepeat className="h-4 w-4" />
            Upload again
          </Link>
          <Link href="/scan" className="btn-secondary min-h-13 w-full no-underline">
            Scan again
          </Link>
          <Link href="/" className="btn-secondary min-h-13 w-full no-underline">
            Go home
          </Link>
        </div>
      )}
    </div>
  );
}
