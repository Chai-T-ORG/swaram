"use client";

/**
 * Complete/export, desktop (spec D8) — success moment, result card with equal
 * action buttons, and the save-to-profile offer card.
 */

import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useComplete } from "@/components/screens/useComplete";
import {
  IconCheck,
  IconDownload,
  IconShare,
  IconPrinter,
  IconWave,
  IconPause,
  IconHome,
  IconDoc,
  IconArrowLeft,
  IconInfo,
} from "@/components/icons";

export default function CompleteDesktop() {
  const c = useComplete();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 animate-fade-in">
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok shadow-sm">
          <IconCheck className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="font-display text-4xl text-ink">Your form is ready</h1>
        <div className="w-full">
          <StatusAnnouncer message={c.status} tone={c.tone} />
        </div>
      </div>

      <section className="card p-7" aria-label="Export options">
        {c.record && (
          <p className="mb-4 border-b border-line pb-4 text-sm text-soft">
            <span className="font-semibold text-ink">{c.record.name.replace(/\.(pdf|jpe?g|png)$/i, "")} — filled.pdf</span>
            {" · "}
            {c.record.fields.length} fields
          </p>
        )}
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" className="btn-primary min-h-13" onClick={c.download} disabled={!c.pdfUrl}>
            <IconDownload className="h-4.5 w-4.5" />
            Download PDF
          </button>

          {c.canShare && (
            <button type="button" className="btn-secondary min-h-13" onClick={c.share} disabled={!c.pdfBlob}>
              <IconShare className="h-4.5 w-4.5" />
              Share
            </button>
          )}

          <button type="button" className="btn-secondary min-h-13" onClick={c.print} disabled={!c.pdfUrl}>
            <IconPrinter className="h-4.5 w-4.5" />
            Print
          </button>

          <button type="button" className="btn-secondary min-h-13" onClick={c.readBack}>
            {c.reading ? <IconPause className="h-4.5 w-4.5" /> : <IconWave className="h-4.5 w-4.5" />}
            {c.reading ? "Stop reading" : "Read it back to me"}
          </button>
        </div>
      </section>

      {c.profileOffer && (
        <section className="card flex flex-col gap-4.5 p-7 animate-slide-up" aria-label="Save to profile">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl text-ink">
              <IconInfo className="h-4.5 w-4.5 text-accent" />
              Remember these details?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-soft">
              I can save these to your on-device profile and auto-fill them next time. ID numbers like Aadhaar are never
              saved.
            </p>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 rounded-2xl border border-line bg-sunken/60 p-4">
            {Object.entries(c.profileOffer).map(([key, value]) => (
              <li
                key={key}
                className="flex justify-between gap-3 border-b border-line pb-2 pt-2 text-sm first:pt-0 last:border-0 last:pb-0"
              >
                <span className="font-bold capitalize text-soft">{key.replace(/_/g, " ")}</span>
                <span className="max-w-[240px] truncate font-semibold text-ink">{value}</span>
              </li>
            ))}
          </ul>

          {c.profileSaved ? (
            <p className="flex items-center gap-2 text-sm font-bold leading-none text-ok">
              <IconCheck className="h-4.5 w-4.5" />
              Saved to your profile.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-3">
              <button type="button" className="btn-primary min-h-12 px-5 text-sm" onClick={c.saveProfile}>
                Yes, remember them
              </button>
              <button type="button" className="btn-secondary min-h-12 px-4 text-sm" onClick={() => c.setProfileOffer(null)}>
                No, don&apos;t save
              </button>
            </div>
          )}
        </section>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-3 border-t border-line/65 pt-6">
        <Link href="/" className="btn-secondary min-h-12 px-6 text-sm no-underline">
          <IconHome className="h-4 w-4" />
          Go home
        </Link>
        <Link href="/history" className="btn-secondary min-h-12 px-6 text-sm no-underline">
          <IconDoc className="h-4 w-4" />
          My forms
        </Link>
        <Link href={`/review/${c.formId}`} className="btn-secondary min-h-12 px-6 text-sm no-underline">
          <IconArrowLeft className="h-4 w-4" />
          Back to review
        </Link>
      </div>
    </div>
  );
}
