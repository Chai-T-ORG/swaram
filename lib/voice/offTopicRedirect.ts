/**
 * offTopicRedirect.ts — Polite, context-aware redirect messages.
 *
 * When the user says something off-topic during a fill session (or globally),
 * generate a brief, friendly spoken response that steers them back.
 */

export interface RedirectOptions {
  /** What the user said (for personalized response). */
  transcript: string;
  /** Brief topic label from classifier. */
  topic?: string;
  /** Whether we're in fill mode. */
  inFillMode: boolean;
  /** Current form name. */
  formName?: string;
  /** Current field label. */
  currentFieldLabel?: string;
  /** User's language. */
  lang?: string;
}

// ── Fill-mode redirects ──────────────────────────────────────────────

const FILL_REDIRECTS = [
  "Let's get back to filling the form. {fieldReminder}",
  "Right now let's focus on your {fieldName}. {fieldReminder}",
  "I hear you, but let's continue with the form. {fieldReminder}",
  "Let's keep going — you were on {fieldName}. {fieldReminder}",
];

const GREETING_REDIRECTS_FILL = [
  "Hello! Let's continue filling your {formName}. {fieldReminder}",
  "Hi there! Let's get back to your form. {fieldReminder}",
];

const GREETING_REDIRECTS_GLOBAL = [
  "Hello! I'm Swaram, your form-filling assistant. Say upload to start a form, or scan to capture a paper form.",
  "Hi! I can help you fill forms by voice. Say upload or scan to get started.",
];

const QUESTION_REDIRECTS_FILL = [
  "Good question — let me help with that after we finish this field. {fieldReminder}",
  "I'll help with that in a moment. First, let's complete {fieldName}. {fieldReminder}",
];

const GLOBAL_REDIRECTS = [
  "I'm Swaram, your form-filling assistant. I can help you fill forms by voice. Say upload to start, or scan a paper form.",
  "I'm here to help with forms. Say help to see what you can do.",
];

// ── Helpers ──────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fieldReminder(label?: string): string {
  if (!label) return "Say your answer, or say skip.";
  return `What is your ${label}? Say your answer, or say skip.`;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Generate a polite redirect response. Returns the spoken text.
 */
export function offTopicRedirect(options: RedirectOptions): string {
  const {
    topic,
    inFillMode,
    formName,
    currentFieldLabel,
  } = options;

  if (inFillMode) {
    // Greeting during fill
    if (topic === "greeting") {
      const template = pick(GREETING_REDIRECTS_FILL);
      return template
        .replace("{formName}", formName ?? "form")
        .replace("{fieldReminder}", fieldReminder(currentFieldLabel));
    }

    // Question during fill
    if (topic === "question") {
      const template = pick(QUESTION_REDIRECTS_FILL);
      return template
        .replace("{fieldName}", currentFieldLabel ?? "this field")
        .replace("{fieldReminder}", fieldReminder(currentFieldLabel));
    }

    // General off-topic during fill
    const template = pick(FILL_REDIRECTS);
    return template
      .replace("{fieldName}", currentFieldLabel ?? "this field")
      .replace("{fieldReminder}", fieldReminder(currentFieldLabel));
  }

  // Not in fill mode
  if (topic === "greeting") {
    return pick(GREETING_REDIRECTS_GLOBAL);
  }

  return pick(GLOBAL_REDIRECTS);
}
