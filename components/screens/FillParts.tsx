"use client";

/**
 * Shared presentational pieces for the fill screen — spelling bubbles, the
 * typed-answer form, and the fields-map list. Both platform bodies compose
 * these.
 */

import type { FillSession } from "./useFillSession";
import { IconCheck, IconAlertCircle } from "@/components/icons";

/** The dictated value shown character by character, so spelling is verifiable. */
export function SpellBubbles({ value }: { value: string }) {
  return (
    <div className="mt-1 flex max-w-md flex-wrap justify-center gap-1 font-mono text-xs font-bold" aria-hidden="true">
      {value
        .toUpperCase()
        .split("")
        .map((ch, i) => (
          <span
            key={i}
            className={ch === " " ? "w-2.5" : "rounded-lg border border-line bg-sunken px-1.5 py-0.5 text-ink shadow-sm"}
          >
            {ch === " " ? "" : ch}
          </span>
        ))}
    </div>
  );
}

/** Manual keyboard entry — text, choice select, or yes/no. */
export function TypedAnswerForm({ s }: { s: FillSession }) {
  const field = s.currentField;
  if (!field) return null;
  return (
    <form
      className="mt-2 flex w-full max-w-md flex-col gap-3.5 border-t border-line/60 pt-6 text-left animate-fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        s.saveTyped();
      }}
    >
      <label htmlFor="typed-answer" className="text-xs font-bold uppercase tracking-wider text-soft">
        Type your answer
      </label>
      {field.type === "choice" && field.options?.length ? (
        <select
          id="typed-answer"
          className="field-input min-h-12 text-sm font-semibold"
          value={s.typedValue}
          onChange={(e) => s.setTypedValue(e.target.value)}
        >
          <option value="">Choose an option…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <select
          id="typed-answer"
          className="field-input min-h-12 text-sm font-semibold"
          value={s.typedValue}
          onChange={(e) => s.setTypedValue(e.target.value)}
        >
          <option value="">Choose…</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <input
          id="typed-answer"
          className="field-input min-h-12 text-sm font-semibold"
          type="text"
          value={s.typedValue}
          onChange={(e) => s.setTypedValue(e.target.value)}
          placeholder={field.type === "date" ? "DD/MM/YYYY" : ""}
          autoFocus
        />
      )}

      <div className="mt-1 flex gap-2.5">
        <button type="submit" className="btn-primary min-h-12 flex-1 text-xs">
          Save answer
        </button>
        {s.sttSupported && (
          <button type="button" className="btn-secondary min-h-12 flex-1 text-xs" onClick={s.resume}>
            Use voice
          </button>
        )}
      </div>
    </form>
  );
}

/** Every field as a jump target, with completion state. */
export function FieldsMapList({ s, onJump }: { s: FillSession; onJump?: () => void }) {
  return (
    <>
      {s.record?.fields.map((f, i) => (
        <button
          key={f.id}
          type="button"
          onClick={() => {
            s.jumpToField(i);
            onJump?.();
          }}
          className={`flex w-full cursor-pointer items-center justify-between rounded-2xl border p-3.5 text-left text-xs transition-all hover:border-accent/40 ${
            f.id === s.currentId
              ? "border-accent bg-accent-soft font-extrabold text-accent"
              : f.status === "answered" || f.status === "autofilled"
              ? "border-line bg-sunken/60 text-soft"
              : "border-line bg-raised text-faint"
          }`}
        >
          <span className="max-w-[180px] truncate font-semibold">
            {i + 1}. {f.label}
          </span>
          {f.status === "answered" || f.status === "autofilled" ? (
            <IconCheck className="h-4 w-4 shrink-0 text-ok" aria-label="answered" />
          ) : f.status === "skipped" ? (
            <IconAlertCircle className="h-4 w-4 shrink-0 text-warn" aria-label="skipped" />
          ) : null}
        </button>
      ))}
    </>
  );
}
