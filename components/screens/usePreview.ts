"use client";

/**
 * Preview screen logic — allows user to verify OCR extraction before filling:
 * view field bounding boxes over the document, rename/retype/remove fields,
 * and hear fields read aloud.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { intentRegex } from "@/lib/voice/intlCommands";
import { getFile, getForm, saveForm } from "@/lib/storage/localHistoryStore";
import type { FieldType, FormField, FormRecord } from "@/lib/types";
import { loadPdfDocument, renderPageToCanvas } from "@/lib/pdf/pdfReader";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";

export type PreviewTone = "info" | "success" | "warning" | "error";

export interface UndoState {
  field: FormField;
  index: number;
  timer: NodeJS.Timeout;
}

export function usePreview() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();

  const [record, setRecord] = useState<FormRecord | null>(null);
  const [status, setStatus] = useState("Loading your form preview…");
  const [tone, setTone] = useState<PreviewTone>("info");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<FieldType>("text");
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [reading, setReading] = useState(false);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const pageCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Load record and document file
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    getForm(formId).then(async (form) => {
      if (!active) return;
      if (!form) {
        setTone("error");
        setStatus("I could not find this form.");
        return;
      }
      setRecord(form);
      const fieldCount = form.fields.length;
      setStatus(
        `${fieldCount} field${fieldCount === 1 ? "" : "s"} detected. Check what I found or start filling.`,
      );

      const blob = await getFile(formId, "original");
      if (!active || !blob) return;

      if (form.sourceType === "pdf") {
        try {
          const buffer = await blob.arrayBuffer();
          if (!active) return;
          const pdf = await loadPdfDocument(buffer);
          if (!active) return;
          setPdfDoc(pdf);
        } catch (err) {
          console.error("Failed to load PDF preview:", err);
        }
      } else {
        createdUrl = URL.createObjectURL(blob);
        setOriginalUrl(createdUrl);
      }
    });

    return () => {
      active = false;
      cancelSpeech();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [formId]);

  // Lazy PDF page renderer
  async function renderPdfPage(pageIndex: number): Promise<HTMLCanvasElement | null> {
    if (!pdfDoc) return null;
    if (pageCacheRef.current.has(pageIndex)) {
      return pageCacheRef.current.get(pageIndex)!;
    }
    try {
      const pageNum = Math.min(Math.max(1, pageIndex + 1), pdfDoc.numPages);
      const rendered = await renderPageToCanvas(pdfDoc, pageNum, 1400);
      pageCacheRef.current.set(pageIndex, rendered.canvas);
      return rendered.canvas;
    } catch (err) {
      console.error("Failed to render page", pageIndex, err);
      return null;
    }
  }

  const fieldCount = record?.fields.length ?? 0;

  useVoicePage(
    {
      title: "Check the detected fields",
      description: `${fieldCount} fields detected. Check what I found or say start filling.`,
      commands: [
        [
          new RegExp(`start( filling)?|begin|let'?s go|${intentRegex("start").source}`, "iu"),
          () => router.push(`/fill/${formId}`),
          "start filling",
        ],
        [/read (the )?fields/, () => readFields(), "read fields"],
      ],
      actions: [
        {
          id: "start_filling",
          description: "Begin filling this form by voice, question by question.",
          run: () => router.push(`/fill/${formId}`),
        },
        {
          id: "read_fields",
          description: "Read all detected field labels out loud.",
          run: () => readFields(),
        },
      ],
    },
    [record?.id, fieldCount, reading],
  );

  function selectField(id: string | null) {
    setSelectedFieldId(id);
    if (id && record) {
      const field = record.fields.find((f) => f.id === id);
      if (field && typeof field.page === "number") {
        setCurrentPage(field.page);
      }
    }
  }

  function startEdit(field: FormField) {
    setEditingId(field.id);
    setEditLabel(field.label);
    setEditType(field.type);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(fieldId: string) {
    if (!record) return;
    const target = record.fields.find((f) => f.id === fieldId);
    if (!target) return;

    const trimmedLabel = editLabel.trim() || target.label;
    const updatedFields = record.fields.map((f) =>
      f.id === fieldId
        ? {
            ...f,
            label: trimmedLabel,
            type: editType,
            question: f.label !== trimmedLabel ? `What is your ${trimmedLabel}?` : f.question,
          }
        : f,
    );

    const updated: FormRecord = {
      ...record,
      fields: updatedFields,
      updatedAt: Date.now(),
    };

    setRecord(updated);
    setEditingId(null);
    await saveForm(updated);
    setTone("success");
    setStatus(`Updated ${trimmedLabel}.`);
  }

  async function removeField(field: FormField) {
    if (!record) return;
    const index = record.fields.findIndex((f) => f.id === field.id);
    if (index === -1) return;

    const profileKey = field.profileKey;
    const updatedFields = record.fields
      .filter((f) => f.id !== field.id)
      .map((f) => {
        if (profileKey && f.dependsOn?.fieldKey === profileKey) {
          const { dependsOn, ...rest } = f;
          return rest;
        }
        return f;
      });

    const updated: FormRecord = {
      ...record,
      fields: updatedFields,
      updatedAt: Date.now(),
    };

    setRecord(updated);
    await saveForm(updated);

    if (undoState?.timer) {
      clearTimeout(undoState.timer);
    }

    const timer = setTimeout(() => {
      setUndoState(null);
    }, 6000);

    setUndoState({ field, index, timer });
    if (selectedFieldId === field.id) {
      setSelectedFieldId(null);
    }
    setTone("info");
    setStatus(`Removed ${field.label}.`);
  }

  async function undoRemove() {
    if (!record || !undoState) return;
    if (undoState.timer) {
      clearTimeout(undoState.timer);
    }

    const restoredFields = [...record.fields];
    restoredFields.splice(undoState.index, 0, undoState.field);

    const updated: FormRecord = {
      ...record,
      fields: restoredFields,
      updatedAt: Date.now(),
    };

    setRecord(updated);
    setUndoState(null);
    await saveForm(updated);
    setTone("success");
    setStatus(`Restored ${undoState.field.label}.`);
  }

  async function readFields() {
    if (!record || reading) {
      cancelSpeech();
      setReading(false);
      return;
    }
    setReading(true);
    const sorted = [...record.fields].sort((a, b) => a.order - b.order);
    for (const field of sorted) {
      await speak(field.label, { interrupt: false });
    }
    setReading(false);
  }

  const counts = record
    ? {
        unclear: record.fields.filter((f) => f.confidence < 60 && f.source === "ocr").length,
        autofillable: record.fields.filter((f) => f.profileKey && !f.sensitive).length,
        total: record.fields.length,
      }
    : { unclear: 0, autofillable: 0, total: 0 };

  const sortedFields = record ? [...record.fields].sort((a, b) => a.order - b.order) : [];

  return {
    formId,
    record,
    status,
    tone,
    selectedFieldId,
    selectField,
    editingId,
    editLabel,
    setEditLabel,
    editType,
    setEditType,
    startEdit,
    cancelEdit,
    saveEdit,
    removeField,
    undoState,
    undoRemove,
    reading,
    readFields,
    pdfDoc,
    originalUrl,
    currentPage,
    setCurrentPage,
    renderPdfPage,
    counts,
    sortedFields,
    goFill: () => router.push(`/fill/${formId}`),
  };
}

export type PreviewScreen = ReturnType<typeof usePreview>;
