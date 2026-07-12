/**
 * llm.ts — client wrapper for the Groq-backed LLM (via /api/chat).
 *
 * Two jobs:
 *  1. interpretCommand() — turn a free-form spoken sentence into one of the
 *     app's known intents when the fast regex commands don't match. This is
 *     what makes voice control feel intelligent ("take me back and fix my
 *     email", "what's left to do").
 *  2. assist() — answer an in-form question aloud ("what do I put here?",
 *     "what does this field mean?").
 *
 * The LLM is always a *fallback / enhancement*: the app stays fully usable
 * without it, and every call fails soft.
 */
import { getGroqKey } from "./groqSTT";

let available: boolean | null = null;

const LANG_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ml: "Malayalam",
  fr: "French",
};

/** Human name of a BCP-47-ish tag ("ml-IN" -> "Malayalam") for prompts. */
export function langName(lang?: string): string {
  return LANG_NAMES[(lang || "en").split("-")[0].toLowerCase()] || "English";
}

/** One-time probe: is a server (or local) key configured? */
export async function probeLlmAvailability(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (getGroqKey()) { available = true; return true; }
  if (available !== null) return available;
  try {
    const res = await fetch("/api/chat", { method: "GET" });
    const data = (await res.json()) as { available?: boolean };
    available = Boolean(data.available);
  } catch {
    available = false;
  }
  return available;
}

export function isLlmAvailable(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return available === true || Boolean(getGroqKey());
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number; fast?: boolean } = {},
): Promise<string | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const localKey = getGroqKey();
  if (localKey) headers["x-groq-key"] = localKey;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, ...opts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return data.text ?? null;
  } catch {
    return null;
  }
}

