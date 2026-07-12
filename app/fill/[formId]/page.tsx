"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import Waveform from "@/components/Waveform";
import { useVoice, useVoicePage } from "@/components/GlobalVoice";
import { isLlmAvailable, assist, correctTranscript } from "@/lib/voice/llm";
import { getForm, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormField, FormRecord } from "@/lib/types";
import { speak, cancelSpeech, spellOut, unlockAudioPlayback, prefetchTTS } from "@/lib/voice/textToSpeech";
import { getVoiceSettings } from "@/lib/voice/voiceSettings";
import { spellTokensToText, titleCase, formatAnswer } from "@/lib/voice/transcriptFormat";
import { parseFillCommand, isNameField, needsConfirmation } from "@/lib/voice/fillCommands";
import { INTL_KEYWORDS, containsKeyword } from "@/lib/voice/intlCommands";
import {
  isSttSupported,
  needsCloudNotice,
  acknowledgeCloudNotice,
  CLOUD_FALLBACK_NOTICE,
  addTranscriptListener,
  removeTranscriptListener,
} from "@/lib/voice/speechToText";
import {
  IconArrowLeft,
  IconKeyboard,
  IconMic,
  IconRepeat,
  IconSkip,
  IconPlay,
  IconCheck,
  IconHelp,
  IconClock,
  IconEye,
  IconEyeOff,
  IconChevronRight,
  IconShield,
  IconInfo,
  IconPause,
  IconLoader,
  IconAlertCircle,
  IconX
} from "@/components/icons";

const UNCLEAR_THRESHOLD = 0.6;

