"use client";

/**
 * Home, desktop — the voice stage (spec D2). The orb and the current moment
 * are the screen; two action cards and a quiet recent strip below. No hero
 * banner, no dashboard.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import VoiceControl from "@/components/voice/VoiceControl";
import { StatusChip } from "@/components/ui/StatusChip";
import { useHomeData, routeForForm, formProgress, formatFormDate } from "@/components/screens/useHomeData";
import { IconUpload, IconCamera, IconDoc, IconPlay, IconChevronRight } from "@/components/icons";

const TRY_SAYING = ["“Upload my scholarship form”", "“Open my forms”", "“Help”"];

export default function HomeDesktop() {
  const router = useRouter();
  const { recent, activeForm } = useHomeData();

  return (
    <div className="flex flex-col items-center gap-12 pb-10 pt-4">
      {/* The stage: the one voice control on this screen */}
      <section className="flex flex-col items-center gap-6" aria-label="Voice assistant">
        <VoiceControl variant="hero" />
        <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Try saying">
          {TRY_SAYING.map((phrase) => (
            <li key={phrase} className="chip border border-line bg-raised text-xs font-semibold text-soft">
              {phrase}
            </li>
          ))}
        </ul>
      </section>

      {/* Resume an in-progress form */}
      {activeForm && (
        <section aria-label="Continue where you left off" className="w-full max-w-2xl">
          <Link
            href={routeForForm(activeForm)}
            className="card flex items-center gap-5 border-accent/25 bg-accent-soft/30 no-underline text-ink hover:border-accent/50"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <IconPlay className="h-5 w-5 fill-current" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Continue</p>
              <h2 className="truncate font-display text-lg text-ink">{activeForm.name}</h2>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${formProgress(activeForm)}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-accent">{formProgress(activeForm)}%</span>
          </Link>
        </section>
      )}

      {/* Two equal doors in */}
      <section aria-label="Start a new form" className="grid w-full max-w-2xl grid-cols-2 gap-5">
        <button
          onClick={() => router.push("/upload")}
          className="card group flex cursor-pointer flex-col items-start gap-4 p-7 text-left transition-all hover:border-accent/40"
        >
          <span className="grid h-13 w-13 place-items-center rounded-2xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
            <IconUpload className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-xl text-ink">Upload a form</span>
            <span className="mt-1 block text-sm leading-relaxed text-soft">A PDF or a photo already on this device.</span>
          </span>
        </button>
        <button
          onClick={() => router.push("/scan")}
          className="card group flex cursor-pointer flex-col items-start gap-4 p-7 text-left transition-all hover:border-accent/40"
        >
          <span className="grid h-13 w-13 place-items-center rounded-2xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
            <IconCamera className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-xl text-ink">Scan a paper form</span>
            <span className="mt-1 block text-sm leading-relaxed text-soft">Point the camera at a printed sheet.</span>
          </span>
        </button>
      </section>

      {/* Recent, quiet */}
      {recent.length > 0 && (
        <section aria-label="Recent forms" className="w-full max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Recent</h2>
            <Link href="/history" className="link-plain text-xs font-semibold">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-2.5">
            {recent.map((form) => (
              <li key={form.id}>
                <Link
                  href={routeForForm(form)}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-raised px-5 py-4 no-underline text-ink transition-colors hover:border-accent/40"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-soft">
                    <IconDoc className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{form.name}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {formatFormDate(form.updatedAt)} · {form.fields.length} fields
                    </span>
                  </span>
                  <StatusChip status={form.status} />
                  <IconChevronRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-faint">
        Private by design — forms are read and filled on this device.
      </p>
    </div>
  );
}
