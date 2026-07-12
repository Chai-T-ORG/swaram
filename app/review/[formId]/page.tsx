"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
import { getForm, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormField, FormRecord } from "@/lib/types";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";
import { motion } from "framer-motion";
import {
  IconArrowLeft,
  IconArrowRight,
  IconEdit,
  IconWave,
  IconPause,
  IconCheck,
  IconAlertCircle,
  IconPlay,
  IconRepeat
} from "@/components/icons";

export default function ReviewPage() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<FormRecord | null>(null);
  const [status, setStatus] = useState("Loading your answers…");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
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
  }, [formId]);

  if (!record) {
    return (
      <div className="mx-auto max-w-2xl py-12 flex justify-center text-soft font-semibold animate-pulse">
        Loading answers logs…
      </div>
    );
  }

  const answered = record.fields.filter((f) => f.status === "answered").length;
  const autofilled = record.fields.filter((f) => f.status === "autofilled").length;
  const skipped = record.fields.filter((f) => f.status === "skipped").length;
  const unclear = record.fields.filter((f) => f.status === "unclear").length;
  const pending = record.fields.filter((f) => f.status === "pending").length;

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 animate-fade-in pb-16">
      <nav aria-label="Breadcrumb">
        <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <IconArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </nav>

      <header className="border-b border-line pb-3">
        <p className="eyebrow mb-1">Step 4 of 4 — Review &amp; export</p>
        <h1 className="font-display text-2xl font-black text-ink">Review your answers</h1>
      </header>

      <StatusAnnouncer message={status} tone={tone} />

      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4" aria-label="Answer summary">
        <SummaryTile label="Answered" value={answered} className="bg-ok-soft text-ok border-emerald-100" />
        <SummaryTile label="Auto-filled" value={autofilled} className="bg-accent-soft text-accent border-teal-100" />
        <SummaryTile label="Skipped" value={skipped + pending} className="bg-warn-soft text-warn border-amber-100" />
        <SummaryTile label="Unclear" value={unclear} className="bg-surface text-soft border-line" />
      </section>

      <div className="flex flex-wrap gap-2.5">
        {skipped + unclear + pending > 0 && (
          <Link href={`/fill/${formId}?only=skipped`} className="btn-primary min-h-10 px-5 text-xs shadow-sm hover:scale-[1.01]">
            Answer skipped fields
            <IconArrowRight className="h-4 w-4" />
          </Link>
        )}
        <button type="button" className="btn-secondary min-h-10 px-5 text-xs font-semibold" onClick={readBack}>
          {reading ? <IconPause className="h-4 w-4" /> : <IconWave className="h-4 w-4" />}
          {reading ? "Stop reading" : "Read answers aloud"}
        </button>
      </div>

      <ul className="flex flex-col gap-3.5 list-none p-0" aria-label="All fields">
        {[...record.fields]
          .sort((a, b) => a.order - b.order)
          .map((field, index) => (
            <motion.li
              key={field.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className="card p-4.5 border-line bg-raised hover:shadow-sm transition-all duration-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-faint uppercase tracking-wide">
                    {index + 1}. {field.label}
                  </p>
                  
                  {editingId === field.id ? (
                    <form
                      className="mt-3.5 flex flex-wrap gap-2.5 animate-fade-in"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit(field);
                      }}
                    >
                      <label htmlFor={`edit-${field.id}`} className="sr-only">
                        New value for {field.label}
                      </label>
                      {field.type === "choice" && field.options?.length ? (
                        <select
                          id={`edit-${field.id}`}
                          className="field-input max-w-xs min-h-10 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <select
                          id={`edit-${field.id}`}
                          className="field-input max-w-xs min-h-10 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        >
                          <option value="">Choose…</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      ) : (
                        <input
                          id={`edit-${field.id}`}
                          className="field-input max-w-xs min-h-10 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                        />
                      )}
                      <button type="submit" className="btn-primary min-h-10 px-5 text-xs shadow-sm">
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-secondary min-h-10 px-4 text-xs font-semibold"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm font-bold text-ink leading-normal">
                      {field.status === "skipped" || field.status === "unclear" ? (
                        <span className="inline-flex items-center gap-1 text-warn font-semibold">
                          <IconAlertCircle className="h-4 w-4" />
                          Skipped
                        </span>
                      ) : (
                        field.value || <span className="text-faint font-normal italic">Blank</span>
                      )}
                    </p>
                  )}
                </div>

                {editingId !== field.id && (
                  <button
                    type="button"
                    className="btn-secondary min-h-9 px-3.5 text-xs font-semibold shrink-0"
                    onClick={() => {
                      setEditingId(field.id);
                      setEditValue(field.value || "");
                    }}
                    aria-label={`Edit ${field.label}`}
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
            </motion.li>
          ))}
      </ul>

      <div className="flex justify-center border-t border-line/65 pt-6 mt-4">
        <button
          type="button"
          className="btn-primary min-h-11 px-10 text-sm shadow-md shadow-accent/15"
          onClick={continueToComplete}
        >
          Looks good &mdash; Finish
          <IconCheck className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`card p-4 text-center border bg-raised flex flex-col items-center justify-center ${className}`}>
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider mt-2 leading-none opacity-85">{label}</p>
    </div>
  );
}
