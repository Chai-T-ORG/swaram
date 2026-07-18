"use client";

/**
 * Review screen logic — field list with inline edits, read-back loop, and the
 * "answer skipped" path (/fill/{id}?only=skipped — the fill loop reads that
 * query param). Moved verbatim from the old page.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { getForm, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormField, FormRecord } from "@/lib/types";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";

export type ReviewTone = "info" | "success" | "warning" | "error";

export function useReview() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<FormRecord | null>(null);
  const [status, setStatus] = useState("Loading your answers…");
  const [tone, setTone] = useState<ReviewTone>("info");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [reading, setReading] = useState(false);

  const skippedCount =
    record?.fields.filter((f) => f.status === "skipped" || f.status === "unclear" || f.status === "pending").length ?? 0;

  useVoicePage(
    {
      title: "Review your answers",
      hint:
        skippedCount > 0
          ? `${skippedCount} field${skippedCount === 1 ? "s" : ""} still need attention. Say answer skipped, read my answers, or continue.`
          : "Say read my answers, or continue.",
      description: `Review your answers. ${skippedCount} fields skipped. Say read answers or continue.`,
      commands: [
        [/read (my |all )?(answers|form)|read back/, () => readBack(), "read my answers"],
        [/answer skipped|skipped fields/, () => router.push(`/fill/${formId}?only=skipped`), "answer skipped"],
        [/^(continue|looks good|done|finish)/, () => continueToComplete(), "continue"],
      ],
    },
    [record?.id, skippedCount, reading],
  );

  useEffect(() => {
    getForm(formId).then((form) => {
      if (!form) {
        setTone("error");
        setStatus("I could not find this form.");
        return;
      }
      setRecord(form);
      const skipped = form.fields.filter((f) => f.status === "skipped" || f.status === "unclear").length;
      setStatus(
        skipped > 0
          ? `${skipped} field${skipped === 1 ? " was" : "s were"} skipped — answer them now or continue.`
          : "Everything is filled in. Check the answers, then continue.",
      );
    });
    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  async function saveEdit(field: FormField) {
    if (!record) return;
    const updated: FormRecord = {
      ...record,
      fields: record.fields.map((f) =>
        f.id === field.id
          ? { ...f, value: editValue.trim(), status: editValue.trim() ? ("answered" as const) : f.status }
          : f,
      ),
    };
    setRecord(updated);
    setEditingId(null);
    await saveForm(updated);
    setTone("success");
    setStatus(`Updated ${field.label}.`);
  }

  async function readBack() {
    if (!record || reading) {
      cancelSpeech();
      setReading(false);
      return;
    }
    setReading(true);
    for (const field of [...record.fields].sort((a, b) => a.order - b.order)) {
      const answer =
        field.status === "skipped" || field.status === "unclear" ? "skipped" : field.value || "blank";
      await speak(`${field.label}: ${answer}.`, { interrupt: false });
    }
    setReading(false);
  }

  async function continueToComplete() {
    if (!record) return;
    await saveForm({ ...record, status: "review" });
    router.push(`/complete/${formId}`);
  }

  function startEdit(field: FormField) {
    setEditingId(field.id);
    setEditValue(field.value || "");
  }

  const counts = record
    ? {
        answered: record.fields.filter((f) => f.status === "answered").length,
        autofilled: record.fields.filter((f) => f.status === "autofilled").length,
        skipped: record.fields.filter((f) => f.status === "skipped").length,
        unclear: record.fields.filter((f) => f.status === "unclear").length,
        pending: record.fields.filter((f) => f.status === "pending").length,
      }
    : { answered: 0, autofilled: 0, skipped: 0, unclear: 0, pending: 0 };

  const sortedFields = record ? [...record.fields].sort((a, b) => a.order - b.order) : [];

  return {
    formId,
    record,
    status,
    tone,
    editingId,
    editValue,
    setEditValue,
    startEdit,
    cancelEdit: () => setEditingId(null),
    saveEdit,
    readBack,
    reading,
    continueToComplete,
    skippedCount,
    counts,
    sortedFields,
    goSkipped: () => router.push(`/fill/${formId}?only=skipped`),
  };
}

export type ReviewScreen = ReturnType<typeof useReview>;
