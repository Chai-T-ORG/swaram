"use client";

/**
 * My Forms (history) screen logic — list, filter, delete, download-filled,
 * and the per-form conversation log stored at localStorage["swaram_conv_"+id].
 */

import { useEffect, useState } from "react";
import { useVoicePage, type ConversationMessage } from "@/components/voice/VoiceProvider";
import { deleteForm, getFile, listForms } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";
import { routeForForm } from "./useHomeData";

export type HistoryFilter = "all" | "active" | "review" | "complete";
export type HistoryTone = "info" | "success" | "warning" | "error";

export function hasConvLog(formId: string): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem("swaram_conv_" + formId);
}

export function readConvLog(formId: string): ConversationMessage[] | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("swaram_conv_" + formId);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as ConversationMessage[];
  } catch {
    return null;
  }
}

export function useHistory() {
  const [forms, setForms] = useState<FormRecord[] | null>(null);
  const [status, setStatus] = useState("Your forms are stored only on this device.");
  const [tone, setTone] = useState<HistoryTone>("info");
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useVoicePage(
    {
      title: "My forms",
      hint:
        forms && forms.length > 0
          ? `You have ${forms.length} form${forms.length === 1 ? "" : "s"}. Say open the latest to continue it.`
          : "You have no forms yet. Say upload or scan to start one.",
      description:
        forms && forms.length > 0
          ? `My forms page. ${forms.map((f, i) => `${i + 1}: ${f.name}`).slice(0, 5).join(". ")}.`
          : "My forms page. It is empty.",
      commands: [
        [
          /open( the)? (latest|first|last)( form)?|continue/,
          () => {
            if (forms && forms[0]) window.location.href = routeForForm(forms[0]);
          },
          "open the latest",
        ],
      ],
    },
    [forms?.length],
  );

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      setForms(await listForms());
    } catch {
      setForms([]);
      setTone("error");
      setStatus("Could not read your form history.");
    }
  }

  async function remove(form: FormRecord) {
    if (!window.confirm(`Delete “${form.name}” and its files from this device?`)) return;
    await deleteForm(form.id);
    localStorage.removeItem("swaram_conv_" + form.id);
    setTone("success");
    setStatus(`Deleted ${form.name}.`);
    refresh();
  }

  async function downloadFilled(form: FormRecord) {
    const blob = await getFile(form.id, "filled");
    if (!blob) {
      setTone("warning");
      setStatus("This form does not have a filled PDF yet.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = form.name.replace(/\.(pdf|jpe?g|png)$/i, "") + " - filled.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleExpandLog = (formId: string) => {
    setExpandedFormId((prev) => (prev === formId ? null : formId));
  };

  const filtered = (forms ?? []).filter((form) => {
    const matchesSearch = form.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "active")
      return form.status === "filling" || form.status === "ready" || form.status === "processing";
    if (activeFilter === "review") return form.status === "review";
    if (activeFilter === "complete") return form.status === "complete";
    return true;
  });

  const totalCount = forms?.length ?? 0;
  const completedCount = forms?.filter((f) => f.status === "complete").length ?? 0;
  const inProgressCount = forms?.filter((f) => f.status === "filling" || f.status === "ready").length ?? 0;

  return {
    forms,
    filtered,
    status,
    tone,
    expandedFormId,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    remove,
    downloadFilled,
    toggleExpandLog,
    totalCount,
    completedCount,
    inProgressCount,
  };
}

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "review", label: "In review" },
  { id: "complete", label: "Completed" },
];
