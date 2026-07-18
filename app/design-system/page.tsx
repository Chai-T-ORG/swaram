"use client";

/**
 * The living design-system lab — tokens, type, and every shared primitive in
 * both platform dresses. A dev reference page, not part of the user flow.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import VoiceOrb from "@/components/ui/VoiceOrb";
import Waveform from "@/components/Waveform";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { StatusChip, FieldStatusChip } from "@/components/ui/StatusChip";
import { SpellBubbles } from "@/components/screens/FillParts";
import type { FormStatus, FieldStatus } from "@/lib/types";

const COLORS = [
  ["surface", "var(--surface)"],
  ["sunken", "var(--sunken)"],
  ["raised", "var(--raised)"],
  ["ink", "var(--ink)"],
  ["soft", "var(--soft)"],
  ["faint", "var(--faint)"],
  ["line", "var(--line)"],
  ["accent", "var(--accent)"],
  ["accent-hover", "var(--accent-hover)"],
  ["accent-deep", "var(--accent-deep)"],
  ["accent-soft", "var(--accent-soft)"],
  ["ok", "var(--ok)"],
  ["warn", "var(--warn)"],
  ["bad", "var(--bad)"],
] as const;

const ORB_STATES = ["idle", "listening", "thinking", "speaking"] as const;
const FORM_STATUSES: FormStatus[] = ["processing", "ready", "filling", "review", "complete"];
const FIELD_STATUSES: FieldStatus[] = ["pending", "answered", "autofilled", "skipped", "unclear"];

export default function DesignSystemPage() {
  const [orbState, setOrbState] = useState<(typeof ORB_STATES)[number]>("idle");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 pb-16">
      <header className="border-b border-line pb-6">
        <span className="eyebrow">Internal</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Swaram design system</h1>
        <p className="mt-2 text-sm text-soft">
          Cream canvas, forest green, Fraunces for the assistant&rsquo;s voice — the shared vocabulary of both the
          mobile and desktop experiences.
        </p>
      </header>

      <section aria-label="Color tokens">
        <h2 className="eyebrow mb-4">Color tokens</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
          {COLORS.map(([name, value]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className="h-14 rounded-xl border border-line" style={{ background: value }} />
              <p className="font-mono text-[10px] text-soft">{name}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Typography">
        <h2 className="eyebrow mb-4">Type</h2>
        <div className="card flex flex-col gap-5 p-7">
          <p className="font-display text-5xl leading-tight text-ink">What is your full name?</p>
          <p className="font-display text-2xl text-ink">Fraunces — the assistant&rsquo;s voice on screen</p>
          <p className="text-base text-ink">Geist Sans carries the interface: labels, body copy, controls.</p>
          <p className="text-sm text-soft">Secondary copy sits in soft ink.</p>
          <p className="font-mono text-xs text-soft">Geist Mono — spelled-out values &amp; keyboard hints</p>
        </div>
      </section>

      <section aria-label="Voice orb">
        <h2 className="eyebrow mb-4">Voice orb — the brand anchor</h2>
        <div className="card flex flex-col items-center gap-7 p-8">
          <VoiceOrb state={orbState} volume={0.4} size="lg" />
          <div className="flex gap-2" role="group" aria-label="Orb states">
            {ORB_STATES.map((s) => (
              <button
                key={s}
                onClick={() => setOrbState(s)}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                  orbState === s ? "bg-accent text-on-accent" : "bg-sunken text-soft"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="w-56">
            <Waveform active={orbState === "listening"} speaking={orbState === "speaking"} volume={0.5} />
          </div>
        </div>
      </section>

      <section aria-label="Buttons">
        <h2 className="eyebrow mb-4">Buttons</h2>
        <div className="card flex flex-wrap items-center gap-4 p-7">
          <button className="btn-primary">Primary action</button>
          <button className="btn-secondary">Secondary</button>
          <button className="btn-ghost">Ghost</button>
          <button className="btn-danger">Delete</button>
          <button className="btn-primary" disabled>
            Disabled
          </button>
        </div>
      </section>

      <section aria-label="Status chips">
        <h2 className="eyebrow mb-4">Status — always icon + label, never color alone</h2>
        <div className="card flex flex-col gap-5 p-7">
          <div className="flex flex-wrap gap-2.5">
            {FORM_STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {FIELD_STATUSES.map((s) => (
              <FieldStatusChip key={s} status={s} />
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Announcer">
        <h2 className="eyebrow mb-4">Status announcer</h2>
        <div className="flex flex-col gap-3">
          <StatusAnnouncer message="Your form is ready. 9 fields found." tone="success" />
          <StatusAnnouncer message="3 fields were skipped — answer them now or continue." tone="warning" />
          <StatusAnnouncer message="Something went wrong while analyzing the form." tone="error" />
        </div>
      </section>

      <section aria-label="Conversation bubbles">
        <h2 className="eyebrow mb-4">Conversation</h2>
        <div className="card flex flex-col gap-4 p-7">
          <div className="flex max-w-[85%] flex-col items-start self-start">
            <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">Swaram</span>
            <div className="bubble bubble-assistant">What is your full name?</div>
          </div>
          <div className="flex max-w-[85%] flex-col items-end self-end">
            <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">You</span>
            <div className="bubble bubble-user">Arjun Nair</div>
          </div>
        </div>
      </section>

      <section aria-label="Spell bubbles">
        <h2 className="eyebrow mb-4">Spell-back</h2>
        <div className="card flex justify-center p-7">
          <SpellBubbles value="ARJUN NAIR" />
        </div>
      </section>

      <section aria-label="Inputs">
        <h2 className="eyebrow mb-4">Fields</h2>
        <div className="card flex max-w-md flex-col gap-4 p-7">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-input" className="text-xs font-bold text-soft">
              Full Name
            </label>
            <input id="ds-input" className="field-input" placeholder="Arjun Nair" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-select" className="text-xs font-bold text-soft">
              Category
            </label>
            <select id="ds-select" className="field-input">
              <option>General</option>
              <option>OBC</option>
            </select>
          </div>
        </div>
      </section>

      <section aria-label="Motion polish">
        <h2 className="eyebrow mb-4">Motion &amp; Choreography</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="card flex flex-col items-center justify-between p-6 text-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-faint mb-4">Staggers</h3>
            <StaggerDemo />
          </div>
          <div className="card flex flex-col items-center justify-between p-6 text-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-faint mb-4">Button Presses</h3>
            <ButtonPressDemo />
          </div>
          <div className="card flex flex-col items-center justify-between p-6 text-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-faint mb-4">Check Draws</h3>
            <DrawnCheckDemo />
          </div>
          <div className="card flex flex-col items-center justify-between p-6 text-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-faint mb-4">Celebrate Bloom</h3>
            <CelebrateDemo />
          </div>
        </div>
      </section>
    </div>
  );
}

function StaggerDemo() {
  const [trigger, setTrigger] = useState(0);
  const items = ["Item One", "Item Two", "Item Three", "Item Four"];
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div key={trigger} className="flex flex-col gap-2 w-full">
        {items.map((item, i) => (
          <motion.div
            key={`${item}-${trigger}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24, delay: i * 0.08 }}
            className="card p-3 text-xs text-center text-ink font-semibold"
          >
            {item}
          </motion.div>
        ))}
      </div>
      <button className="btn-secondary text-xs min-h-9 px-3 py-1 self-center" onClick={() => setTrigger(t => t + 1)}>
        Replay
      </button>
    </div>
  );
}

function ButtonPressDemo() {
  return (
    <div className="flex flex-col items-center gap-4 w-full my-auto">
      <button className="btn-primary min-h-12 w-full">Primary Action</button>
      <button className="btn-secondary min-h-12 w-full">Secondary</button>
      <span className="text-[10px] text-faint font-semibold uppercase leading-tight">Observe active translateY click effect</span>
    </div>
  );
}

function DrawnCheckDemo() {
  const [trigger, setTrigger] = useState(0);
  return (
    <div className="flex flex-col items-center gap-4 w-full my-auto">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-ok-soft">
        <svg
          key={trigger}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-ok"
        >
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <button className="btn-secondary text-xs min-h-9 px-3 py-1" onClick={() => setTrigger(t => t + 1)}>
        Replay
      </button>
    </div>
  );
}

function CelebrateDemo() {
  const [trigger, setTrigger] = useState(0);
  return (
    <div className="flex flex-col items-center gap-4 w-full my-auto">
      <div key={trigger} className="relative grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok shadow-sm">
        <motion.div
          initial={{ scale: 0.8, opacity: 0.6 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-ok-soft pointer-events-none"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8 text-ok"
          aria-hidden="true"
        >
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <button className="btn-secondary text-xs min-h-9 px-3 py-1" onClick={() => setTrigger(t => t + 1)}>
        Replay
      </button>
    </div>
  );
}
