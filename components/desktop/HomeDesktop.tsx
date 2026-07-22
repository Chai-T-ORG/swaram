"use client";

/**
 * Home, desktop — the voice stage (spec D2). The orb and the current moment
 * are the screen; two action cards and a quiet recent strip below. No hero
 * banner, no dashboard.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useVoice, useVoiceShell } from "@/components/voice/VoiceProvider";
import VoiceControl from "@/components/voice/VoiceControl";
import { StatusChip } from "@/components/ui/StatusChip";
import { useHomeData, routeForForm, formProgress, formatFormDate } from "@/components/screens/useHomeData";
import { IconUpload, IconCamera, IconDoc, IconPlay, IconChevronRight } from "@/components/icons";
import { TiltCard, WordReveal } from "@/components/ui/motion-components";
import { useStaggerContainer, useItemTransition } from "@/components/ui/motion";

const TRY_SAYING = ["“Upload my scholarship form”", "“Open my forms”", "“Help”"];

export default function HomeDesktop() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { recent, activeForm } = useHomeData();
  const { greeting, userName } = useVoiceShell();
  const voice = useVoice();

  const welcomeText = userName && userName !== "User" ? `Welcome back, ${userName}.` : "Welcome back.";

  const sttState = voice?.sttState;
  const micMode = voice?.micMode;
  const toast = voice?.toast;
  const ttsActive = voice?.ttsActive;

  const listening = sttState === "listening";
  const thinking = !listening && toast?.startsWith("Thinking");

  const heading = listening
    ? "Listening…"
    : ttsActive
    ? "Speaking"
    : thinking
    ? "Thinking…"
    : sttState === "paused-silence"
    ? "Microphone paused"
    : "How may I assist you today?";

  const staggerContainer = useStaggerContainer(0.06);
  const itemTransition = useItemTransition(10);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-2xl pb-16 pt-4 flex flex-col items-center"
    >
      {/* Zone 1 — the conversation */}
      <motion.div variants={itemTransition} className="flex flex-col items-center w-full">
        {/* Greeting and subtitle */}
        <section className="w-full text-center" aria-label="Welcome greeting">
          <h1 className="font-display text-4xl leading-tight text-ink">
            <WordReveal text={welcomeText} />
          </h1>
          <p className="mt-2 text-sm text-soft min-h-[20px]">
            {toast || heading}
          </p>
        </section>

        {/* Main Solid Voice Stage */}
        <div className="mt-6" aria-label="Voice stage">
          <VoiceControl variant="hero" />
        </div>

        {/* Try saying speech strip */}
        <div className="flex flex-wrap items-center justify-center gap-4 select-none pointer-events-none mt-4">
          {TRY_SAYING.map((phrase, idx) => {
            const rotations = ["-rotate-[1.2deg]", "rotate-[1.5deg]", "-rotate-[0.8deg]"];
            const rotation = rotations[idx % rotations.length];
            return (
              <motion.div
                key={phrase}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + idx * 0.08 }}
                className={`px-4 py-2 rounded-full border border-line bg-raised font-display italic text-sm text-soft shadow-sm ${rotation}`}
              >
                {phrase}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Zone 2 — the doors */}
      <motion.div variants={itemTransition} className="mt-16 w-full flex flex-col gap-6">
        {/* Resume Form */}
        {activeForm && (
          <section aria-label="Continue where you left off" className="w-full">
            <Link
              href={routeForForm(activeForm)}
              className="flex items-center gap-5 rounded-3xl border border-accent/25 bg-accent-soft/20 no-underline text-ink hover:border-accent/55 p-5 shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
                <IconPlay className="h-5 w-5 fill-current" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Continue filling</p>
                <h2 className="truncate font-display text-lg text-ink mt-0.5">{activeForm.name}</h2>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${formProgress(activeForm)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-sm font-bold text-accent tabular-nums">{formProgress(activeForm)}%</span>
            </Link>
          </section>
        )}

        {/* Two doors in - Side by Side cards */}
        <section aria-label="Start a new form" className="grid w-full grid-cols-1 sm:grid-cols-2 gap-5">
          <TiltCard
            className="group flex cursor-pointer flex-col items-start gap-4 rounded-3xl border border-line bg-raised p-7 text-left transition-all hover:border-accent/40 shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => router.push("/upload")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent transition-colors group-hover:bg-accent-deep">
              <IconUpload className="h-5.5 w-5.5" />
            </span>
            <div>
              <h2 className="font-display text-xl text-ink">Upload a form</h2>
              <p className="mt-1 block text-xs leading-relaxed text-soft">A PDF, JPEG, or PNG already on this device.</p>
            </div>
          </TiltCard>

          <TiltCard
            className="group flex cursor-pointer flex-col items-start gap-4 rounded-3xl border border-line bg-raised p-7 text-left transition-all hover:border-accent/40 shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => router.push("/scan")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
              <IconCamera className="h-5.5 w-5.5" />
            </span>
            <div>
              <h2 className="font-display text-xl text-ink">Scan a paper form</h2>
              <p className="mt-1 block text-xs leading-relaxed text-soft">Point the camera at a printed sheet.</p>
            </div>
          </TiltCard>
        </section>

        {/* Privacy assurance */}
        <p className="text-center text-xs leading-relaxed text-soft mt-1 max-w-lg mx-auto">
          Your forms are read and filled on this device. Voice uses a cloud service by default — a fully offline mode is available in Settings.
        </p>
      </motion.div>

      {/* Recent strip */}
      {recent.length > 0 && (
        <motion.section variants={itemTransition} aria-label="Recent forms" className="w-full flex flex-col gap-3 mt-12">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Recent forms</h2>
            <Link href="/history" className="link-plain text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-3 w-full">
            {recent.map((form: any) => (
              <li key={form.id} className="w-full">
                <Link
                  href={routeForForm(form)}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-raised px-5 py-4 no-underline text-ink transition-colors hover:border-accent/40 shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
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
        </motion.section>
      )}
    </motion.div>
  );
}
