"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
import { intentRegex } from "@/lib/voice/intlCommands";
import { getFile, getForm, saveForm } from "@/lib/storage/localHistoryStore";
import { analyzeForm, type AnalysisStage } from "@/lib/analysis/analyzeForm";
import { enhanceFieldsWithLlm } from "@/lib/analysis/enhanceFields";
import { isLlmAvailable } from "@/lib/voice/llm";
import { speak } from "@/lib/voice/textToSpeech";
import type { FormRecord } from "@/lib/types";
import { motion } from "framer-motion";
import {
  IconCheck,
  IconLoader,
  IconDoc,
  IconAlertCircle,
  IconPlay,
  IconRepeat
} from "@/components/icons";

type StepState = "pending" | "active" | "done";

const STEPS: { key: AnalysisStage | "done"; label: string }[] = [
  { key: "reading", label: "Opening your form" },
  { key: "ocr", label: "Reading text content" },
  { key: "layout", label: "Detecting layout grid" },
  { key: "fields", label: "Identifying input fields" },
  { key: "ordering", label: "Preparing voice checklist" },
];

const STAGE_ORDER: (AnalysisStage | "done")[] = ["reading", "ocr", "layout", "fields", "ordering", "done"];

export default function ProcessingPage() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const startedRef = useRef(false);

  const [record, setRecord] = useState<FormRecord | null>(null);
  const [stage, setStage] = useState<AnalysisStage | "done" | "failed">("reading");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState("Analyzing your form. This usually takes 20 to 40 seconds.");
  const [unclearCount, setUnclearCount] = useState(0);
  const [shapesNote, setShapesNote] = useState(false);

  const done = stage === "done";
  const failed = stage === "failed";
  const fieldCount = record?.fields.length ?? 0;

  useVoicePage(
    {
      title: "Processing form",
      description: done
        ? `Analysis finished. ${fieldCount} fields found. Say start filling to begin.`
        : "I am analyzing your form. This takes under a minute.",
      commands: done
        ? [
            // English fast lane + the multilingual "start" keywords (hi/ml/fr).
            [
              new RegExp(`start( filling)?|begin|let'?s go|${intentRegex("start").source}`, "iu"),
              () => router.push(`/fill/${formId}`),
              "start filling",
            ],
            [/preview|review fields/, () => router.push(`/review/${formId}`), "preview fields"],
          ]
        : [],
      // Adaptive router: any phrasing / language for "begin filling" resolves
      // here even if the fast lane above misses (e.g. "പൂരിപ്പിക്കൽ ആരംഭിക്കുക").
      actions: done
        ? [
            {
              id: "start_filling",
              description: "Begin filling this form by voice, question by question.",
              run: () => router.push(`/fill/${formId}`),
            },
            {
              id: "preview_fields",
              description: "Preview or review the detected form fields before filling.",
              run: () => router.push(`/review/${formId}`),
            },
          ]
        : [],
    },
    [done, fieldCount],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    try {
      const form = await getForm(formId);
      if (!form) {
        setStage("failed");
        setStatus("I could not find this form. Please go back and upload it again.");
        return;
      }
      setRecord(form);

      if (form.status !== "processing" && form.fields.length > 0) {
        setStage("done");
        setUnclearCount(form.fields.filter((f) => f.confidence < 60 && f.source === "ocr").length);
        setStatus(`Form is ready. I found ${form.fields.length} fields in this form.`);
        return;
      }

      const blob = await getFile(formId, "original");
      if (!blob) {
        setStage("failed");
        setStatus("The original file is missing. Please upload the form again.");
        return;
      }

      const result = await analyzeForm(blob, form.sourceType, (progress) => {
        setStage(progress.stage);
        if (progress.stage === "ocr") {
          const pct = progress.pct !== undefined ? `${Math.round(progress.pct * 100)}%` : "";
          if (progress.page && progress.pageCount) {
             setDetail(`page ${progress.page} of ${progress.pageCount} — ${pct}`);
          } else {
             setDetail(`processing with Sarvam AI — ${pct}`);
          }
        } else {
          setDetail("");
        }
      });

      // AI pass: refine the OCR'd fields (cleaner labels, correct types,
      // natural questions). Best-effort — falls back to OCR if the LLM is off.
      let fields = result.fields;
      if (fields.length > 0 && isLlmAvailable()) {
        setStage("fields");
        setDetail("understanding the form with AI");
        speak("Reading through your form to understand each field.");
        try {
          fields = await enhanceFieldsWithLlm(fields, form.name);
        } catch {
          fields = result.fields;
        }
      }

      const updated: FormRecord = {
        ...form,
        status: "ready",
        isAcroForm: result.isAcroForm,
        pageCount: result.pageCount,
        pageDims: result.pageDims,
        fields,
      };
      await saveForm(updated);
      setRecord(updated);
      setShapesNote(result.shapesUnavailable);
      const unclear = fields.filter((f) => f.confidence < 60 && f.source === "ocr").length;
      setUnclearCount(unclear);
      setStage("done");

      if (fields.length === 0) {
        const message =
          "I could not find any fillable fields in this form. Try scanning again with better lighting, or upload a clearer copy.";
        setStatus(message);
        speak(message);
        return;
      }

      // Richer, uninterrupted summary: how many fields, a taste of what they
      // are, and how many will be auto-filled from the saved profile.
      const sectionKind = result.isAcroForm ? "a digital form with built-in fields" : "a scanned form";
      const preview = fields.slice(0, 4).map((f) => f.label).join(", ");
      const autofillable = fields.filter((f) => f.profileKey && !f.sensitive).length;
      const summary =
        `Your form is ready. It's ${sectionKind} with ${fields.length} field${fields.length === 1 ? "" : "s"}, ` +
        `including ${preview}${fields.length > 4 ? ", and more" : ""}. ` +
        (autofillable > 0
          ? `I can auto-fill up to ${autofillable} of them from your saved profile. `
          : "") +
        (unclear > 0
          ? `${unclear} field${unclear === 1 ? " was" : "s were"} unclear, so I'll spell ${unclear === 1 ? "it" : "them"} out and ask you. `
          : "") +
        `Say "start filling", or press the button when you're ready.`;
      setStatus("Form is ready. " + fields.length + " fields found.");
      speak(summary);
    } catch {
      setStage("failed");
      const message = "Something went wrong while analyzing the form. Please try again.";
      setStatus(message);
      speak(message);
    }
  }

  function stepState(key: AnalysisStage | "done"): StepState {
    if (stage === "failed") return "pending";
    const current = STAGE_ORDER.indexOf(stage);
    const mine = STAGE_ORDER.indexOf(key);
    if (mine < current) return "done";
    if (mine === current) return "active";
    return "pending";
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 animate-fade-in pb-16">
      <header className="border-b border-line pb-3">
        <p className="eyebrow mb-1">Step 2 of 4 — Analysis</p>
        <h1 className="font-display text-2xl font-black text-ink">
          {done ? "Form is ready" : "Reading your form…"}
        </h1>
      </header>

      <StatusAnnouncer message={status} tone={failed ? "error" : done ? "success" : "info"} />

      {!done && !failed && (
        <ol className="card p-6 flex flex-col gap-1 border-line bg-raised shadow-sm list-none" aria-label="Analysis progress">
          {STEPS.map((step, idx) => {
            const state = stepState(step.key);
            return (
              <motion.li
                key={step.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex min-h-12 items-center gap-4 border-b border-line/40 last:border-0 pb-1"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-300 ${
                    state === "done"
                      ? "bg-ok-soft text-ok"
                      : state === "active"
                        ? "bg-accent-soft text-accent ring-2 ring-accent/15"
                        : "border border-line text-faint"
                  }`}
                >
                  {state === "done" ? (
                    <IconCheck className="h-4 w-4" strokeWidth={3} />
                  ) : state === "active" ? (
                    <IconLoader className="h-4 w-4 animate-spin" />
                  ) : null}
                </span>
                
                <span className={`text-xs font-bold ${
                  state === "active" ? "text-ink" : state === "pending" ? "text-faint font-normal" : "text-soft"
                }`}>
                  {step.label}
                  {state === "active" && detail ? <span className="text-soft font-semibold font-sans"> &middot; {detail}</span> : ""}
                  <span className="sr-only">
                    {state === "done" ? " finished" : state === "active" ? " in progress" : " waiting"}
                  </span>
                </span>
              </motion.li>
            );
          })}
        </ol>
      )}

      {done && fieldCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 15 }}
          className="card p-6 border-line bg-raised shadow-sm flex flex-col gap-5"
        >
          <div className="flex items-center gap-4 border-b border-line pb-3">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok shrink-0">
              <IconDoc className="h-5.5 w-5.5" />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold text-ink leading-tight">
                {fieldCount} fields detected
              </h3>
              {record?.isAcroForm && (
                <p className="text-[11px] text-soft font-semibold mt-0.5">
                  This PDF contains built-in fillable AcroForm properties.
                </p>
              )}
            </div>
          </div>

          {unclearCount > 0 && (
            <div className="flex gap-3 rounded-2xl bg-warn-soft p-4 border border-amber-200 text-warn">
              <IconAlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">
                {unclearCount} field{unclearCount === 1 ? " is" : "s are"} low confidence. I will double check the spelling with you during the session.
              </p>
            </div>
          )}

          {shapesNote && (
            <p className="text-[11px] text-soft font-semibold leading-relaxed bg-surface/50 border border-line p-3 rounded-2xl">
              Layout grid detection was limited. Field order has been estimated sequentially.
            </p>
          )}

          <div className="flex flex-wrap gap-2.5 mt-1">
            <button
              type="button"
              className="btn-primary min-h-11 px-8 text-xs shadow-md shadow-accent/15 hover:scale-[1.01]"
              onClick={() => router.push(`/fill/${formId}`)}
            >
              <IconPlay className="h-4 w-4" />
              Start filling
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-6 text-xs font-semibold"
              onClick={() => router.push(`/review/${formId}`)}
            >
              Preview fields
            </button>
          </div>
        </motion.div>
      )}

      {(failed || (done && fieldCount === 0)) && (
        <div className="flex flex-wrap gap-2.5 justify-center mt-2">
          <Link href="/upload" className="btn-primary min-h-10 px-6 text-xs">
            <IconRepeat className="h-4 w-4" />
            Upload again
          </Link>
          <Link href="/scan" className="btn-secondary min-h-10 px-6 text-xs">
            Scan again
          </Link>
          <Link href="/" className="btn-secondary min-h-10 px-6 text-xs">
            Go home
          </Link>
        </div>
      )}
    </div>
  );
}
