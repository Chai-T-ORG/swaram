"use client";

/**
 * Inline editor for one review-screen field — text input, choice select, or
 * yes/no for checkboxes. Shared by both platform review bodies.
 */

import type { FormField } from "@/lib/types";
import type { ReviewScreen } from "@/components/screens/useReview";

export default function FieldEditForm({ r, field }: { r: ReviewScreen; field: FormField }) {
  return (
    <form
      className="mt-3.5 flex flex-wrap gap-2.5 animate-fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        r.saveEdit(field);
      }}
    >
      <label htmlFor={`edit-${field.id}`} className="sr-only">
        New value for {field.label}
      </label>
      {field.type === "choice" && field.options?.length ? (
        <select
          id={`edit-${field.id}`}
          className="field-input min-h-12 max-w-xs text-sm"
          value={r.editValue}
          onChange={(e) => r.setEditValue(e.target.value)}
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
          className="field-input min-h-12 max-w-xs text-sm"
          value={r.editValue}
          onChange={(e) => r.setEditValue(e.target.value)}
        >
          <option value="">Choose…</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <input
          id={`edit-${field.id}`}
          className="field-input min-h-12 max-w-xs text-sm"
          value={r.editValue}
          onChange={(e) => r.setEditValue(e.target.value)}
          autoFocus
        />
      )}
      <button type="submit" className="btn-primary min-h-12 px-5 text-xs">
        Save
      </button>
      <button type="button" className="btn-secondary min-h-12 px-4 text-xs" onClick={r.cancelEdit}>
        Cancel
      </button>
    </form>
  );
}