/** Chat and parse the reply as JSON. Returns null on any failure. */
export async function chatJson<T = unknown>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T | null> {
  const raw = await chat(messages, { json: true, temperature: 0, ...opts });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ------------------------ field-aware correction ----------------------- */

/**
 * The "smart lane" of adaptive STT: given a raw Whisper transcript of one spoken
 * answer plus what field it's for, fix likely mishearings toward a plausible
 * value — the fix for "it can't get Indian names / addresses". Uses the small
 * fast model (~150ms) so accuracy costs almost no speed, and is deliberately
 * conservative: digits are never altered, nothing is invented, and on any doubt
 * the original is returned unchanged. Commands, yes/no and choices skip this
 * (the "fast lane") — callers only invoke it for free-text name/address fields.
 */
export async function correctTranscript(
  raw: string,
  field: { label: string; kind: string; help?: string },
  lang = "en-IN",
): Promise<string> {
  const cleaned = raw.trim();
  if (!isLlmAvailable() || cleaned.length < 2) return cleaned;
  const sys =
    `You clean up ONE speech-to-text answer a user spoke while filling a form. ` +
    `Reply with ONLY the corrected value — no quotes, no explanation.\n` +
    `Rules:\n` +
    `- The language is ${langName(lang)} with Indian context (Indian names, towns, addresses).\n` +
    `- Fix obvious mishearings toward a plausible value for this field.\n` +
    `- NEVER change, add, or drop digits. Keep every number exactly as spoken.\n` +
    `- Do not invent words that weren't said. If it already looks right, return it unchanged.\n` +
    `- Proper-case names and places. Keep it concise.`;
  const user =
    `Field: "${field.label}" (type: ${field.kind}).` +
    (field.help ? ` Hint: ${field.help}.` : "") +
    `\nHeard: "${cleaned}"\nCorrected value:`;
  const out = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { temperature: 0, maxTokens: 60, fast: true },
  );
  const result = (out || "").trim().replace(/^["']+|["']+$/g, "");
  // Guard against a rambling or empty reply — fall back to the original.
  if (!result || result.length > cleaned.length * 3 + 24) return cleaned;
  return result;
}

/* --------------------------- command intents --------------------------- */

export type CommandIntent =
  | { action: "navigate"; target: "home" | "upload" | "scan" | "history" | "profile" }
  | { action: "read_page" }
  | { action: "stop" }
  | { action: "help" }
  | { action: "start_filling" }
  | { action: "review" }
  | { action: "repeat" }
  | { action: "skip" }
  | { action: "go_back" }
  | { action: "type_instead" }
  | { action: "answer"; value: string }
  | { action: "chat"; reply: string }
  | { action: "none" };

const INTENT_SYSTEM = `You are the brain of Swaram, a warm voice-first form-filling assistant for blind and low-vision users in India.
Understand the user's spoken sentence — however they phrase it — and map it to ONE action. Reply ONLY with JSON: {"action": "...", ...fields}.

Actions:
- navigate: go to a screen. Add "target": one of "home","upload","scan","history","profile". (It is fine to target the screen they're already on — the app handles that gracefully.)
- start_filling: begin filling the current form.
- review: review answers / go to review.
- read_page: read the current screen aloud.
- repeat: repeat the last thing said or the current question.
- skip: skip the current question/field.
- go_back: go to the previous question or screen.
- type_instead: switch to typing.
- stop: stop talking / be quiet.
- help: list what the user can say.
- answer: the user is giving an answer to the current question. Add "value": the cleaned answer text.
- chat: ANY other question or remark — about the form, the app, or general knowledge. Add "reply": a genuinely helpful spoken answer (1-2 sentences) that answers them, then gently steers back to filling forms (e.g. "…Shall we carry on with your form?").
- none: only for pure noise with no meaning.

Always prefer a concrete action when the sentence clearly asks for one; otherwise use "chat" and actually respond — never leave the user without a reply. Only use "answer" when the context says a question is awaiting an answer.
The "reply" text MUST be written in {{LANG}} (the user's language).`;

/**
 * Interpret a free-form command. Returns { action: "none" } if the LLM is
 * unavailable or unsure — callers should have already tried fast regex paths.
 */
export async function interpretCommand(
  transcript: string,
  context: { page: string; pageLabel?: string; awaitingAnswer?: boolean; currentQuestion?: string; lang?: string },
): Promise<CommandIntent> {
  if (!isLlmAvailable() || !transcript.trim()) return { action: "none" };
  const ctx =
    `Current screen: ${context.pageLabel || context.page}.` +
    (context.awaitingAnswer ? ` A question is awaiting an answer: "${context.currentQuestion ?? ""}".` : "");
  const raw = await chat(
    [
      { role: "system", content: INTENT_SYSTEM.replace("{{LANG}}", langName(context.lang)) },
      { role: "user", content: `${ctx}\n\nUser said: "${transcript}"` },
    ],
    { json: true, temperature: 0, maxTokens: 200 },
  );
  if (!raw) return { action: "none" };
  try {
    const parsed = JSON.parse(raw) as CommandIntent;
    return parsed && typeof parsed.action === "string" ? parsed : { action: "none" };
  } catch {
    return { action: "none" };
  }
}

/* ------------------------------- assist -------------------------------- */

/**
 * Answer an in-form question aloud, e.g. "what should I write here?".
 * Returns a short plain-text answer, or null if unavailable.
 */
export async function assist(
  question: string,
  context: { fieldLabel?: string; formName?: string; lang?: string },
): Promise<string | null> {
  if (!isLlmAvailable()) return null;
  const sys = `You are Swaram, a warm, concise voice assistant helping a blind user fill a form.
Answer in 1-2 short spoken sentences, written in ${langName(context.lang)}. Never ask for sensitive ID numbers to be spoken aloud. If unsure, say so briefly.`;
  const ctx =
    (context.formName ? `Form: ${context.formName}. ` : "") +
    (context.fieldLabel ? `Current field: "${context.fieldLabel}". ` : "");
  return chat(
    [
      { role: "system", content: sys },
      { role: "user", content: `${ctx}\n\nUser asked: "${question}"` },
    ],
    { temperature: 0.3, maxTokens: 160 },
  );
}
