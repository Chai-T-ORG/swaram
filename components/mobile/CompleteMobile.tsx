"use client";

/**
 * Complete/export, mobile (spec M8) — success moment, stacked full-width
 * actions (Download first), then the save-to-profile offer.
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
  IconInfo,
} from "@/components/icons";

export default function CompleteMobile() {
  const c = useComplete();

  return (
    <div className="flex flex-col gap-6 pb-6 animate-fade-in">
      <div className="flex flex-col items-center gap-3.5 pt-4 text-center">
        <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok shadow-sm">
          <IconCheck className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="font-display text-[1.75rem] leading-tight text-ink">Your form is ready</h1>
        <div className="w-full">
          <StatusAnnouncer message={c.status} tone={c.tone} />
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-label="Export options">
        <button type="button" className="btn-primary min-h-14 w-full" onClick={c.download} disabled={!c.pdfUrl}>
          <IconDownload className="h-4.5 w-4.5" />
          Download PDF
        </button>
        {c.canShare && (
          <button type="button" className="btn-secondary min-h-13 w-full" onClick={c.share} disabled={!c.pdfBlob}>
            <IconShare className="h-4.5 w-4.5" />
            Share
          </button>
        )}
        <button type="button" className="btn-secondary min-h-13 w-full" onClick={c.print} disabled={!c.pdfUrl}>
          <IconPrinter className="h-4.5 w-4.5" />
          Print
        </button>
        <button type="button" className="btn-secondary min-h-13 w-full" onClick={c.readBack}>
          {c.reading ? <IconPause className="h-4.5 w-4.5" /> : <IconWave className="h-4.5 w-4.5" />}
          {c.reading ? "Stop reading" : "Read it back to me"}
        </button>
      </section>

      {c.profileOffer && (
        <section className="card flex flex-col gap-4 p-5 animate-slide-up" aria-label="Save to profile">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <IconInfo className="h-4.5 w-4.5 text-accent" />
              Remember these details?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-soft">
              I can save these on this phone and auto-fill them next time. ID numbers like Aadhaar are never saved.
            </p>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 rounded-2xl border border-line bg-sunken/60 p-4">
            {Object.entries(c.profileOffer).map(([key, value]) => (
              <li
                key={key}
                className="flex justify-between gap-3 border-b border-line pb-2 pt-2 text-[13px] first:pt-0 last:border-0 last:pb-0"
              >
                <span className="font-bold capitalize text-soft">{key.replace(/_/g, " ")}</span>
                <span className="max-w-[170px] truncate font-semibold text-ink">{value}</span>
              </li>
            ))}
          </ul>

          {c.profileSaved ? (
            <p className="flex items-center gap-2 text-sm font-bold leading-none text-ok">
              <IconCheck className="h-4.5 w-4.5" />
              Saved to your profile.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <button type="button" className="btn-primary min-h-13 w-full" onClick={c.saveProfile}>
                Yes, remember them
              </button>
              <button type="button" className="btn-secondary min-h-12 w-full" onClick={() => c.setProfileOffer(null)}>
                No, don&apos;t save
              </button>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2.5 border-t border-line/65 pt-5">
        <Link href="/" className="btn-secondary min-h-13 w-full no-underline">
          <IconHome className="h-4 w-4" />
          Go home
        </Link>
        <Link href="/history" className="btn-secondary min-h-13 w-full no-underline">
          <IconDoc className="h-4 w-4" />
          My forms
        </Link>
      </div>
    </div>
  );
}
