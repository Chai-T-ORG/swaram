"use client";

/**
 * Home, mobile — one column, thumb-first (spec M2). The tab bar's center orb
 * is THE voice control; this screen greets, offers the two doors in, and
 * lists recent work. Targets 56px+.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoiceShell } from "@/components/voice/VoiceProvider";
import { StatusChip } from "@/components/ui/StatusChip";
import { useHomeData, routeForForm, formProgress, formatFormDate } from "@/components/screens/useHomeData";
import { IconUpload, IconCamera, IconDoc, IconPlay, IconChevronRight } from "@/components/icons";

export default function HomeMobile() {
  const router = useRouter();
  const { greeting, userName, isTouch } = useVoiceShell();
  const { recent, activeForm } = useHomeData();

  return (
    <div className="flex flex-col gap-7 pb-6">
      <section aria-label="Welcome">
        <h1 className="font-display text-[1.9rem] leading-tight text-ink">
          {greeting || "Hello"}{userName && userName !== "User" ? `, ${userName}` : ""}.
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-soft">
          {isTouch ? "Tap the orb below and tell me what you need." : "Hold the space bar and tell me what you need."}
        </p>
      </section>

      {activeForm && (
        <section aria-label="Continue where you left off">
          <Link
            href={routeForForm(activeForm)}
            className="card flex min-h-14 items-center gap-4 border-accent/25 bg-accent-soft/30 p-5 no-underline text-ink"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <IconPlay className="h-5 w-5 fill-current" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-accent">Continue</span>
              <span className="block truncate font-display text-base text-ink">{activeForm.name}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${formProgress(activeForm)}%` }} />
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-accent">{formProgress(activeForm)}%</span>
          </Link>
        </section>
      )}

      <section aria-label="Start a new form" className="flex flex-col gap-3.5">
        <button
          onClick={() => router.push("/upload")}
          className="card flex min-h-16 cursor-pointer items-center gap-4 p-5 text-left"
        >
          <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
            <IconUpload className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg text-ink">Upload a form</span>
            <span className="block text-[13px] text-soft">A PDF or photo on this phone</span>
          </span>
          <IconChevronRight className="h-5 w-5 shrink-0 text-faint" />
        </button>
        <button
          onClick={() => router.push("/scan")}
          className="card flex min-h-16 cursor-pointer items-center gap-4 p-5 text-left"
        >
          <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <IconCamera className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg text-ink">Scan a paper form</span>
            <span className="block text-[13px] text-soft">Point the camera at the sheet</span>
          </span>
          <IconChevronRight className="h-5 w-5 shrink-0 text-faint" />
        </button>
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent forms">
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
                  className="flex min-h-14 items-center gap-3.5 rounded-2xl border border-line bg-raised px-4 py-3.5 no-underline text-ink"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-soft">
                    <IconDoc className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{form.name}</span>
                    <span className="mt-0.5 block text-xs text-faint">{formatFormDate(form.updatedAt)}</span>
                  </span>
                  <StatusChip status={form.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-faint">Private by design — everything stays on this device.</p>
    </div>
  );
}
