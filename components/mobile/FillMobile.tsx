"use client";

/**
 * Fill, mobile (spec M6) — a phone-call screen. One state at a time: slim top
 * bar with progress, the question as large serif type, the confirm/spell/type
 * moments as full-width blocks, controls in a thumb row, and the orb docked
 * bottom-center. Fields map and conversation live in slide-up sheets.
 */

import { useState } from "react";
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
  IconChevronRight,
  IconPause,
  IconX,
  IconDoc,
  IconMessageSquare,
} from "@/components/icons";

export default function FillMobile() {
  const s = useFillSession();
  const [showConversation, setShowConversation] = useState(false);

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
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <span className="eyebrow">Voice session</span>
        <h1 className="text-center font-display text-2xl leading-tight text-ink">{s.record?.name ?? "Your form"}</h1>

        <div className="w-full">
          <StatusAnnouncer message={s.status} tone={s.tone} />
        </div>

        {s.phase === "notice" ? (
          <div className="flex w-full flex-col gap-3.5">
            <p className="rounded-2xl border border-line bg-sunken p-4 text-left text-xs leading-relaxed text-soft">
              {CLOUD_FALLBACK_NOTICE}
            </p>
            <button type="button" className="btn-primary min-h-14 w-full" onClick={s.agreeAndStart}>
              Agree &amp; Start
            </button>
            <button type="button" className="btn-secondary min-h-13 w-full" onClick={() => s.startFilling()}>
              Use offline only
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary min-h-16 w-full max-w-sm text-lg"
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
    );
  }

  if (s.phase === "done") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
          <IconCheck className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="text-center font-display text-[1.75rem] leading-tight text-ink">All questions answered</h1>

        <div className="w-full">
          <StatusAnnouncer message={s.status} tone={s.tone} />
        </div>

        <Link href={`/review/${s.formId}`} className="btn-primary min-h-14 w-full max-w-sm no-underline">
          <span>Continue to review</span>
          <IconChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      {/* Slim top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
        <Link href="/" className="grid h-11 w-11 place-items-center rounded-full text-soft" aria-label="Quit session">
          <IconX className="h-5 w-5" />
        </Link>
        <p className="text-xs font-bold uppercase tracking-wider text-faint">
          Question {s.questionNumber} of {s.total}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConversation(true)}
            className="grid h-11 w-11 place-items-center rounded-full text-soft"
            aria-label="Show conversation"
          >
            <IconMessageSquare className="h-5 w-5" />
          </button>
          <button
            onClick={() => s.setShowFieldsList(true)}
            className="grid h-11 w-11 place-items-center rounded-full text-soft"
            aria-label="Show all fields"
          >
            <IconDoc className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="h-1 w-full shrink-0 bg-line" aria-hidden="true">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${(s.questionNumber / Math.max(s.total, 1)) * 100}%` }}
        />
      </div>

      {/* Question stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 pb-56 pt-6 text-center">
        {s.currentField && (
          <span className="chip bg-accent-soft text-[10px] font-bold uppercase tracking-wider text-accent">
            {typeLabel(s.currentField.type)}
          </span>
        )}

        <h1 className="max-w-md font-display text-[2rem] leading-tight text-ink">{s.currentField?.label ?? "…"}</h1>

        <div className="sr-only">
          <StatusAnnouncer message={s.status} tone={s.tone} />
        </div>

        {s.phase === "asking" && <p className="text-sm font-semibold text-accent animate-pulse">Reading the question aloud…</p>}

        {s.phase === "listening" && !s.confirmMode && (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="w-36">
              <Waveform active={s.voice?.sttState === "listening"} speaking={s.voice?.ttsActive} volume={s.voice?.micVolume} />
            </div>
            <p className="text-sm font-semibold text-soft">Listening — speak now</p>
          </div>
        )}

        {(s.phase === "confirming" || (s.phase === "listening" && s.confirmMode)) && s.confirmValue && (
          <div className="flex w-full flex-col items-center gap-3 animate-fade-in">
            <p className="text-[15px] text-soft">
              I heard <strong className="font-display text-lg text-ink">&ldquo;{s.confirmValue}&rdquo;</strong> — correct?
            </p>
            <SpellBubbles value={s.confirmValue} />
            <div className="mt-1 flex w-full max-w-sm gap-2.5">
              <button type="button" className="btn-primary min-h-13 flex-1" onClick={s.confirmYes}>
                <IconCheck className="h-4 w-4" />
                Yes
              </button>
              <button type="button" className="btn-secondary min-h-13 flex-1" onClick={s.confirmNo}>
                No, again
              </button>
            </div>
          </div>
        )}

        {s.phase === "typing" && <TypedAnswerForm s={s} />}
      </div>

      {/* Bottom: control row + the one voice control */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-raised/95 px-2 py-1.5 shadow-md backdrop-blur"
          role="group"
          aria-label="Voice controls"
        >
          <button type="button" onClick={s.doRepeat} aria-label="Repeat question" className="grid h-12 w-12 cursor-pointer place-items-center rounded-full text-soft hover:bg-sunken">
            <IconRepeat className="h-5 w-5" />
          </button>
          <button type="button" onClick={s.doSkip} aria-label="Skip field" className="grid h-12 w-12 cursor-pointer place-items-center rounded-full text-soft hover:bg-sunken">
            <IconSkip className="h-5 w-5" />
          </button>
          {s.phase !== "typing" && (
            <button type="button" onClick={s.enterTyping} aria-label="Type instead" className="grid h-12 w-12 cursor-pointer place-items-center rounded-full text-soft hover:bg-sunken">
              <IconKeyboard className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={s.doBack} disabled={s.atFirst} aria-label="Go back one field" className="grid h-12 w-12 cursor-pointer place-items-center rounded-full text-soft hover:bg-sunken disabled:opacity-40">
            <IconArrowLeft className="h-5 w-5" />
          </button>
          {s.phase !== "paused" && (
            <button type="button" onClick={s.pause} aria-label="Pause session" className="grid h-12 w-12 cursor-pointer place-items-center rounded-full text-soft hover:bg-sunken">
              <IconPause className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto">
          <VoiceControl variant="fab" />
        </div>
      </div>

      {/* Paused overlay */}
      {s.phase === "paused" && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-surface/95 backdrop-blur animate-fade-in">
          <p className="font-display text-2xl text-ink">Paused</p>
          <p className="text-sm text-soft">Take your time. Nothing is being recorded.</p>
          <button type="button" className="btn-primary min-h-14 px-10" onClick={s.resume}>
            <IconPlay className="h-4.5 w-4.5 fill-current" />
            <span>Resume</span>
          </button>
        </div>
      )}

      {/* Fields map sheet */}
      {s.showFieldsList && (
        <div className="fixed inset-0 z-50 flex flex-col bg-raised/97 backdrop-blur-md animate-slide-up">
          <div className="flex items-center justify-between border-b border-line p-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">All fields</h2>
              <p className="mt-0.5 text-[10px] font-bold uppercase text-soft">{s.record?.fields.length} total</p>
            </div>
            <button
              onClick={() => s.setShowFieldsList(false)}
              className="grid h-11 w-11 place-items-center rounded-full text-soft hover:bg-sunken"
              aria-label="Close fields list"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-grow flex-col gap-3 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <FieldsMapList s={s} onJump={() => s.setShowFieldsList(false)} />
          </div>
        </div>
      )}

      {/* Conversation sheet */}
      {showConversation && (
        <div className="fixed inset-0 z-50 flex flex-col bg-raised/97 backdrop-blur-md animate-slide-up">
          <div className="flex items-center justify-between border-b border-line p-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">Our conversation</h2>
            <button
              onClick={() => setShowConversation(false)}
              className="grid h-11 w-11 place-items-center rounded-full text-soft hover:bg-sunken"
              aria-label="Close conversation"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-grow flex-col gap-3 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {s.messages.length === 0 ? (
              <p className="text-sm leading-relaxed text-faint">What we say to each other will appear here.</p>
            ) : (
              s.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex max-w-[88%] flex-col ${msg.sender === "user" ? "items-end self-end" : "items-start self-start"}`}
                >
                  <div className={`bubble ${msg.sender === "user" ? "bubble-user" : "bubble-assistant"}`}>{msg.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
