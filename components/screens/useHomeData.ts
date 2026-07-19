"use client";

import useSWR from "swr";
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
export function formProgress(form: FormRecord): number {
  if (!form.fields.length) return 0;
  const done = form.fields.filter((f) => f.status === "answered" || f.status === "autofilled").length;
  return Math.round((done / form.fields.length) * 100);
}

export function formatFormDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function useHomeData() {
  const { data: forms = [] } = useSWR("local_forms_list", () => listForms(), {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  const recent = forms.slice(0, 3);
  const activeForm = forms.find((f) => f.status === "filling" || f.status === "processing") || null;

  return { recent, activeForm };
}
