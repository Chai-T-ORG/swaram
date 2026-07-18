"use client";

/**
 * Home, desktop — the voice stage (spec D2). The orb and the current moment
 * are the screen; two action cards and a quiet recent strip below. No hero
 * banner, no dashboard.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoiceShell } from "@/components/voice/VoiceProvider";
import VoiceControl from "@/components/voice/VoiceControl";
import { StatusChip } from "@/components/ui/StatusChip";
import { useHomeData, routeForForm, formProgress, formatFormDate } from "@/components/screens/useHomeData";
import { IconUpload, IconCamera, IconDoc, IconPlay, IconChevronRight } from "@/components/icons";
import { TiltCard, CharReveal } from "@/components/ui/motion-components";

const TRY_SAYING = ["“Upload my scholarship form”", "“Open my forms”", "“Help”"];

const VOICE_COMMANDS = [
  { phrase: "Upload", help: "Go to file uploader to upload a PDF or image." },
  { phrase: "Scan", help: "Open the camera to scan a paper form with voice guidance." },
  { phrase: "Read back", help: "Read all your verified answers out loud." },
  { phrase: "Profile", help: "Review or edit your saved auto-fill details." },
] as const;

export default function HomeDesktop() {
  const router = useRouter();
  const { recent, activeForm } = useHomeData();
  const { greeting, userName } = useVoiceShell();
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);

  const welcomeText = `${greeting || "Hello"}${userName && userName !== "User" ? `, ${userName}` : ""}.`;

  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-4 flex flex-col gap-9 items-center">
      {/* Greeting and subtitle */}
      <section className="w-full text-center" aria-label="Welcome greeting">
        <h1 className="font-display text-4xl leading-tight text-ink bg-gradient-to-r from-ink via-ink/90 to-accent bg-clip-text text-transparent">
          <CharReveal text={welcomeText} />
        </h1>
        <p className="mt-2 text-sm text-soft">
          Hold the space bar and tell me what you need.
        </p>
      </section>

      {/* Main Solid Voice Console (The Centerpiece) */}
      <section className="w-full rounded-3xl border border-line bg-raised p-8 shadow-sm flex flex-col items-center gap-6" aria-label="Voice assistant console">
        <div className="w-full flex justify-center">
          <VoiceControl variant="hero" />
        </div>

        <div className="w-full border-t border-line/60 pt-5">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-faint mb-3 text-center">Try saying</h2>
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {TRY_SAYING.map((phrase) => (
              <li key={phrase} className="chip border border-line bg-sunken text-xs font-semibold text-soft">
                {phrase}
              </li>
            ))}
          </ul>
        </div>

        {/* Voice Trigger Help inside the console */}
        <div className="w-full border-t border-line/60 pt-5">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-faint mb-2.5 text-center">Swaram Voice commands</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {VOICE_COMMANDS.map((cmd) => (
              <button
                key={cmd.phrase}
                onClick={() => setSelectedCommand(selectedCommand === cmd.phrase ? null : cmd.phrase)}
                className={`chip text-xs font-semibold cursor-pointer border ${
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
            <div className="mt-3.5 rounded-2xl border border-accent-soft bg-accent-soft/20 p-4 text-xs text-ink animate-slide-up">
              <p className="font-bold text-accent">“{selectedCommand}”</p>
              <p className="mt-1 leading-relaxed text-soft">
                {VOICE_COMMANDS.find((c) => c.phrase === selectedCommand)?.help}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Two doors in - Side by Side cards */}
      <section aria-label="Start a new form" className="grid w-full grid-cols-1 sm:grid-cols-2 gap-5">
        <TiltCard
          className="group flex cursor-pointer flex-col items-start gap-4 rounded-3xl border border-line bg-raised p-7 text-left transition-all hover:border-accent/40 shadow-sm"
          onClick={() => router.push("/upload")}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent transition-colors group-hover:bg-accent-deep">
            <IconUpload className="h-5.5 w-5.5" />
          </span>
          <div>
            <h2 className="font-display text-xl text-ink">Upload a form</h2>
            <p className="mt-1 block text-xs leading-relaxed text-soft">A PDF, JPEG, or PNG already on this device.</p>
          </div>
          <div className="flex items-center gap-1.5 bg-sunken/60 px-2.5 py-1 rounded-lg border border-line mt-2">
            <span className="text-[9px] font-mono font-bold text-accent uppercase">PDF</span>
            <span className="h-2.5 w-px bg-line" />
            <span className="text-[9px] font-mono font-bold text-soft uppercase">PNG</span>
          </div>
        </TiltCard>

        <TiltCard
          className="group flex cursor-pointer flex-col items-start gap-4 rounded-3xl border border-line bg-raised p-7 text-left transition-all hover:border-accent/40 shadow-sm"
          onClick={() => router.push("/scan")}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
            <IconCamera className="h-5.5 w-5.5" />
          </span>
          <div>
            <h2 className="font-display text-xl text-ink">Scan a paper form</h2>
            <p className="mt-1 block text-xs leading-relaxed text-soft">Point the camera at a printed sheet.</p>
          </div>
          {/* Mini active lens scanner animation */}
          <div className="lens-iris scale-[0.45] -mx-8 -my-6" aria-hidden="true" />
        </TiltCard>
      </section>

      {/* Resume Form */}
      {activeForm && (
        <section aria-label="Continue where you left off" className="w-full">
          <Link
            href={routeForForm(activeForm)}
            className="flex items-center gap-5 rounded-3xl border border-accent/25 bg-accent-soft/20 no-underline text-ink hover:border-accent/55 p-5 shadow-sm"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <IconPlay className="h-5 w-5 fill-current" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Continue filling</p>
              <h2 className="truncate font-display text-lg text-ink mt-0.5">{activeForm.name}</h2>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${formProgress(activeForm)}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-accent">{formProgress(activeForm)}%</span>
          </Link>
        </section>
      )}

      {/* Recent strip */}
      {recent.length > 0 && (
        <section aria-label="Recent forms" className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Recent forms</h2>
            <Link href="/history" className="link-plain text-xs font-semibold">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-3 w-full">
            {recent.map((form) => (
              <li key={form.id} className="w-full">
                <Link
                  href={routeForForm(form)}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-raised px-5 py-4 no-underline text-ink transition-colors hover:border-accent/40 shadow-sm"
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

      {/* Security assurances */}
      <section aria-label="Privacy assurance" className="w-full rounded-2xl border border-line bg-sunken/40 flex items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok-soft text-ok lock-pulse animate-[lock-breath_3s_infinite_ease-in-out]" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </span>
        <div className="text-left">
          <h3 className="font-display text-sm font-semibold text-ink">On-device privacy</h3>
          <p className="text-[11px] text-soft mt-0.5 leading-normal">Everything stays completely local. Forms, values, and audio streams are processed only on this machine.</p>
        </div>
      </section>
    </div>
  );
}

