"use client";

import useSWR from "swr";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { listForms } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";

/** Where "open this form" should land, given how far the form has come. */
export function routeForForm(form: FormRecord): string {
  switch (form.status) {
    case "processing":
      return `/processing/${form.id}`;
    case "review":
      return `/review/${form.id}`;
    case "complete":
      return `/complete/${form.id}`;
    default:
      return `/fill/${form.id}`;
  }
}

/** Answered share of a form, 0-100. */
export function formProgress(f: any): number {
  if (!f || !f.fields || f.fields.length === 0) return 0;
  const done = f.fields.filter((field: any) => field.status === "answered" || field.status === "autofilled").length;
  return Math.round((done / f.fields.length) * 100);
}

export function formatFormDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function useHomeData() {
  // The landing screen must speak for a blind user, not just render. (This was
  // the one screen with no page announcement.)
  useVoicePage({
    title: "Swaram home",
    hint: "Say scan to photograph a paper form, upload to choose a file, my forms to continue one, or profile for settings.",
    description:
      "Swaram home screen. You can say: scan a form, upload a file, my forms, or profile.",
  });

  const { data: forms = [] } = useSWR("local_forms_list", () => listForms(), {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  const recent = forms.slice(0, 3);
  const activeForm = forms.find((f) => f.status === "filling" || f.status === "processing") || null;

  return { recent, activeForm };
}
