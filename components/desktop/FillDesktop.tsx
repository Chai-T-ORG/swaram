"use client";

/**
 * Fill, desktop (spec D6) — the call screen. A thin top row (quit, progress,
 * checklist toggle), the current question as huge serif type on a centered
 * stage, a calm conversation column, and the single docked voice control.
 */

import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import Waveform from "@/components/Waveform";
import VoiceControl from "@/components/voice/VoiceControl";
import { useFillSession, typeLabel } from "@/components/screens/useFillSession";
import { SpellBubbles, TypedAnswerForm, FieldsMapList } from "@/components/screens/FillParts";
import { CLOUD_FALLBACK_NOTICE } from "@/lib/voice/speechToText";
import {
  IconArrowLeft,
  IconKeyboard,
  IconRepeat,
  IconSkip,
  IconPlay,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconChevronRight,
  IconPause,
} from "@/components/icons";

export default function FillDesktop() {
  const s = useFillSession();

  if (s.phase === "loading") {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-accent" />
        <p role="status" className="text-sm font-bold text-soft">
          Loading your voice session…
        </p>
      </div>
    );
  }

  if (s.phase === "start" || s.phase === "notice") {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="card flex w-full max-w-md flex-col gap-6 p-8 text-center">
          <span className="eyebrow self-center">Voice session</span>
          <h1 className="font-display text-3xl leading-tight text-ink">{s.record?.name ?? "Your form"}</h1>

          <StatusAnnouncer message={s.status} tone={s.tone} />

          {s.phase === "notice" ? (
            <div className="flex flex-col gap-4">
              <p className="rounded-2xl border border-line bg-sunken p-4 text-left text-xs leading-relaxed text-soft">
                {CLOUD_FALLBACK_NOTICE}
              </p>
              <div className="flex gap-3">
                <button type="button" className="btn-primary min-h-12 flex-1 text-xs" onClick={s.agreeAndStart}>
                  Agree &amp; Start
                </button>
                <button type="button" className="btn-secondary min-h-12 flex-1 text-xs" onClick={() => s.startFilling()}>
                  Use offline only
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary min-h-14 w-full text-base"
              onClick={s.handleStart}
              disabled={!s.record || s.record.fields.length === 0}
            >
              <IconPlay className="h-5 w-5 fill-current" />
              <span>Start</span>
            </button>
          )}

          <Link href={`/review/${s.formId}`} className="link-plain text-xs font-semibold">
            Preview fields as a list first
          </Link>
        </div>
      </div>
    );
  }

  if (s.phase === "done") {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="card flex w-full max-w-md flex-col gap-6 p-8 text-center">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center self-center rounded-full bg-ok-soft text-ok">
            <IconCheck className="h-7 w-7" strokeWidth={3} />
          </span>
          <h1 className="font-display text-3xl text-ink">All questions answered</h1>

          <StatusAnnouncer message={s.status} tone={s.tone} />

          <Link href={`/review/${s.formId}`} className="btn-primary min-h-13 w-full no-underline">
            <span>Continue to review</span>
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-1 overflow-hidden">
      {/* Toggleable fields map */}
      <aside
        className={`flex shrink-0 flex-col border-r border-line bg-sunken/50 backdrop-blur-md transition-all duration-300 ${
          s.showFieldsList ? "w-80" : "w-0 overflow-hidden border-r-0"
        }`}
        aria-label="Form fields map"
        aria-hidden={!s.showFieldsList}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Fields</h2>
          <span className="text-[10px] font-bold uppercase text-faint">{s.record?.fields.length} total</span>
        </div>
        <div className="flex flex-grow flex-col gap-2.5 overflow-y-auto p-4">
          <FieldsMapList s={s} />
        </div>
      </aside>

      {/* The stage */}
      <div className="relative flex h-full flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/85 px-6 py-3.5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => s.setShowFieldsList(!s.showFieldsList)}
              className="btn-secondary min-h-11 cursor-pointer px-3.5 text-xs"
              aria-expanded={s.showFieldsList}
            >
              {s.showFieldsList ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              <span>Fields</span>
            </button>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <h1 className="truncate font-display text-sm text-ink">{s.record?.name ?? "Voice session"}</h1>
          </div>

          <div className="flex items-center gap-5">
            <p className="text-xs font-bold uppercase tracking-wider text-faint">
              Question {s.questionNumber} of {s.total}
            </p>
            <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Quit</span>
            </Link>
          </div>
        </header>

        {/* progress line */}
        <div className="h-1 w-full shrink-0 bg-line" aria-hidden="true">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${(s.questionNumber / Math.max(s.total, 1)) * 100}%` }}
          />
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden px-8 pb-36 pt-6">
          {/* Question stage */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto text-center">
            {s.currentField && (
              <span className="chip bg-accent-soft text-[10px] font-bold uppercase tracking-wider text-accent">
                {typeLabel(s.currentField.type)}
              </span>
            )}

            <h2 className="max-w-2xl font-display text-4xl leading-tight text-ink lg:text-5xl">
              {s.currentField?.label ?? "…"}
            </h2>

            <div className="sr-only">
              <StatusAnnouncer message={s.status} tone={s.tone} />
            </div>

            {s.phase === "asking" && <p className="text-sm font-semibold text-accent animate-pulse">Reading the question aloud…</p>}

            {s.phase === "listening" && !s.confirmMode && (
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <div className="w-40">
                  <Waveform active={s.voice?.sttState === "listening"} speaking={s.voice?.ttsActive} volume={s.voice?.micVolume} />
                </div>
                <p className="text-sm font-semibold text-soft">Listening — speak now</p>
              </div>
            )}

            {(s.phase === "confirming" || (s.phase === "listening" && s.confirmMode)) && s.confirmValue && (
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <p className="text-base text-soft">
                  I heard <strong className="font-display text-xl text-ink">&ldquo;{s.confirmValue}&rdquo;</strong> — is that correct?
                </p>
                <SpellBubbles value={s.confirmValue} />
                <div className="mt-1 flex gap-3">
                  <button type="button" className="btn-primary min-h-12 px-8 text-sm" onClick={s.confirmYes}>
                    <IconCheck className="h-4 w-4" />
                    Yes
                  </button>
                  <button type="button" className="btn-secondary min-h-12 px-8 text-sm" onClick={s.confirmNo}>
                    No, try again
                  </button>
                </div>
              </div>
            )}

            {s.phase === "typing" && <TypedAnswerForm s={s} />}

            {s.phase === "paused" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-surface/95 backdrop-blur animate-fade-in">
                <p className="font-display text-2xl text-ink">Paused</p>
                <p className="text-sm text-soft">Take your time. Nothing is being recorded.</p>
                <button type="button" className="btn-primary min-h-13 px-8" onClick={s.resume}>
                  <IconPlay className="h-4.5 w-4.5 fill-current" />
                  <span>Resume</span>
                </button>
              </div>
            )}

            {/* Control bar */}
            <div className="flex flex-wrap items-center justify-center gap-2.5" role="group" aria-label="Voice controls">
              <button type="button" className="btn-secondary min-h-11 cursor-pointer px-4 text-xs" onClick={s.doRepeat}>
                <IconRepeat className="h-4 w-4" />
                <span>Repeat</span>
              </button>
              <button type="button" className="btn-secondary min-h-11 cursor-pointer px-4 text-xs" onClick={s.doSkip}>
                <IconSkip className="h-4 w-4" />
                <span>Skip</span>
              </button>
              {s.phase !== "typing" && (
                <button type="button" className="btn-secondary min-h-11 cursor-pointer px-4 text-xs" onClick={s.enterTyping}>
                  <IconKeyboard className="h-4 w-4" />
                  <span>Type instead</span>
                </button>
              )}
              <button type="button" className="btn-secondary min-h-11 cursor-pointer px-4 text-xs" onClick={s.doBack} disabled={s.atFirst}>
                <IconArrowLeft className="h-4 w-4" />
                <span>Go back</span>
              </button>
              {s.phase !== "paused" && (
                <button type="button" className="btn-secondary min-h-11 cursor-pointer px-4 text-xs" onClick={s.pause}>
                  <IconPause className="h-4 w-4" />
                  <span>Pause</span>
                </button>
              )}
            </div>

            <p className="text-[10px] font-bold uppercase leading-relaxed tracking-wider text-faint">
              Say <span className="text-soft">repeat · skip · go back · let me spell · type instead · pause</span>
            </p>
          </div>

          {/* Conversation column */}
          <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-raised/70 lg:flex" aria-label="Conversation">
            <h2 className="border-b border-line px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-faint">
              Our conversation
            </h2>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {s.messages.length === 0 ? (
                <p className="text-xs leading-relaxed text-faint">What we say to each other will appear here.</p>
              ) : (
                s.messages.slice(-30).map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex max-w-[90%] flex-col ${msg.sender === "user" ? "items-end self-end" : "items-start self-start"}`}
                  >
                    <div className={`bubble ${msg.sender === "user" ? "bubble-user" : "bubble-assistant"} text-xs`}>{msg.text}</div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        {/* THE one voice control */}
        <VoiceControl variant="docked" />
      </div>
    </div>
  );
}
