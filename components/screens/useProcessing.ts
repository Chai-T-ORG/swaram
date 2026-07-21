"use client";

/**
 * Processing screen logic — runs the analysis pipeline exactly once
 * (startedRef guard), reports stage progress, and speaks the ready summary.
 *
 * The literal status strings "fields detected", "could not find any fillable
 * fields" and "Something went wrong" are e2e anchors — both platform bodies
 * must render them.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { intentRegex } from "@/lib/voice/intlCommands";
import { getFile, getForm, saveForm } from "@/lib/storage/localHistoryStore";
import { analyzeForm, type AnalysisStage } from "@/lib/analysis/analyzeForm";
import { enhanceFieldsWithLlm } from "@/lib/analysis/enhanceFields";
import { isLlmAvailable } from "@/lib/voice/llm";
import { speak } from "@/lib/voice/textToSpeech";
import type { FormRecord } from "@/lib/types";

import { loadPdfDocument, renderPageToCanvas } from "@/lib/pdf/pdfReader";

export type StepState = "pending" | "active" | "done";

export const PROCESSING_STEPS: { key: AnalysisStage | "done"; label: string }[] = [
  { key: "reading", label: "Opening your form" },
  { key: "ocr", label: "Reading your form with AI vision" },
  { key: "layout", label: "Understanding the layout" },
  { key: "fields", label: "Identifying input fields" },
  { key: "ordering", label: "Preparing voice checklist" },
];

const STAGE_ORDER: (AnalysisStage | "done")[] = ["reading", "ocr", "layout", "fields", "ordering", "done"];

const activeProcesses = new Set<string>();

export function useProcessing() {
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
            [/preview|review fields/, () => router.push(`/preview/${formId}`), "preview fields"],
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
              run: () => router.push(`/preview/${formId}`),
            },
          ]
        : [],
    },
    [done, fieldCount],
  );

  useEffect(() => {
    if (activeProcesses.has(formId)) {
      // Form is already being processed in another instance (Strict Mode).
      const interval = setInterval(async () => {
        const form = await getForm(formId);
        if (form && form.status !== "processing") {
          clearInterval(interval);
          run(); // Fast-path to 'done' state
        }
      }, 2000);
      return () => clearInterval(interval);
    }
    
    activeProcesses.add(formId);
    run().finally(() => activeProcesses.delete(formId));
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
            setDetail(`page ${progress.page} of ${progress.pageCount}${pct ? ` — ${pct}` : ""}`);
          } else {
            setDetail(pct ? `processing securely with AI vision — ${pct}` : "sending to AI vision");
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

  const autofillable = record?.fields.filter((f) => f.profileKey && !f.sensitive).length ?? 0;

  const stageIdx = STAGE_ORDER.indexOf(stage as AnalysisStage | "done");
  const progressRatio =
    stageIdx >= 0 ? Math.min(1, Math.max(0, (stageIdx + 1) / STAGE_ORDER.length)) : 0;

  const typeBreakdown = record
    ? (() => {
        const counts: Record<string, number> = {};
        for (const f of record.fields) {
          counts[f.type] = (counts[f.type] || 0) + 1;
        }
        return Object.entries(counts)
          .map(([type, count]) => `${count} ${type}`)
          .join(" · ");
      })()
    : "";

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const recordId = record?.id;
  const recordSourceType = record?.sourceType;

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!recordId || !recordSourceType) return;

    if (recordSourceType === "image") {
      getFile(formId, "original").then((blob) => {
        if (!active || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setThumbnailUrl(createdUrl);
      });
    } else if (recordSourceType === "pdf") {
      getFile(formId, "original").then(async (blob) => {
        if (!active || !blob) return;
        try {
          const buffer = await blob.arrayBuffer();
          if (!active) return;
          const pdf = await loadPdfDocument(buffer);
          if (!active) return;
          try {
            const rendered = await renderPageToCanvas(pdf, 1, 600);
            if (!active) return;
            rendered.canvas.toBlob((b) => {
              if (!active || !b) return;
              createdUrl = URL.createObjectURL(b);
              setThumbnailUrl(createdUrl);
            }, "image/png");
          } finally {
            (pdf as { destroy?: () => void }).destroy?.();
          }
        } catch (err) {
          console.error("Failed to render PDF thumbnail:", err);
        }
      });
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [formId, recordId, recordSourceType]);

  return {
    formId,
    record,
    stage,
    detail,
    status,
    unclearCount,
    shapesNote,
    done,
    failed,
    fieldCount,
    autofillable,
    progressRatio,
    typeBreakdown,
    thumbnailUrl,
    stepState,
    goFill: () => router.push(`/fill/${formId}`),
    goReview: () => router.push(`/preview/${formId}`),
  };
}

export type ProcessingScreen = ReturnType<typeof useProcessing>;
