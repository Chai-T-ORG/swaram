"use client";

/**
 * The fill-loop session — THE core of Swaram, moved verbatim from the old
 * fill page. The phase machine (loading | start | notice | asking | listening
 * | confirming | typing | paused | done), the generation guards, the
 * transcript listener with its exact [phase] dependency, spell mode, the
 * smart-lane LLM correction, and all command paths are unchanged; only the
 * presentation around them is new.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useVoice, useVoicePage } from "@/components/voice/VoiceProvider";
import { isLlmAvailable, assist, correctTranscript } from "@/lib/voice/llm";
import { getForm, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormField, FormRecord } from "@/lib/types";
import { expandTableCells, applyCellValue, parseCount, type CellRef, type RowCountRef } from "@/lib/analysis/tableCells";
import { speak, cancelSpeech, spellOut, unlockAudioPlayback, prefetchTTS } from "@/lib/voice/textToSpeech";
import { getVoiceSettings } from "@/lib/voice/voiceSettings";
import { validateField } from "@/lib/validation/rules";
import { spellTokensToText, titleCase, formatAnswer, mergeSpelledCorrection, applySpokenEdit } from "@/lib/voice/transcriptFormat";
import { parseFillCommand, isNameField, needsConfirmation } from "@/lib/voice/fillCommands";
import { setSttFieldHint } from "@/lib/voice/groqSTT";
import { rememberName, knownNames, snapToKnownName } from "@/lib/voice/nameDictionary";
import { transliterateForSpeech } from "@/lib/voice/transliterate";
import { INTL_KEYWORDS, containsKeyword } from "@/lib/voice/intlCommands";
import {
  isSttSupported,
  acknowledgeCloudNotice,
  addTranscriptListener,
  removeTranscriptListener,
} from "@/lib/voice/speechToText";

const UNCLEAR_THRESHOLD = 0.6;

export type FillPhase =
  | "loading"
  | "start"
  | "notice"
  | "asking"
  | "listening"
  | "confirming"
  | "typing"
  | "paused"
  | "done";

export type FillTone = "info" | "success" | "warning" | "error";

export function useFillSession() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const voice = useVoice();
  useVoicePage({
    title: "Voice session",
    hint: "Answer the questions as I read them. Say skip, repeat, or stop anytime.",
    description:
      "Form filling stage. Answer the questions as I read them. Say skip to skip, repeat to repeat, or go back to correct a field.",
    exclusive: true,
  });

  const [record, setRecord] = useState<FormRecord | null>(null);
  const [phase, setPhase] = useState<FillPhase>("loading");
  const [status, setStatus] = useState("Loading your form session…");
  const [tone, setTone] = useState<FillTone>("info");
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
  /** Synthetic table-cell queue items -> their {tableId,row,col} in record.fields. */
  const cellMapRef = useRef<Map<string, CellRef>>(new Map());
  /** Synthetic "how many entries?" items -> the list table they gate. */
  const rowCountMapRef = useRef<Map<string, RowCountRef>>(new Map());
  const onlySkippedRef = useRef(searchParams.get("only") === "skipped");
  const retriesRef = useRef(0);
  const noSpeechRef = useRef(0);
  const unclearTriedRef = useRef(false);
  const pendingConfirmRef = useRef<string | null>(null);
  const listenKindRef = useRef<"answer" | "confirm">("answer");
  /** When true, the next answer utterance is dictated letters (spell mode). */
  const spellInputRef = useRef(false);
  /** True while the value awaiting confirmation came from spelling — a "no"
   * then re-enters spell-repair instead of asking the question over. */
  const spelledPendingRef = useRef(false);

  const isContinuousListening = voice?.sttState === "listening";
  const messages = voice?.messages ?? [];

  // currentId may point at a synthetic table-cell field that lives only in the
  // queue, so fall back to searching the queue when it isn't in record.fields.
  const currentField =
    record?.fields.find((f) => f.id === currentId) ??
    queueRef.current.find((f) => f.id === currentId) ??
    null;
  const queueLength = queueRef.current.length;
  // Progress is queue-relative: table expansion makes the queue longer than
  // record.fields, so counting against record.fields would go negative.
  const questionNumber = queueLength > 0 ? Math.min(posRef.current + 1, queueLength) : 1;

  // Track active components
  useEffect(() => {
    load();
    return () => {
      cancelSpeech();
      setSttFieldHint("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Expand any table fields into one synthetic question per empty cell,
    // gating list tables (family members etc.) behind a "how many?" question.
    cellMapRef.current = new Map();
    rowCountMapRef.current = new Map();
    queueRef.current = expandTableCells(pending, cellMapRef.current, rowCountMapRef.current);
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
      case "comb":
        return `What is your ${field.label}? This is one character per box, so you can say let me spell.`;
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
    let field = fieldAt(pos);

    // Automatically skip signatures and unmet dependencies. Tables are normally
    // expanded into per-cell questions before they reach the queue; this skip
    // only guards the jumpToField path, which uses the raw record.fields.
    while (field) {
      let skip = false;
      if (field.type === "signature" || field.type === "table") {
        skip = true;
      } else if (field.dependsOn) {
        const target = recordRef.current?.fields.find((f) => f.profileKey === field!.dependsOn!.fieldKey);
        if (target && target.value.trim().toLowerCase() !== field.dependsOn.expectedValue.toLowerCase()) {
          skip = true;
        }
      }

      if (skip) {
        field.status = "skipped";
        pos++;
        field = fieldAt(pos);
      } else {
        break;
      }
    }

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
    // A stale value from the previous field must never seed a spell-repair.
    pendingConfirmRef.current = null;
    spelledPendingRef.current = false;
    // Tell the STT router what kind of clip is coming: name-field audio runs
    // the server's multi-engine ensemble with this label + the user's known
    // names as biasing context.
    setSttFieldHint(
      smartLane(field).kind === "name" ? "name" : "",
      { label: field.label, names: knownNames() },
    );
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
        "Just say your answer. You can also say: repeat, skip, go back, let me spell, type instead, or pause. " +
          "While confirming, you can say things like: change K to C, or: the third letter is E.",
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
      // Repair, don't restart: when the user spells right after rejecting a
      // heard value, splice the spelling into it — fixing only the wrong word
      // ("Twinsha T Tilkan" + "t h i l a k a n" -> "Twinsha T Thilakan").
      const prior = pendingConfirmRef.current;
      const merged = prior && field?.type === "text" ? mergeSpelledCorrection(prior, spelled) : spelled;
      const value = field && isNameField(field) ? titleCase(merged) : merged;
      setSttFieldHint("");
      spelledPendingRef.current = true;
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
    setSttFieldHint("spell", { label: fieldAt(posRef.current)?.label });
    setTone("info");
    const repairing = Boolean(pendingConfirmRef.current);
    setStatus(
      repairing
        ? "Spell just the wrong word — or the whole answer. Say “space” between words."
        : "Spell it letter by letter. Say “space” between words.",
    );
    speak(
      repairing
        ? "Go ahead — spell just the word I got wrong, letter by letter. Or spell the whole answer with space between words."
        : "Go ahead — spell it letter by letter. Say space between words.",
    ).then(() => {
      if (alive(id)) setPhase("listening");
    });
  }

  async function handleAnswer(pos: number, raw: string, confidence: number, id: number) {
    const field = fieldAt(pos);
    if (!field) return;

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
    // A name the user already confirmed once beats any model: snap to it
    // deterministically and skip the LLM round-trip entirely.
    const snapped = lane.kind === "name" ? snapToKnownName(raw, field.profileKey) : null;
    if (snapped) {
      source = snapped;
    } else if (lane.correct && isLlmAvailable()) {
      const corrected = await correctTranscript(
        raw,
        { label: field.label, kind: lane.kind, help: field.help },
        getVoiceSettings().sttLang,
        lane.kind === "name" ? knownNames() : [],
      );
      if (!alive(id)) return;
      if (corrected) source = corrected;
    }

    const value = formatAnswer(source, field);
    if (!value) {
      await speak("I didn't catch that. Could you repeat it?");
      if (alive(id)) setPhase("listening");
      return;
    }

    const validationError = validateField(field.label, value);
    if (validationError) {
      await speak(`${validationError} Let's try again.`);
      if (alive(id)) setPhase("listening");
      return;
    }

    if (!needsConfirmation(field, isUnclear(field))) {
      commit(pos, value, id, `${value}.`);
      return;
    }

    pendingConfirmRef.current = value;
    spelledPendingRef.current = false;
    setConfirmValue(value);
    setHeard(value);
    listenKindRef.current = "confirm";
    setSttFieldHint("");
    setPhase("confirming");
    setStatus(`I heard: “${value}”. Correct?`);
    // For names, emails, and numbers, read it back character-by-character so
    // the user can actually verify it — this is where mishearings hide.
    const spellItBack = isNameField(field) || /(email|phone|mobile|aadhaar|number|code|account|ifsc)/i.test(field.label);
    // In Hindi/Malayalam, speak the name in its phonetic native script so the
    // voice pronounces it the Indian way; the spelled-back letters stay Latin
    // because that's what lands on the printed form.
    const spokenValue = isNameField(field)
      ? await transliterateForSpeech(value, getVoiceSettings().sttLang)
      : value;
    if (!alive(id)) return;
    const readback = spellItBack
      ? `I heard: ${spokenValue}. That's ${spellOut(value)}. Correct?`
      : `I heard: ${spokenValue}. Correct?`;
    await speak(readback + (isTextLike(field) ? " You can also say: let me spell." : ""));
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
      // A rejected SPELLED value goes straight back to spell-repair — the user
      // was already spelling; making them start over is the old, broken flow.
      if (spelledPendingRef.current && isTextLike(field)) {
        enterSpellMode(id);
        return;
      }
      setPhase("confirming");
      const spellHint =
        isTextLike(field)
          ? " You can also say: let me spell, or: change a letter."
          : "";
      await speak("Okay, once more. " + questionFor(field) + spellHint);
      if (alive(id)) {
        listenKindRef.current = "answer";
        setSttFieldHint(smartLane(field).kind === "name" ? "name" : "", {
          label: field.label,
          names: knownNames(),
        });
        setPhase("listening");
      }
      return;
    }

    // Not a yes and not a no — maybe a surgical edit: "change k to c",
    // "the third letter is e", "replace tilkan with thilakan".
    const pending = pendingConfirmRef.current;
    if (pending && isTextLike(field)) {
      const edited = applySpokenEdit(pending, transcript);
      if (edited) {
        const value = isNameField(field) ? titleCase(edited) : edited;
        pendingConfirmRef.current = value;
        setConfirmValue(value);
        setHeard(value);
        setPhase("confirming");
        setStatus(`Changed to: “${value}”. Correct?`);
        await speak(`Changed. Now I have: ${spellOut(value)}. Correct?`);
        if (alive(id)) setPhase("listening");
        return;
      }
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
      // If this is a synthetic table cell, mirror the answer into its parent
      // table's value grid so write-back (table path) picks it up.
      const cell = cellMapRef.current.get(field.id);
      if (cell) {
        const table = rec.fields.find((f) => f.id === cell.tableId);
        if (table) applyCellValue(table, cell, val);
      }
      // If this is a "how many entries?" answer, drop the cell questions for
      // rows beyond the requested count from the rest of the queue.
      const rowCount = rowCountMapRef.current.get(field.id);
      if (rowCount) {
        const n = parseCount(val);
        if (n !== null) {
          const keep = Math.max(0, Math.min(n, rowCount.maxRows));
          queueRef.current = queueRef.current.filter((qf, i) => {
            if (i <= pos) return true;
            const c = cellMapRef.current.get(qf.id);
            return !(c && c.tableId === rowCount.tableId && c.row >= keep);
          });
        }
      }
      syncRecord();

      // A confirmed name is learned for good: future STT snaps to it, the LLM
      // corrector sees it, and Azure's phrase list is biased toward it.
      if (isNameField(field)) rememberName(field.profileKey, val);

      if (voice) {
        voice.addMessage("user", val);
      }
    }
    setSttFieldHint("");
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
    setSttFieldHint("");
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

  function enterTyping() {
    beginRun();
    setPhase("typing");
  }

  function pause() {
    beginRun();
    setPhase("paused");
    setStatus("Paused. Press Resume when you're ready.");
  }

  function agreeAndStart() {
    acknowledgeCloudNotice();
    startFilling();
  }

  // Visible Yes/No buttons drive the exact same code path the voice takes.
  function confirmYes() {
    void handleSpeechInput("yes", 1);
  }

  function confirmNo() {
    void handleSpeechInput("no", 1);
  }

  return {
    formId,
    router,
    voice,
    record,
    phase,
    status,
    tone,
    currentField,
    currentId,
    questionNumber,
    total: queueLength > 0 ? queueLength : record?.fields.length || 0,
    confirmValue,
    /** True while the session is waiting on a yes/no for confirmValue. */
    confirmMode: listenKindRef.current === "confirm",
    typedValue,
    setTypedValue,
    heard,
    messages,
    isContinuousListening,
    showFieldsList,
    setShowFieldsList,
    atFirst: posRef.current === 0,
    handleStart,
    startFilling,
    agreeAndStart,
    doRepeat,
    doSkip,
    doBack,
    resume,
    saveTyped,
    jumpToField,
    enterTyping,
    pause,
    confirmYes,
    confirmNo,
    sttSupported: isSttSupported(),
  };
}

export type FillSession = ReturnType<typeof useFillSession>;

export function typeLabel(type: FormField["type"]): string {
  switch (type) {
    case "text":
      return "Text input";
    case "date":
      return "Date field";
    case "choice":
      return "Multiple choice";
    case "checkbox":
      return "Yes / no";
    case "comb":
      return "One character per box";
    default:
      return "Text input";
  }
}

function isTextLike(field: FormField): boolean {
  return field.type === "text" || field.type === "comb";
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
