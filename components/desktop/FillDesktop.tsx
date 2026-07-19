"use client";

/**
 * Fill, desktop (spec D6) — the call screen. A thin top row (quit, progress,
 * checklist toggle), the current question as huge serif type on a centered
 * stage, a calm conversation column, and the single docked voice control.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import VoiceOrb from "@/components/ui/VoiceOrb";
import { useFillSession, typeLabel } from "@/components/screens/useFillSession";
import { SpellBubbles, TypedAnswerForm, FieldsMapList } from "@/components/screens/FillParts";
import { CLOUD_FALLBACK_NOTICE } from "@/lib/voice/speechToText";
import { WordReveal } from "@/components/ui/motion-components";
import {
  IconArrowLeft,
  IconArrowRight,
  IconKeyboard,
  IconRepeat,
  IconSkip,
  IconPlay,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconChevronRight,
  IconPause,
  IconWave,
} from "@/components/icons";

export default function FillDesktop() {
  const s = useFillSession();
  const prefersReducedMotion = useReducedMotion();
  const [showChat, setShowChat] = useState(true);
  const [showVisualForm, setShowVisualForm] = useState(true);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"fields" | "document">("fields");
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  const totalPages = s.record?.pageCount ?? 1;
  const currentPage = previewPage ?? (s.currentField?.page ?? 0) + 1;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastGeneratedFieldsRef = useRef<string | null>(null);

  // Synchronize current page preview when current field changes
  useEffect(() => {
    if (s.currentField) {
      setPreviewPage(s.currentField.page + 1);
    }
  }, [s.currentField?.id]);

  // Fetch original blob and generate filled PDF on field changes
  useEffect(() => {
    if (!s.formId || !s.record) return;
    if (!showVisualForm) return;

    // Skip generation while actively asking or listening
    if (s.phase === "asking" || s.phase === "listening") {
      return;
    }

    // Check if fields have actually changed since last generation
    const fieldsStr = JSON.stringify(s.record.fields);
    if (lastGeneratedFieldsRef.current === fieldsStr) {
      return;
    }

    let active = true;
    let localUrl: string | null = null;

    const debounceId = setTimeout(async () => {
      try {
        const { getFile } = await import("@/lib/storage/localHistoryStore");
        const originalBlob = await getFile(s.formId, "original");
        if (!originalBlob || !active) return;

        const { generateFilledPdf } = await import("@/lib/pdf/pdfWriter");
        const filledBlob = await generateFilledPdf(originalBlob, s.record!.fields, {
          sourceType: s.record!.sourceType,
          isAcroForm: s.record!.isAcroForm,
        });
        if (!active) return;

        localUrl = URL.createObjectURL(filledBlob);
        lastGeneratedFieldsRef.current = fieldsStr;

        setDocUrl((prev) => {
          if (prev) {
            try {
              URL.revokeObjectURL(prev);
            } catch {}
          }
          return localUrl;
        });
      } catch (err) {
        console.error("PDF filling error:", err);
      }
    }, 800);

    return () => {
      active = false;
      clearTimeout(debounceId);
      if (localUrl) {
        try {
          URL.revokeObjectURL(localUrl);
        } catch {}
      }
    };
  }, [s.formId, s.record?.fields, showVisualForm, s.phase]);

  // Smooth scroll container to center active field
  useEffect(() => {
    if (!s.currentField || activeTab !== "fields") return;
    const activeEl = document.getElementById(`field-card-${s.currentField.id}`);
    if (activeEl && scrollContainerRef.current) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [s.currentField?.id, activeTab]);

  if (s.phase === "loading") {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="skeleton-card flex w-full max-w-sm flex-col gap-4">
          <div className="skeleton-shimmer h-12 w-12 rounded-full self-center" />
          <div className="skeleton-text h-6 w-3/4 self-center" />
          <div className="skeleton-text h-4 w-1/2 self-center" />
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
  }  return (
    <div className={`relative flex h-full flex-1 overflow-hidden transition-colors duration-500 bg-surface ambient-grid ${s.voice?.ttsActive ? "bg-accent-soft/5" : ""}`}>
      {/* Toggleable fields map (Left Sidebar) */}
      <motion.aside
        initial={false}
        animate={{ width: s.showFieldsList ? 280 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="flex shrink-0 flex-col border-r border-line bg-sunken overflow-hidden"
        aria-label="Form fields map"
        aria-hidden={!s.showFieldsList}
      >
        <div className="w-[280px] flex flex-col h-full shrink-0">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Fields</h2>
            <span className="text-[10px] font-bold uppercase text-faint">{s.record?.fields.length} total</span>
          </div>
          <div className="flex flex-grow flex-col gap-2.5 overflow-y-auto p-4">
            <FieldsMapList s={s} />
          </div>
        </div>
      </motion.aside>

      {/* The stage */}
      <div className="relative flex h-full flex-1 flex-col z-10">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => s.setShowFieldsList(!s.showFieldsList)}
              className="btn-secondary min-h-11 cursor-pointer px-3.5 text-xs"
              aria-expanded={s.showFieldsList}
            >
              {s.showFieldsList ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              <span>Fields</span>
            </button>
            <button
              onClick={() => setShowVisualForm(!showVisualForm)}
              className="btn-secondary min-h-11 cursor-pointer px-3.5 text-xs"
              aria-expanded={showVisualForm}
            >
              {showVisualForm ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              <span>Form View</span>
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className="btn-secondary min-h-11 cursor-pointer px-3.5 text-xs"
              aria-expanded={showChat}
            >
              <IconWave className="h-4 w-4 text-accent" />
              <span>Transcript</span>
            </button>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <h1 className="truncate font-display text-sm text-ink">{s.record?.name ?? "Voice session"}</h1>
          </div>

          <div className="flex items-center gap-5">
            <p className="text-xs font-bold uppercase tracking-wider text-faint tabular-nums">
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
            key={s.questionNumber}
            className="relative h-full bg-accent transition-all duration-500"
            style={{ width: `${(s.questionNumber / Math.max(s.total, 1)) * 100}%` }}
          >
            {!prefersReducedMotion && (
              <motion.div
                initial={{ left: "-20%", opacity: 0.8 }}
                animate={{ left: "100%", opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none"
              />
            )}
          </div>
        </div>

        {/* Dual-Pane Workstation Viewport */}
        <div className="flex flex-1 gap-8 overflow-hidden px-8 pb-8 pt-6 items-stretch">
          
          {/* Left Pane: Tactile Form Canvas */}
          <AnimatePresence initial={false}>
            {showVisualForm && (
              <motion.div
                initial={{ width: 0, opacity: 0, marginRight: 0 }}
                animate={{ width: "50%", opacity: 1, marginRight: 32 }}
                exit={{ width: 0, opacity: 0, marginRight: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="hidden md:flex flex-col justify-center min-w-0 overflow-hidden h-full"
              >
                <div className="paper-sheet tactile-blueprint rounded-3xl border border-line p-6 pt-9 flex flex-col h-full overflow-hidden shadow-sm select-none">
                  {/* Clipboard Binder Clip */}
                  <div className="clipboard-clip" aria-hidden="true" />
                  
                  <div className="border-b border-line/60 pb-3.5 mb-4 flex items-center justify-between">
                    <div className="flex bg-sunken rounded-lg p-0.5 border border-line z-10">
                      <button
                        onClick={() => setActiveTab("fields")}
                        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md cursor-pointer transition-colors ${
                          activeTab === "fields" ? "bg-surface text-accent shadow-sm" : "text-soft hover:text-ink"
                        }`}
                      >
                        Interactive
                      </button>
                      <button
                        onClick={() => setActiveTab("document")}
                        disabled={!docUrl}
                        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md cursor-pointer transition-colors ${
                          !docUrl ? "opacity-50 cursor-not-allowed" : ""
                        } ${
                          activeTab === "document" ? "bg-surface text-accent shadow-sm" : "text-soft hover:text-ink"
                        }`}
                      >
                        Original File
                      </button>
                    </div>

                    {activeTab === "document" && totalPages > 1 && (
                      <div className="flex items-center gap-2 bg-sunken rounded-lg p-0.5 border border-line z-10">
                        <button
                          type="button"
                          onClick={() => setPreviewPage((p) => Math.max(1, (p ?? 1) - 1))}
                          disabled={currentPage <= 1}
                          className="p-1 text-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center"
                          title="Previous Page"
                        >
                          <IconArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[10px] font-mono font-bold px-1.5 text-soft select-none">
                          Page {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewPage((p) => Math.min(totalPages, (p ?? 1) + 1))}
                          disabled={currentPage >= totalPages}
                          className="p-1 text-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center"
                          title="Next Page"
                        >
                          <IconArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    <span className="text-[9px] font-mono text-faint uppercase">Swaram Local Engine</span>
                  </div>
                  
                  {activeTab === "fields" ? (
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 scroll-smooth">
                      {s.record?.fields.map((field) => {
                        const isActive = s.currentField?.id === field.id;
                        return (
                          <div
                            key={field.id}
                            id={`field-card-${field.id}`}
                            className={`relative p-3.5 pl-6 rounded-2xl border transition-all duration-200 ${
                              isActive
                                ? "bg-accent-soft/30 border-accent/70 shadow-sm ring-1 ring-accent/30"
                                : "bg-surface/60 border-line/60"
                            }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-accent rounded-l-2xl animate-[pulse_2.5s_infinite_ease-in-out]" />
                            )}
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-faint mb-1.5">
                              {field.label}
                            </span>
                            <div className="min-h-[22px] flex items-center">
                              {field.value ? (
                                <span className="handwritten text-lg tracking-wide animate-ink-bleed">{field.value}</span>
                              ) : (
                                <span className="text-[11px] text-faint italic font-medium">[Empty Field]</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    (() => {
                      const iframeSrc = docUrl ? `${docUrl}#page=${currentPage}&toolbar=0&navpanes=0&view=FitH` : "";
                      return docUrl && (
                        <div className="flex-1 w-full h-full rounded-2xl overflow-hidden bg-sunken border border-line z-10">
                          {s.record?.sourceType === "pdf" ? (
                            <iframe
                              key={iframeSrc}
                              src={iframeSrc}
                              className="w-full h-full border-0"
                              title="Original Form File"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-2 bg-surface">
                              <img
                                key={docUrl}
                                src={docUrl}
                                alt="Original Form Image"
                                className="max-w-full max-h-full object-contain rounded-xl shadow-sm"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Pane Column: Active Question Stage (top) + Collapsible Transcript (bottom) */}
          <div className="flex flex-1 flex-col gap-6 min-w-0 h-full">
            {/* Active Question Console */}
            <motion.div
              layout
              className="flex flex-1 flex-col items-center justify-center gap-8 text-center rounded-3xl border border-line bg-raised p-8 shadow-sm overflow-y-auto relative"
            >
              <AnimatePresence mode="wait">
                {s.currentField && (s.phase !== "start" && s.phase !== "notice") && (
                  <motion.div
                    key={s.currentField.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -12 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <span className="chip bg-accent-soft text-[10px] font-bold uppercase tracking-wider text-accent">
                      {typeLabel(s.currentField.type)}
                    </span>
                    <h2 className="max-w-xl font-display text-3xl leading-tight text-ink lg:text-4xl">
                      <WordReveal text={s.currentField.label} />
                    </h2>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="sr-only">
                <StatusAnnouncer message={s.status} tone={s.tone} />
              </div>

              {/* Start and Notice welcome phases */}
              {(s.phase === "start" || s.phase === "notice") && (
                <div className="flex flex-col items-center gap-6 py-6 animate-fade-in w-full max-w-sm">
                  <VoiceOrb state="idle" volume={0} size="lg" />
                  
                  <span className="chip bg-accent-soft text-[10px] font-bold uppercase tracking-wider text-accent self-center mt-2">
                    Voice Session Ready
                  </span>
                  <h2 className="font-display text-2xl leading-snug text-ink max-w-xs mx-auto">
                    {s.record?.name ? s.record.name.replace(/\.(pdf|jpe?g|png)$/i, "") : "Your Form"}
                  </h2>
                  <p className="text-sm leading-relaxed text-soft">
                    {s.status}
                  </p>

                  {s.phase === "notice" ? (
                    <div className="flex flex-col gap-4 w-full">
                      <p className="rounded-2xl border border-line bg-sunken p-4 text-left text-xs leading-relaxed text-soft">
                        {CLOUD_FALLBACK_NOTICE}
                      </p>
                      <div className="flex gap-3 w-full">
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
                      <span>Start Session</span>
                    </button>
                  )}

                  <Link href={`/review/${s.formId}`} className="link-plain text-xs font-semibold">
                    Preview fields as a list first
                  </Link>
                </div>
              )}

              {s.phase === "asking" && (
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                  <VoiceOrb state="speaking" volume={s.voice?.micVolume ?? 0} size="lg" />
                  <p className="text-sm font-semibold text-accent animate-pulse">Reading question aloud…</p>
                </div>
              )}

              {s.phase === "listening" && !s.confirmMode && (
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                  <VoiceOrb state="listening" volume={s.voice?.micVolume ?? 0} size="lg" />
                  <p className="text-xs font-bold uppercase tracking-wider text-accent animate-pulse">Listening — speak now</p>
                </div>
              )}

              {(s.phase === "confirming" || (s.phase === "listening" && s.confirmMode)) && s.confirmValue && (
                <div className="flex flex-col items-center gap-4 animate-fade-in w-full max-w-sm">
                  <VoiceOrb state="idle" volume={0} size="lg" />
                  <p className="text-sm text-soft mt-2">
                    I heard <strong className="font-display text-lg text-ink block mt-1">&ldquo;{s.confirmValue}&rdquo;</strong>
                  </p>
                  <SpellBubbles value={s.confirmValue} />
                  <div className="mt-2 flex gap-3 w-full">
                    <button type="button" className="btn-primary min-h-11 flex-1 text-xs" onClick={s.confirmYes}>
                      <IconCheck className="h-4 w-4" />
                      Yes, correct
                    </button>
                    <button type="button" className="btn-secondary min-h-11 flex-1 text-xs" onClick={s.confirmNo}>
                      No, try again
                    </button>
                  </div>
                </div>
              )}

              {s.phase === "typing" && (
                <div className="flex flex-col items-center gap-4 w-full">
                  <VoiceOrb state="idle" volume={0} size="md" />
                  <TypedAnswerForm s={s} />
                </div>
              )}

              {s.phase === "paused" && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-surface animate-fade-in">
                  <VoiceOrb state="idle" volume={0} size="lg" className="opacity-50" />
                  <p className="font-display text-2xl text-ink mt-2">Session Paused</p>
                  <p className="text-xs text-soft">Nothing is being recorded.</p>
                  <button type="button" className="btn-primary min-h-12 px-8" onClick={s.resume}>
                    <IconPlay className="h-4.5 w-4.5 fill-current" />
                    <span>Resume</span>
                  </button>
                </div>
              )}

              {/* Control bar */}
              {s.phase !== "start" && s.phase !== "notice" && (
                <div className="flex flex-col gap-4 border-t border-line/60 pt-6 w-full">
                  <div className="flex flex-wrap items-center justify-center gap-2.5" role="group" aria-label="Voice controls">
                    <button type="button" className="btn-secondary min-h-10 cursor-pointer px-4 text-xs" onClick={s.doRepeat}>
                      <IconRepeat className="h-3.5 w-3.5" />
                      <span>Repeat</span>
                    </button>
                    <button type="button" className="btn-secondary min-h-10 cursor-pointer px-4 text-xs" onClick={s.doSkip}>
                      <IconSkip className="h-3.5 w-3.5" />
                      <span>Skip</span>
                    </button>
                    {s.phase !== "typing" && (
                      <button type="button" className="btn-secondary min-h-10 cursor-pointer px-4 text-xs" onClick={s.enterTyping}>
                        <IconKeyboard className="h-3.5 w-3.5" />
                        <span>Type</span>
                      </button>
                    )}
                    <button type="button" className="btn-secondary min-h-10 cursor-pointer px-4 text-xs" onClick={s.doBack} disabled={s.atFirst}>
                      <IconArrowLeft className="h-3.5 w-3.5" />
                      <span>Back</span>
                    </button>
                    {s.phase !== "paused" && (
                      <button type="button" className="btn-secondary min-h-10 cursor-pointer px-4 text-xs" onClick={s.pause}>
                        <IconPause className="h-3.5 w-3.5" />
                        <span>Pause</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] font-bold uppercase leading-relaxed tracking-wider text-faint text-center">
                    Voice triggers: <span className="text-soft">repeat · skip · back · type · pause</span>
                  </p>
                </div>
              )}
            </motion.div>

            {/* Collapsible bottom transcript */}
            <AnimatePresence initial={false}>
              {showChat && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 180, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="rounded-3xl border border-line bg-raised p-5 shadow-sm overflow-hidden flex flex-col shrink-0"
                >
                  <div className="flex items-center justify-between border-b border-line/60 pb-2 mb-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-faint">
                      Our conversation
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 bg-sunken/10 rounded-xl p-2.5">
                    {s.messages.length === 0 ? (
                      <p className="text-xs leading-relaxed text-faint italic text-center mt-4">
                        What we say to each other will appear here.
                      </p>
                    ) : (
                      s.messages.slice(-30).map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex max-w-[90%] flex-col ${msg.sender === "user" ? "items-end self-end" : "items-start self-start"}`}
                        >
                          <div className={`bubble ${msg.sender === "user" ? "bubble-user" : "bubble-assistant"} text-xs leading-relaxed`}>
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