export default function FillPage() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const voice = useVoice();
  useVoicePage({
    title: "Voice Guidance",
    hint: "Answer the questions as I read them. Say skip, repeat, or stop anytime.",
    description: "Form filling stage. Answer the questions as I read them. Say skip to skip, repeat to repeat, or go back to correct a field.",
    exclusive: true,
  });

  const [record, setRecord] = useState<FormRecord | null>(null);
  const [phase, setPhase] = useState<"loading" | "start" | "notice" | "asking" | "listening" | "confirming" | "typing" | "paused" | "done">("loading");
  const [status, setStatus] = useState("Loading your form session…");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [typedValue, setTypedValue] = useState("");
  const [showFieldsList, setShowFieldsList] = useState(false);

  // References to keep async callbacks aligned with the active session state
  const recordRef = useRef<FormRecord | null>(null);
  const posRef = useRef(0);
  const queueRef = useRef<FormField[]>([]);
  const generationRef = useRef(0);
  const onlySkippedRef = useRef(searchParams.get("only") === "skipped");
  const retriesRef = useRef(0);
  const noSpeechRef = useRef(0);
  const unclearTriedRef = useRef(false);
  const pendingConfirmRef = useRef<string | null>(null);
  const listenKindRef = useRef<"answer" | "confirm">("answer");
  /** When true, the next answer utterance is dictated letters (spell mode). */
  const spellInputRef = useRef(false);

  const isContinuousListening = voice?.sttState === "listening";
  const messages = voice?.messages ?? [];

  const currentField = record?.fields.find((f) => f.id === currentId) ?? null;
  const queueLength = queueRef.current.length;
  const questionNumber = record
    ? record.fields.length - queueLength + Math.min(posRef.current + 1, queueLength)
    : 1;

  // Track active components
  useEffect(() => {
    load();
    return () => {
      cancelSpeech();
    };
  }, [formId]);

  // Hook transcript listeners to handle incoming voice inputs. Commands work
  // in EVERY phase — not just while actively listening for an answer — so
  // "start", "resume", and "use voice" all respond by voice.
  useEffect(() => {
    function onTranscript(text: string, confidence: number) {
      const clean = text.toLowerCase().trim();

      if (phase === "start" || phase === "notice") {
        if (/\b(start|begin|let'?s go|fill|continue|go|ready|haan|shuru)\b/.test(clean) || containsKeyword(text, INTL_KEYWORDS.start)) {
          handleStart();
        }
        return;
      }
      if (phase === "paused") {
        if (/\b(resume|continue|start|go on|unpause|carry on)\b/.test(clean) || containsKeyword(text, INTL_KEYWORDS.resume)) {
          resume();
        }
        return;
      }
      if (phase === "typing") {
        if (/use voice|voice instead|resume voice|listen/.test(clean)) {
          resume();
        }
        return;
      }
      if (phase === "listening" || phase === "confirming") {
        handleSpeechInput(text, confidence);
      }
    }
    addTranscriptListener(onTranscript);
    return () => removeTranscriptListener(onTranscript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Synchronize state values
  function syncRecord() {
    if (recordRef.current) {
      setRecord({ ...recordRef.current });
      saveForm(recordRef.current);
    }
  }

  // Cancel running tasks on state updates
  function beginRun(): number {
    generationRef.current += 1;
    cancelSpeech();
    return generationRef.current;
  }

  function alive(id: number): boolean {
    return id === generationRef.current;
  }

  function fieldAt(pos: number): FormField | null {
    return queueRef.current[pos] ?? null;
  }

  async function load() {
    const form = await getForm(formId);
    if (!form || form.fields.length === 0) {
      setPhase("start");
      setTone("error");
      setStatus("I could not load this form. Please go back and try again.");
      return;
    }
    recordRef.current = form;
    setRecord(form);
    setPhase("start");
    const pendingCount = form.fields.filter((f) => f.status === "pending").length;
    const message = onlySkippedRef.current
      ? "Let's answer the fields you skipped. Press Start when you're ready."
      : `${form.fields.length} fields, ${pendingCount} to answer. Press Start — I'll ask one question at a time.`;
    setStatus(message);
    speak(message + " You can also press the space bar.");
  }

  async function handleStart() {
    unlockAudioPlayback();
    await startFilling();
  }

  async function startFilling() {
    const rec = recordRef.current;
    if (!rec) return;

    rec.status = "filling";
    syncRecord();

    const pending = rec.fields.filter(
      (f) =>
        f.status === "pending" ||
        (onlySkippedRef.current && (f.status === "skipped" || f.status === "unclear"))
    );

    if (pending.length === 0) {
      finish(beginRun());
      return;
    }

    queueRef.current = pending;
    posRef.current = 0;
    const id = beginRun();

    const announcement = onlySkippedRef.current ? "Starting skipped questions. " : "Starting voice fill. ";
    setStatus(announcement + `${queueRef.current.length} question${queueRef.current.length === 1 ? "" : "s"} to go.`);
    await speak(announcement + `${queueRef.current.length} question${queueRef.current.length === 1 ? "" : "s"}. Say help anytime.`);
    if (!alive(id)) return;

    // In continuous mode, make sure the mic is live. In push-to-talk mode the
    // user holds space / taps to answer each question, so we must NOT auto-start
    // recording here (it would capture silence before they speak).
    if (voice && voice.micMode === "continuous" && voice.sttState === "off") {
      voice.wakeMic();
    }
    askField(posRef.current, id);
  }

  function isUnclear(field: FormField): boolean {
    return field.source === "ocr" && field.confidence < UNCLEAR_THRESHOLD;
  }

  function questionFor(field: FormField): string {
    if (isUnclear(field)) {
      return (
        `I'm not sure about this field. The label looks like: ${spellOut(field.label)}. ` +
        `Tell me what to fill here, or say skip.`
      );
    }
    // Prefer the AI-refined natural question + hint when available.
    const base = field.question?.trim() || defaultQuestionFor(field);
    if (field.type === "choice" && field.options?.length) {
      return `${base} Options: ${field.options.join(", ")}.`;
    }
    return field.help ? `${base} ${field.help}` : base;
  }

  function defaultQuestionFor(field: FormField): string {
    switch (field.type) {
      case "date":
        return `What is your ${field.label}? For example: 25 May 2002.`;
      case "checkbox":
        return `${field.label} — yes or no?`;
      default:
        if (field.profileKey === "address" || /address/i.test(field.label)) {
          return `What is your ${field.label}? Say it naturally — you can say comma to separate parts.`;
        }
        return `What is your ${field.label}?`;
    }
  }

  async function askField(pos: number, id: number) {
    const field = fieldAt(pos);
    if (!field) {
      finish(id);
      return;
    }
    posRef.current = pos;
    setCurrentId(field.id);
    setHeard("");
    setConfirmValue("");
    setTypedValue(field.value ?? "");
    retriesRef.current = 0;
    noSpeechRef.current = 0;
    unclearTriedRef.current = false;
    setPhase("asking");
    setTone("info");
    setStatus(questionFor(field));

    if (!isSttSupported()) {
      setPhase("typing");
      return;
    }
    
    await speak(questionFor(field));
    if (!alive(id)) return;

    listenKindRef.current = "answer";
    setPhase("listening");

    // Warm the next question's cloud audio so advancing feels instant.
    const next = fieldAt(pos + 1);
    if (next) prefetchTTS(questionFor(next), getVoiceSettings().sttLang);
  }

  async function handleSpeechInput(transcript: string, confidence: number) {
    const id = beginRun();
    const clean = transcript.toLowerCase().trim();
    const cmd = parseFillCommand(clean);

    // Commands work in both answer and confirm modes.
    if (cmd === "help") {
      await speak(
        "Just say your answer. You can also say: repeat, skip, go back, let me spell, type instead, or pause.",
      );
      if (alive(id)) setPhase("listening");
      return;
    }
    if (cmd === "repeat") { handleCommand("repeat", posRef.current, id); return; }
    if (cmd === "skip") { handleCommand("skip", posRef.current, id); return; }
    if (cmd === "back") { handleCommand("back", posRef.current, id); return; }
    if (cmd === "type") { spellInputRef.current = false; setPhase("typing"); return; }
    if (cmd === "pause") {
      setPhase("paused");
      setStatus("Paused. Press Resume, or hold space and say resume.");
      return;
    }
    if (cmd === "spell") { enterSpellMode(id); return; }

    // Spell-by-letter input: the utterance IS the letters ("t w i n s h a").
    if (spellInputRef.current && listenKindRef.current !== "confirm") {
      spellInputRef.current = false;
      const field = fieldAt(posRef.current);
      const spelled = spellTokensToText(transcript);
      if (!spelled) {
        await speak("I couldn't make out the letters. Try again — letter by letter.");
        if (alive(id)) { spellInputRef.current = true; setPhase("listening"); }
        return;
      }
      const value = field && isNameField(field) ? titleCase(spelled) : spelled;
      pendingConfirmRef.current = value;
      setConfirmValue(value);
      setHeard(value);
      listenKindRef.current = "confirm";
      setPhase("confirming");
      setStatus(`Spelled: “${value}”. Correct?`);
      await speak(`I got: ${spellOut(value)}. Is that correct?`);
      if (alive(id)) setPhase("listening");
      return;
    }

    // Smart assist: let the user ask what to put or what a field means.
    if (
      listenKindRef.current !== "confirm" &&
      /(what (do|should) i|what does this|what is this|explain|help me with|i (don'?t|do not) understand|meaning of|for example)/.test(clean)
    ) {
      const field = fieldAt(posRef.current);
      if (isLlmAvailable() && field) {
        await speak("One moment.");
        const answer = await assist(transcript, {
          fieldLabel: field.label,
          formName: recordRef.current?.name,
          lang: getVoiceSettings().sttLang,
        });
        if (!alive(id)) return;
        if (answer) {
          await speak(answer);
          if (alive(id)) {
            await speak(questionFor(field));
            if (alive(id)) setPhase("listening");
          }
          return;
        }
      }
      // No LLM — fall through and treat it as a normal answer attempt.
    }

    if (listenKindRef.current === "confirm") {
      await handleConfirmationTranscript(transcript, confidence, id);
    } else {
      await handleAnswer(posRef.current, transcript, confidence, id);
    }
  }

  function enterSpellMode(id: number) {
    spellInputRef.current = true;
    listenKindRef.current = "answer";
    setTone("info");
    setStatus("Spell it letter by letter. Say “space” between words.");
    speak("Go ahead — spell it letter by letter. Say space between words.").then(() => {
      if (alive(id)) setPhase("listening");
    });
  }

  async function handleAnswer(pos: number, raw: string, confidence: number, id: number) {
    const field = fieldAt(pos);
    if (!field) return;
    let value: string;

    if (field.type === "checkbox") {
      const yn = parseYesNo(raw);
      if (yn === null) {
        await speak("Please answer yes or no.");
        if (alive(id)) setPhase("listening");
        return;
      }
      commit(pos, yn ? "Yes" : "No", id, yn ? "Yes." : "No.");
      return;
    }

    if (field.type === "choice" && field.options?.length) {
      const option = matchOption(raw, field.options);
      if (!option) {
        retriesRef.current += 1;
        if (retriesRef.current >= 3) {
          await speak("Let's pick it from a list instead.");
          if (alive(id)) setPhase("typing");
          return;
        }
        await speak(`I heard ${raw}. The options are: ${field.options.join(", ")}. Say one.`);
        if (alive(id)) setPhase("listening");
        return;
      }
      commit(pos, option, id, `${option}.`);
      return;
    }

    // Adaptive STT — "smart lane": for name/address/free-text fields, run the
    // raw transcript through a fast field-aware LLM pass that fixes Indian names
    // and addresses Whisper mangles ("Tejas KM" heard as "they just came").
    // Number/ID/email fields skip this (the "fast lane") — the corrector never
    // touches digits, and deterministic formatting + spell-back handles those.
    const lane = smartLane(field);
    let source = raw;
    if (lane.correct && isLlmAvailable()) {
      const corrected = await correctTranscript(
        raw,
        { label: field.label, kind: lane.kind, help: field.help },
        getVoiceSettings().sttLang,
      );
      if (!alive(id)) return;
      if (corrected) source = corrected;
    }

    value = formatAnswer(source, field);
    if (!value) {
      await speak("I didn't catch that. Could you repeat it?");
      if (alive(id)) setPhase("listening");
      return;
    }

    if (!needsConfirmation(field, isUnclear(field))) {
      commit(pos, value, id, `${value}.`);
      return;
    }

    pendingConfirmRef.current = value;
    setConfirmValue(value);
    setHeard(value);
    listenKindRef.current = "confirm";
    setPhase("confirming");
    setStatus(`I heard: “${value}”. Correct?`);
    // For names, emails, and numbers, read it back character-by-character so
    // the user can actually verify it — this is where mishearings hide.
    const spellItBack = isNameField(field) || /(email|phone|mobile|aadhaar|number|code|account|ifsc)/i.test(field.label);
    const readback = spellItBack ? `I heard: ${value}. That's ${spellOut(value)}. Correct?` : `I heard: ${value}. Correct?`;
    await speak(readback + (field.type === "text" ? " You can also say: let me spell." : ""));
    if (alive(id)) {
      setPhase("listening");
    }
  }

  async function handleConfirmationTranscript(transcript: string, confidence: number, id: number) {
    const field = fieldAt(posRef.current);
    if (!field) return;

    const yn = parseYesNo(transcript);
    if (yn === true) {
      commit(posRef.current, pendingConfirmRef.current ?? "", id);
      return;
    }
    
    if (yn === false) {
      if (isUnclear(field) && unclearTriedRef.current) {
        markUnclearAndMoveOn(posRef.current, id);
        return;
      }
      unclearTriedRef.current = true;
      retriesRef.current += 1;
      if (retriesRef.current >= 3) {
        await speak("No problem — let's type it instead.");
        if (alive(id)) setPhase("typing");
        return;
      }
      setPhase("confirming");
      const spellHint =
        field.type === "text" ? " You can also say: let me spell." : "";
      await speak("Okay, once more. " + questionFor(field) + spellHint);
      if (alive(id)) {
        listenKindRef.current = "answer";
        setPhase("listening");
      }
      return;
    }

    retriesRef.current += 1;
    if (retriesRef.current >= 3) {
      commit(posRef.current, pendingConfirmRef.current ?? "", id);
      return;
    }
    await speak(`I heard ${transcript}. Please answer yes or no. Is ${pendingConfirmRef.current} correct?`);
    if (alive(id)) setPhase("listening");
  }

  function commit(pos: number, val: string, id: number, speakPrefix = "") {
    const rec = recordRef.current;
    if (!rec) return;
    const field = queueRef.current[pos];
    if (field) {
      field.value = val;
      field.status = "answered";
      syncRecord();
      
      if (voice) {
        voice.addMessage("user", val);
      }
    }
    const nextPos = pos + 1;
    const isLast = nextPos >= queueRef.current.length;
    const speechText = isLast ? `${speakPrefix} All questions answered.` : `${speakPrefix} Got it.`;
    
    speak(speechText).then(() => {
      if (alive(id)) {
        if (isLast) {
          finish(id);
        } else {
          askField(nextPos, id);
        }
      }
    });
  }

  function markUnclearAndMoveOn(pos: number, id: number) {
    const field = queueRef.current[pos];
    if (field) {
      field.status = "unclear";
      field.value = "";
      syncRecord();
    }
    speak("No problem. Skipping this unclear field.").then(() => {
      if (alive(id)) askField(pos + 1, id);
    });
  }

  function jumpToField(index: number) {
    const rec = recordRef.current;
    if (!rec || index < 0 || index >= rec.fields.length) return;
    queueRef.current = rec.fields;
    const id = beginRun();
    askField(index, id);
  }

  async function finish(id: number) {
    const rec = recordRef.current;
    if (!rec) return;
    setPhase("done");
    setTone("success");
    rec.status = "review";
    syncRecord();
    const msg = "Excellent! We have gone through all questions. Let's review the form now.";
    setStatus(msg);
    await speak(msg);
  }

  function handleCommand(cmd: "repeat" | "skip" | "back", pos: number, id: number) {
    if (cmd === "repeat") {
      askField(pos, id);
    } else if (cmd === "skip") {
      const field = queueRef.current[pos];
      if (field) {
        field.status = "skipped";
        field.value = "";
        syncRecord();
      }
      setTone("warning");
      setStatus("Skipped.");
      speak("Skipped.").then(() => {
        if (alive(id)) askField(pos + 1, id);
      });
    } else if (cmd === "back") {
      const nextPos = Math.max(pos - 1, 0);
      askField(nextPos, id);
    }
  }

  function doSkip() {
    const id = beginRun();
    handleCommand("skip", posRef.current, id);
  }

  function doBack() {
    const id = beginRun();
    handleCommand("back", posRef.current, id);
  }

  function doRepeat() {
    const id = beginRun();
    handleCommand("repeat", posRef.current, id);
  }

  function saveTyped() {
    const id = beginRun();
    const field = fieldAt(posRef.current);
    if (!field) return;
    const value = typedValue.trim();
    if (!value) {
      setTone("warning");
      setStatus("Type an answer, or skip this field.");
      return;
    }
    commit(posRef.current, value, id);
  }

  function resume() {
    const id = beginRun();
    askField(posRef.current, id);
  }

  /* ------------------------------- UI -------------------------------- */

  if (phase === "loading") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface h-full">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-accent mb-4" />
        <p role="status" className="text-sm font-bold text-soft">
          Loading voice workspace…
        </p>
      </div>
    );
  }

  const total = record?.fields.length || 0;

  if (phase === "start" || phase === "notice") {
    return (
      <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface flex items-center justify-center min-h-[500px]">
        <div className="max-w-md w-full card text-center flex flex-col gap-6 p-8">
          <span className="eyebrow self-center">Phase 2 &mdash; Voice Session</span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight leading-tight text-ink">{record?.name ?? "Your Form"}</h1>
          
          <StatusAnnouncer message={status} tone={tone} />

          {phase === "notice" ? (
            <div className="flex flex-col gap-4">
              <p className="rounded-2xl border border-line bg-surface p-4 text-xs font-semibold leading-relaxed text-soft text-left">
                {CLOUD_FALLBACK_NOTICE}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn btn-primary flex-1 min-h-10 text-xs font-bold"
                  onClick={() => {
                    acknowledgeCloudNotice();
                    startFilling();
                  }}
                >
                  Agree &amp; Start
                </button>
                <button
                  type="button"
                  className="btn btn-secondary flex-1 min-h-10 text-xs font-bold"
                  onClick={() => startFilling()}
                >
                  Use offline only
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full shadow-lg shadow-accent/25 hover:scale-[1.01]"
              onClick={handleStart}
              disabled={!record || record.fields.length === 0}
            >
              <IconPlay className="h-5 w-5 fill-current" />
              <span>Start Voice Guidance</span>
            </button>
          )}
          
          <Link href={`/review/${formId}`} className="link-plain text-xs font-bold">
            Preview fields as list first
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface flex items-center justify-center min-h-[500px]">
        <div className="max-w-md w-full card text-center flex flex-col gap-6 p-8">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-ok text-surface shadow-md self-center">
            <IconCheck className="h-7 w-7 text-white" />
          </span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Form Completed!</h1>
          
          <StatusAnnouncer message={status} tone={tone} />
          
          <Link href={`/review/${formId}`} className="btn btn-primary w-full no-underline">
            <span>Continue to Review</span>
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-surface h-full relative overflow-hidden">
      
      {/* LEFT HAND OPTIONAL DRAWER SHEET (Collapsible Fields checklist) - Desktop */}
      <div className={`shrink-0 border-r border-line bg-surface/40 backdrop-blur-md transition-all duration-300 ${
        showFieldsList ? "w-80" : "w-0 overflow-hidden border-r-0"
      } hidden md:flex flex-col text-left`}>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-ink">Form Fields Map</h3>
          <span className="text-[10px] font-bold text-faint uppercase">{record?.fields.length} total</span>
        </div>
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-2.5">
          {record?.fields.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => jumpToField(i)}
              className={`w-full p-3 rounded-2xl border text-xs flex justify-between items-center transition-all text-left cursor-pointer hover:border-accent/40 hover:bg-surface/30 ${
                f.id === currentId
                  ? "border-accent bg-accent-soft text-accent font-extrabold"
                  : f.status === "answered" || f.status === "autofilled"
                  ? "border-line bg-surface/50 text-soft"
                  : "border-line bg-raised text-faint"
              }`}
            >
              <span className="truncate max-w-[180px] font-semibold">{i + 1}. {f.label}</span>
              {f.status === "answered" || f.status === "autofilled" ? (
                <IconCheck className="h-4 w-4 text-ok" />
              ) : f.status === "skipped" ? (
                <IconAlertCircle className="h-4 w-4 text-warn" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE DRAWER SHEET OVERLAY */}
      {showFieldsList && (
        <div className="md:hidden fixed inset-0 z-50 bg-raised/95 backdrop-blur-md flex flex-col animate-slide-up">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink">Form Fields Map</h3>
              <p className="text-[10px] text-soft mt-0.5 font-bold uppercase">{record?.fields.length} total fields</p>
            </div>
            <button
              onClick={() => setShowFieldsList(false)}
              className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-surface"
              aria-label="Close checklist"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-5 flex flex-col gap-3">
            {record?.fields.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  jumpToField(i);
                  setShowFieldsList(false);
                }}
                className={`p-4 rounded-2xl border text-xs flex justify-between items-center transition-all text-left cursor-pointer hover:bg-surface/30 ${
                  f.id === currentId
                    ? "border-accent bg-accent-soft text-accent font-extrabold"
                    : f.status === "answered" || f.status === "autofilled"
                    ? "border-line bg-surface/50 text-soft"
                    : "border-line bg-raised text-faint"
                }`}
              >
                <span className="truncate font-semibold">{i + 1}. {f.label}</span>
                <div className="flex items-center gap-2">
                  {f.status === "answered" || f.status === "autofilled" ? (
                    <IconCheck className="h-4 w-4 text-ok" />
                  ) : f.status === "skipped" ? (
                    <IconAlertCircle className="h-4 w-4 text-warn" />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT: THE VOICE-FIRST FOCUS THEATER */}
      <div className="flex-1 flex flex-col h-full bg-surface relative z-10">
        
        {/* TOP HEADER ROW - Dedicated for form filling */}
        <header className="border-b border-line bg-raised/85 backdrop-blur-md px-6 py-4.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFieldsList(!showFieldsList)}
              className="flex items-center gap-2 btn btn-secondary min-h-9 px-3.5 text-xs font-bold shadow-sm cursor-pointer"
            >
              {showFieldsList ? <IconEyeOff className="h-4 w-4 text-soft" /> : <IconEye className="h-4 w-4 text-soft" />}
              <span>Checklist</span>
            </button>
            <div className="hidden sm:block h-4 w-px bg-line" />
            <h2 className="hidden sm:block font-display text-sm font-extrabold text-ink truncate max-w-xs md:max-w-md">
              {record?.name ?? "Voice Filling Session"}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-bad hover:opacity-80">
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Quit Session</span>
            </Link>
          </div>
        </header>

        {/* FOCUS STAGE CONTAINER */}
        <div className="flex-grow flex flex-col items-center justify-center p-6 overflow-y-auto">
          <div className="max-w-2xl w-full flex flex-col gap-6.5">
            
            {/* Main Focus Card */}
            <div className="card bg-raised/80 backdrop-blur-md p-6 md:p-10 shadow-xl border-line flex flex-col items-center text-center gap-6 min-h-[280px] md:min-h-[340px] justify-center relative overflow-hidden">
              
              {/* Top Glow Progress Tracker Line */}
              <div className="absolute top-0 left-0 w-full h-1 bg-line">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${(questionNumber / Math.max(total, 1)) * 100}%` }}
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="eyebrow self-center">
                  Question {questionNumber} of {total}
                </span>
                
                {currentField && (
                  <span className="chip bg-accent-soft text-accent text-[10px] font-bold uppercase tracking-wider mt-1.5 self-center">
                    {typeLabel(currentField.type)}
                  </span>
                )}
              </div>

              {/* Giant Spoken Question Heading */}
              <h2 className="font-display text-2xl md:text-3.5xl font-extrabold tracking-tight text-ink max-w-xl leading-tight">
                {currentField?.label ?? "Active Question"}
              </h2>

              {/* Dynamic Waveform directly inside Focus Card */}
              {phase === "listening" && (
                <div className="w-full max-w-[160px] -mb-1 mt-1 shrink-0 animate-fade-in">
                  <Waveform active={voice?.sttState === "listening"} speaking={voice?.ttsActive} volume={voice?.micVolume} />
                </div>
              )}

              {/* Ambient Transcription Bubble (Caption style) */}
              <div className="min-h-[50px] flex flex-col items-center justify-center w-full px-4 border-t border-line/45 pt-4 mt-2">
                {phase === "asking" ? (
                  <p className="text-xs font-bold text-accent animate-pulse">Reading question aloud…</p>
                ) : phase === "listening" ? (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#0d9488] animate-ping" />
                    <p className="text-xs font-bold text-soft">Listening for answer &mdash; speak now</p>
                  </div>
                ) : phase === "confirming" && confirmValue ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-bold text-soft leading-normal">
                      Heard: <strong className="text-accent text-sm font-extrabold">&ldquo;{confirmValue}&rdquo;</strong>. Correct?
                    </p>
                    
                    {/* Spelling dictated bubbles */}
                    <div className="flex max-w-md flex-wrap justify-center gap-1 mt-1 font-mono text-xs font-bold">
                      {confirmValue.toUpperCase().split("").map((ch, i) => (
                        <span
                          key={i}
                          className={ch === " " ? "w-2.5" : "rounded-lg border border-line bg-surface px-1.5 py-0.5 text-ink shadow-sm"}
                        >
                          {ch === " " ? "" : ch}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : phase === "typing" ? (
                  <p className="text-xs font-bold text-soft">Manual entry active</p>
                ) : null}
              </div>

              {/* Manual Keyboard Editor overlay (morphs inside the Focus card) */}
              {phase === "typing" && currentField && (
                <form
                  className="flex w-full max-w-md flex-col gap-3.5 border-t border-line/60 pt-6 mt-2 text-left animate-fade-in"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveTyped();
                  }}
                >
                  <label htmlFor="typed-answer" className="text-xs font-bold uppercase tracking-wider text-soft">
                    Type your answer
                  </label>
                  {currentField.type === "choice" && currentField.options?.length ? (
                    <select
                      id="typed-answer"
                      className="field-input shadow-sm min-h-10 text-xs font-semibold"
                      value={typedValue}
                      onChange={(e) => setTypedValue(e.target.value)}
                    >
                      <option value="">Choose an option…</option>
                      {currentField.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : currentField.type === "checkbox" ? (
                    <select
                      id="typed-answer"
                      className="field-input shadow-sm min-h-10 text-xs font-semibold"
                      value={typedValue}
                      onChange={(e) => setTypedValue(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  ) : (
                    <input
                      id="typed-answer"
                      className="field-input shadow-sm min-h-10 text-xs font-semibold"
                      type="text"
                      value={typedValue}
                      onChange={(e) => setTypedValue(e.target.value)}
                      placeholder={currentField.type === "date" ? "DD/MM/YYYY" : ""}
                      autoFocus
                    />
                  )}
                  
                  <div className="flex gap-2.5 mt-1">
                    <button type="submit" className="btn btn-primary flex-1 min-h-10 text-xs font-bold cursor-pointer">
                      Save Answer
                    </button>
                    {isSttSupported() && (
                      <button type="button" className="btn btn-secondary flex-1 min-h-10 text-xs font-bold cursor-pointer" onClick={resume}>
                        Use voice
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* Resume from Pause overlay */}
              {phase === "paused" && (
                <div className="absolute inset-0 bg-raised/95 backdrop-blur flex flex-col items-center justify-center gap-4 animate-fade-in z-20">
                  <p className="text-sm font-bold text-soft">Voice Filling Paused</p>
                  <button
                    type="button"
                    className="btn btn-primary px-8 min-h-11 shadow-md hover:scale-[1.01] cursor-pointer"
                    onClick={resume}
                  >
                    <IconPlay className="h-4.5 w-4.5 fill-current" />
                    <span>Resume Workspace</span>
                  </button>
                </div>
              )}

            </div>

            {/* Core Controls Action Bar */}
            <div className="flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Voice Controls">
              <button
                type="button"
                className="btn btn-secondary min-h-10 px-5 text-xs font-bold shadow-sm cursor-pointer"
                onClick={doRepeat}
              >
                <IconRepeat className="h-4 w-4 text-soft" />
                <span>Repeat Question</span>
              </button>
              
              <button
                type="button"
                className="btn btn-secondary min-h-10 px-5 text-xs font-bold shadow-sm cursor-pointer"
                onClick={doSkip}
              >
                <IconSkip className="h-4 w-4 text-soft" />
                <span>Skip Field</span>
              </button>
              
              {phase !== "typing" && (
                <button
                  type="button"
                  className="btn btn-secondary min-h-10 px-5 text-xs font-bold shadow-sm cursor-pointer"
                  onClick={() => {
                    beginRun();
                    setPhase("typing");
                  }}
                >
                  <IconKeyboard className="h-4 w-4 text-soft" />
                  <span>Type Instead</span>
                </button>
              )}
              
              <button
                type="button"
                className="btn btn-secondary min-h-10 px-4 text-xs font-bold shadow-sm cursor-pointer"
                onClick={doBack}
                disabled={posRef.current === 0}
              >
                <IconArrowLeft className="h-4 w-4 text-soft" />
                <span>Go Back</span>
              </button>

              {phase !== "paused" && (
                <button
                  type="button"
                  className="btn btn-secondary min-h-10 px-4 text-xs font-bold shadow-sm cursor-pointer"
                  onClick={() => {
                    beginRun();
                    setPhase("paused");
                    setStatus("Paused. Press Resume when you're ready.");
                  }}
                >
                  <IconPause className="h-4 w-4 text-soft" />
                  <span>Pause</span>
                </button>
              )}
            </div>

            {/* Quick command reference guide footer */}
            <div className="text-center">
              <p className="text-[10px] font-bold text-faint uppercase tracking-wider leading-relaxed">
                Keyboard Shortcut: Press <kbd className="rounded bg-raised border border-line px-1.5 py-0.5 text-soft">Space</kbd> to record &middot; Press <kbd className="rounded bg-raised border border-line px-1.5 py-0.5 text-soft">Esc</kbd> to type
              </p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}

function typeLabel(type: FormField["type"]): string {
  switch (type) {
    case "text":
      return "Text Input";
    case "date":
      return "Date Field";
    case "choice":
      return "Multiple Choice";
    case "checkbox":
      return "Yes / No Checkbox";
    default:
      return "Text Input";
  }
}

function parseYesNo(transcript: string): boolean | null {
  const t = transcript.toLowerCase().trim();
  if (/^(yes|yeah|yep|yup|correct|right|that's right|sure|ok|okay|haan|ha|confirm)\b/.test(t)) return true;
  if (/^(no|nope|nah|wrong|incorrect|nahi|not correct|that's wrong)\b/.test(t)) return false;
  // Hindi / Malayalam / French — the recognizer returns native script.
  if (containsKeyword(transcript, INTL_KEYWORDS.no)) return false; // check "no" first: "വേണ്ട"/"non" are distinct
  if (containsKeyword(transcript, INTL_KEYWORDS.yes)) return true;
  return null;
}

function matchOption(transcript: string, options: string[]): string | null {
  const heard = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!heard) return null;
  for (const option of options) {
    if (option.toLowerCase() === heard) return option;
  }
  for (const option of options) {
    const o = option.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (heard.includes(o) || o.includes(heard)) return option;
  }
  const squashed = heard.replace(/\s+/g, "");
  for (const option of options) {
    const o = option.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (o === squashed) return option;
  }
  return null;
}

/**
 * Adaptive-STT routing: should this field's answer go through the LLM corrector
 * ("smart lane") or straight to deterministic formatting ("fast lane")? Names
 * and free-text/addresses benefit from correction; anything digit-bearing (IDs,
 * phone, pincode, amounts) or an email is left to deterministic formatting +
 * spell-back, since the corrector must never touch digits.
 */
function smartLane(field: FormField): { correct: boolean; kind: string } {
  const label = field.label.toLowerCase();
  if (
    /aadhaar|aadhar|adhar|\bpan\b|passport|voter|\buid\b|account|ifsc|pin\s?code|postal|\bpin\b|\botp\b|phone|mobile|contact|whatsapp|number|\bcode\b|amount|income|zip/.test(
      label,
    )
  ) {
    return { correct: false, kind: "number" };
  }
  if (/e-?mail/.test(label)) return { correct: false, kind: "email" };
  if (isNameField(field) || /\bname\b/.test(label)) return { correct: true, kind: "name" };
  if (/address|street|city|town|village|district|\bstate\b|landmark|\barea\b|place|locality|road|house|building/.test(label)) {
    return { correct: true, kind: "address" };
  }
  // Generic text stays in the fast lane — deterministic formatting only, no LLM
  // round-trip. Correction is spent only where Indian mishearings actually hide.
  return { correct: false, kind: field.type };
}
