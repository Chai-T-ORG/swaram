"use client";

/**
 * Review, desktop (spec D7) — read-aloud header, stat tiles, large-type field
 * rows with inline edit, and a clear finish action.
 */

import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import FieldEditForm from "@/components/ui/FieldEditForm";
import { useReview } from "@/components/screens/useReview";
import {
  IconArrowRight,
  IconEdit,
  IconWave,
  IconPause,
  IconCheck,
  IconAlertCircle,
} from "@/components/icons";

export default function ReviewDesktop() {
  const r = useReview();

  if (!r.record) {
    return <p className="animate-pulse py-16 text-center text-sm font-semibold text-soft">Loading your answers…</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 animate-fade-in">
      <header className="border-b border-line pb-5">
        <span className="eyebrow">Almost done</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Review your answers</h1>
      </header>

      <StatusAnnouncer message={r.status} tone={r.tone} />

      <section className="grid grid-cols-4 gap-3.5" aria-label="Answer summary">
        <SummaryTile label="Answered" value={r.counts.answered} cls="bg-ok-soft text-ok" />
        <SummaryTile label="Auto-filled" value={r.counts.autofilled} cls="bg-accent-soft text-accent" />
        <SummaryTile label="Skipped" value={r.counts.skipped + r.counts.pending} cls="bg-warn-soft text-warn" />
        <SummaryTile label="Unclear" value={r.counts.unclear} cls="bg-sunken text-soft" />
      </section>

      <div className="flex flex-wrap gap-3">
        {r.skippedCount > 0 && (
          <button type="button" className="btn-primary min-h-12 px-5 text-sm" onClick={r.goSkipped}>
            Answer skipped fields ({r.skippedCount})
            <IconArrowRight className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="btn-secondary min-h-12 px-5 text-sm" onClick={r.readBack}>
          {r.reading ? <IconPause className="h-4 w-4" /> : <IconWave className="h-4 w-4" />}
          {r.reading ? "Stop reading" : "Read all answers aloud"}
        </button>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3.5 p-0" aria-label="All fields">
        {r.sortedFields.map((field, index) => (
          <li key={field.id} className="card p-5 transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-faint">
                  {index + 1}. {field.label}
                </p>

                {r.editingId === field.id ? (
                  <FieldEditForm r={r} field={field} />
                ) : (
                  <p className="mt-2 text-lg font-semibold leading-normal text-ink">
                    {field.status === "skipped" || field.status === "unclear" ? (
                      <span className="inline-flex items-center gap-1.5 text-base font-semibold text-warn">
                        <IconAlertCircle className="h-4.5 w-4.5" />
                        Skipped
                      </span>
                    ) : (
                      field.value || <span className="text-base font-normal italic text-faint">Blank</span>
                    )}
                  </p>
                )}
              </div>

              {r.editingId !== field.id && (
                <button
                  type="button"
                  className="btn-secondary min-h-11 shrink-0 px-4 text-xs"
                  onClick={() => r.startEdit(field)}
                  aria-label={`Edit ${field.label}`}
                >
                  <IconEdit className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between border-t border-line/65 pt-6">
        <Link href="/" className="link-plain text-sm font-semibold">
          Back to home
        </Link>
        <button type="button" className="btn-primary min-h-13 px-10 text-sm" onClick={r.continueToComplete}>
          Looks good — finish
          <IconCheck className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-line p-4 text-center ${cls}`}>
      <p className="font-display text-3xl leading-none">{value}</p>
      <p className="mt-2 text-[10px] font-bold uppercase leading-none tracking-wider opacity-85">{label}</p>
    </div>
  );
}
