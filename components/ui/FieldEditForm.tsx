"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { FormField } from "@/lib/types";
import type { ReviewScreen } from "@/components/screens/useReview";
import { describeTable } from "@/lib/analysis/tableCells";

export default function FieldEditForm({ r, field }: { r: ReviewScreen; field: FormField }) {
  const prefersReducedMotion = useReducedMotion();

  // Tables are edited cell-by-cell during voice filling, not via a single text
  // box (that would clobber the JSON grid). Show a read-only summary instead.
  if (field.type === "table") {
    return (
      <motion.div
        initial={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
        animate={prefersReducedMotion ? {} : { height: "auto", opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        style={{ overflow: "hidden" }}
        className="mt-3.5 flex flex-col gap-2.5"
      >
        <p className="text-sm text-soft">{describeTable(field) || "No rows filled yet."}</p>
        <p className="text-xs text-faint">
          Table rows are filled by voice, one cell at a time. Re-run filling to change them.
        </p>
        <button type="button" className="btn-secondary min-h-12 max-w-max px-4 text-xs" onClick={r.cancelEdit}>
          Close
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
      animate={prefersReducedMotion ? {} : { height: "auto", opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={{ overflow: "hidden" }}
      className="mt-3.5 flex flex-wrap gap-2.5"
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
    </motion.form>
  );
}
