"use client";

/**
 * Home, mobile — one column, thumb-first (spec M2). The tab bar's center orb
 * is THE voice control; this screen greets, offers the two doors in, and
 * lists recent work. Targets 56px+.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoiceShell } from "@/components/voice/VoiceProvider";
import { StatusChip } from "@/components/ui/StatusChip";
import { useHomeData, routeForForm, formProgress, formatFormDate } from "@/components/screens/useHomeData";
import { IconUpload, IconCamera, IconDoc, IconPlay, IconChevronRight, IconInfo } from "@/components/icons";
import { CharReveal } from "@/components/ui/motion-components";

const VOICE_COMMANDS = [
  { phrase: "Upload", help: "Go to file uploader to upload a PDF or image." },
  { phrase: "Scan", help: "Open the camera to scan a paper form with voice guidance." },
  { phrase: "Read back", help: "Read all your verified answers out loud." },
  { phrase: "Profile", help: "Review or edit your saved auto-fill details." },
] as const;

export default function HomeMobile() {
  const router = useRouter();
  const { greeting, userName, isTouch } = useVoiceShell();
  const { recent, activeForm } = useHomeData();
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);

  const welcomeText = `${greeting || "Hello"}${userName && userName !== "User" ? `, ${userName}` : ""}.`;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <section className="text-center" aria-label="Welcome">
        <h1 className="font-display text-[2rem] leading-tight text-ink">
          <CharReveal text={welcomeText} />
        </h1>
        <p className="mt-2 text-sm text-soft">
          {isTouch ? "Tap the orb below and tell me what you need." : "Hold the space bar and tell me what you need."}
        </p>
      </section>

      {activeForm && (
        <section aria-label="Continue where you left off">
          <Link
            href={routeForForm(activeForm)}
            className="flex min-h-14 items-center gap-4 rounded-3xl border border-accent/25 bg-accent-soft/20 p-5 no-underline text-ink shadow-sm"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <IconPlay className="h-5 w-5 fill-current" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-accent">Continue filling</span>
              <span className="block truncate font-display text-base text-ink mt-0.5">{activeForm.name}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${formProgress(activeForm)}%` }} />
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-accent">{formProgress(activeForm)}%</span>
          </Link>
        </section>
      )}

      {/* Primary Doors - Centered card options */}
      <section aria-label="Start a new form" className="flex flex-col gap-4">
        {/* Upload Card */}
        <button
          onClick={() => router.push("/upload")}
          className="flex min-h-20 items-center justify-between gap-4 p-5 text-left w-full cursor-pointer rounded-3xl border border-line bg-raised hover:border-accent/40 shadow-sm focus-within:ring-2 focus-within:ring-accent"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <IconUpload className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0">
              <span className="block font-display text-lg text-ink">Upload a form</span>
              <span className="block text-xs text-soft mt-0.5">PDF or photos already on your phone</span>
            </div>
          </div>
          {/* Visual Badge Illustration */}
          <div className="flex items-center gap-1 shrink-0 bg-sunken/60 px-2 py-1 rounded-md border border-line">
            <span className="text-[9px] font-mono font-bold text-accent uppercase">PDF</span>
          </div>
        </button>

        {/* Scan Card */}
        <button
          onClick={() => router.push("/scan")}
          className="flex min-h-20 items-center justify-between gap-4 p-5 text-left w-full cursor-pointer rounded-3xl border border-line bg-raised hover:border-accent/40 shadow-sm focus-within:ring-2 focus-within:ring-accent"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <IconCamera className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0">
              <span className="block font-display text-lg text-ink">Scan a paper form</span>
              <span className="block text-xs text-soft mt-0.5">Use camera with scanning guidance</span>
            </div>
          </div>
          <div className="lens-iris scale-[0.45] -mx-8 -my-6 shrink-0" aria-hidden="true" />
        </button>
      </section>

      {/* Voice commands helper card */}
      <section aria-label="Voice commands cheat sheet" className="rounded-3xl border border-line bg-raised p-5 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-faint mb-3 text-center">Swaram Voice commands</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {VOICE_COMMANDS.map((cmd) => (
            <button
              key={cmd.phrase}
              onClick={() => setSelectedCommand(selectedCommand === cmd.phrase ? null : cmd.phrase)}
              className={`chip text-[11px] font-semibold cursor-pointer border ${
                selectedCommand === cmd.phrase
                  ? "bg-accent-soft border-accent text-accent"
                  : "bg-sunken border-line text-soft hover:border-accent/40"
              }`}
            >
              “{cmd.phrase}”
            </button>
          ))}
        </div>
        {selectedCommand && (
          <div className="mt-3 rounded-2xl border border-accent-soft bg-accent-soft/20 p-4 text-xs text-ink animate-slide-up">
            <p className="font-bold text-accent">“{selectedCommand}”</p>
            <p className="mt-1 leading-relaxed text-soft">
              {VOICE_COMMANDS.find((c) => c.phrase === selectedCommand)?.help}
            </p>
          </div>
        )}
      </section>

      {/* Private by Design Security indicator */}
      <section aria-label="Privacy assurance" className="rounded-3xl border border-line bg-sunken/45 flex items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok-soft text-ok lock-pulse animate-[lock-breath_3s_infinite_ease-in-out]" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </span>
        <div>
          <h3 className="font-display text-sm font-semibold text-ink">On-device privacy</h3>
          <p className="text-[11px] text-soft mt-0.5 leading-normal">Privacy by design — no forms, audio, or metadata ever leave this phone.</p>
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent forms">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Recent forms</h2>
            <Link href="/history" className="link-plain text-xs font-semibold">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-2.5">
            {recent.map((form) => (
              <li key={form.id}>
                <Link
                  href={routeForForm(form)}
                  className="flex min-h-14 items-center gap-3.5 rounded-2xl border border-line bg-raised px-4 py-3.5 no-underline text-ink hover:border-accent/40 shadow-sm"
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

