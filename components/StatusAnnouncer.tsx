"use client";

/**
 * Visible status text that is also announced by screen readers.
 * Every page keeps exactly one of these for its primary status.
 */
export default function StatusAnnouncer({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "success" | "warning" | "error";
}) {
  const toneClasses = {
    info: "bg-accent-soft text-ink",
    success: "bg-ok-soft text-ink",
    warning: "bg-warn-soft text-ink",
    error: "bg-bad-soft text-ink",
  }[tone];
  const srPrefix = { info: "", success: "Done. ", warning: "Note. ", error: "Problem. " }[tone];

  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-11 w-full rounded-2xl px-5 py-3.5 text-[0.95rem] font-medium leading-relaxed ${toneClasses}`}
    >
      <span className="sr-only">{srPrefix}</span>
      {message}
    </p>
  );
}
