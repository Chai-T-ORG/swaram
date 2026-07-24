/**
 * intentClassifier.ts — Local-first intent classification for voice transcripts.
 *
 * Classifies transcripts into: command | answer | off_topic | noise | unknown
 * using a tiered approach:
 *   Tier 1: parseFillCommand() regex → instant "command"
 *   Tier 1b: intlKeywords → instant "command" (multilingual)
 *   Tier 2: context check → plausible "answer" or "off_topic"
 *   Tier 3: fallback → "unknown" (caller routes to LLM)
 *
 * Zero LLM calls for tiers 1–2. LLM only used for "unknown" by the caller.
 */

import type { FillCommand } from "./fillCommands";
import { parseFillCommand } from "./fillCommands";
import { containsKeyword, INTL_KEYWORDS, type IntlIntent } from "./intlCommands";
import { detectNoise } from "./noiseFilter";

// ── Types ────────────────────────────────────────────────────────────

export type IntentType = "command" | "answer" | "off_topic" | "noise" | "unknown";

export interface ClassifiedIntent {
  type: IntentType;
  /** If type === "command", the parsed command. */
  command?: FillCommand;
  /** If type === "answer", the cleaned value. */
  value?: string;
  /** If type === "off_topic", a brief label for what they said. */
  topic?: string;
  /** Confidence score 0–1 for local classification. */
  confidence: number;
  /** Whether this was resolved locally (no LLM call). */
  local: boolean;
}

export interface ClassifyContext {
  /** Current fill page phase. If undefined, not in fill mode. */
  phase?: string;
  /** Current field label (for context matching). */
  currentFieldLabel?: string;
  /** Current field type. */
  currentFieldType?: string;
  /** Current form name. */
  formName?: string;
  /** User's language. */
  lang?: string;
}

// ── Off-topic heuristic keywords ─────────────────────────────────────

/** Form-related keywords that might indicate a relevant but unclassifiable utterance. */
const FORM_KEYWORDS = [
  "form", "name", "address", "phone", "email", "date", "number",
  "submit", "fill", "field", "question", "answer",
  // Indian context
  "aadhaar", "aadhar", "pan", "pincode", "pin code", "ifsc", "bank",
  // Negations / confirmations
  "yes", "no", "correct", "wrong", "right",
];

/** Hindi / Malayalam / French form keywords */
const FORM_KEYWORDS_INTL = [
  "हाँ", "नहीं", "सही", "गलत", "नाम", "पता", "फ़ॉर्म",
  "അതെ", "അല്ല", "ശരി", "തെറ്റ്", "പേര്", "വിലാസം", "ഫോം",
  "oui", "non", "correct", "faux", "nom", "adresse", "formulaire",
];

/** Conversational patterns that indicate off-topic speech. */
const CONVERSATIONAL_RE = /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening)|namaste|namaskar|vanakkam|bonjour|salut|hey there)\b/i;

/** Question starters that are off-topic in a fill context. */
const OFFTOPIC_QUESTION_RE = /^(?:what|how|why|when|where|who|which|can you|could you|tell me|explain|do you|are you|is there)\b/i;

/** Random topics that indicate off-topic speech. */
const OFFTOPIC_TOPICS_RE = /\b(?:weather|joke|music|song|movie|cricket|football|soccer|news|stock|crypto|bitcoin|recipe|cook|dance|sing|play|game|video|youtube|netflix)\b/i;

// ── Main classifier ──────────────────────────────────────────────────

/**
 * Classify a transcript into an intent. Local-first, no LLM.
 *
 * Noise should already be filtered in speechToText.ts, but we check
 * defensively in case someone calls this directly.
 */
export function classifyIntent(
  transcript: string,
  context?: ClassifyContext,
): ClassifiedIntent {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { type: "noise", confidence: 1, local: true };
  }

  // ── Tier 0: Defensive noise check ───────────────────────────────
  const noise = detectNoise(trimmed);
  if (noise.isNoise) {
    return { type: "noise", confidence: 1, local: true };
  }

  // ── Tier 1: Local regex command detection ───────────────────────
  const cmd = parseFillCommand(trimmed);
  if (cmd) {
    return {
      type: "command",
      command: cmd,
      confidence: 1.0,
      local: true,
    };
  }

  // ── Tier 1b: Multilingual keyword detection ─────────────────────
  // These cover Hindi / Malayalam / French commands that the English
  // regexes in parseFillCommand() don't match.
  const intlCmds: [IntlIntent, FillCommand][] = [
    ["repeat", "repeat"], ["skip", "skip"], ["back", "back"],
    ["type", "type"], ["pause", "pause"], ["help", "help"], ["spell", "spell"],
  ];
  for (const [intlIntent, fillCmd] of intlCmds) {
    if (containsKeyword(trimmed, INTL_KEYWORDS[intlIntent])) {
      return {
        type: "command",
        command: fillCmd,
        confidence: 0.95,
        local: true,
      };
    }
  }

  // ── Tier 2: Context-based classification ────────────────────────

  // If we're in fill mode with an active field, check if this looks
  // like a plausible answer or something off-topic.
  if (context?.phase === "listening" || context?.phase === "confirming") {
    // Plausible answer heuristic: anything that's not a command and
    // is in a listening/confirming phase is likely an answer.
    // The caller (fill page) will do deeper validation (plausibleAnswer).
    if (trimmed.length >= 1) {
      // But first, check if it's clearly off-topic
      const offTopic = detectOffTopic(trimmed, context);
      if (offTopic) {
        return offTopic;
      }

      // If not off-topic, assume it's an answer attempt
      return {
        type: "answer",
        value: trimmed,
        confidence: 0.8,
        local: true,
      };
    }
  }

  // ── Tier 2b: Not in fill mode — check for global commands vs off-topic ──
  if (!context?.phase || context.phase === "start" || context.phase === "done") {
    // Not in active fill flow. Off-topic detection applies.
    const offTopic = detectOffTopic(trimmed, context);
    if (offTopic) {
      return offTopic;
    }
  }

  // ── Tier 3: Unknown — caller routes to LLM ─────────────────────
  return {
    type: "unknown",
    confidence: 0,
    local: false,
  };
}

// ── Off-topic detection helpers ──────────────────────────────────────

function detectOffTopic(
  text: string,
  context?: ClassifyContext,
): ClassifiedIntent | null {
  const lower = text.toLowerCase().trim();

  // Greetings are always off-topic
  if (CONVERSATIONAL_RE.test(lower)) {
    return {
      type: "off_topic",
      topic: "greeting",
      confidence: 0.9,
      local: true,
    };
  }

  // Random topic keywords
  const topicMatch = OFFTOPIC_TOPICS_RE.exec(lower);
  if (topicMatch) {
    return {
      type: "off_topic",
      topic: topicMatch[0],
      confidence: 0.85,
      local: true,
    };
  }

  // Question patterns that don't relate to the current form
  if (OFFTOPIC_QUESTION_RE.test(lower)) {
    // If the question contains a form keyword, it might be a relevant question
    // about the form (e.g., "what is my name?" when filling a name field)
    if (context?.currentFieldLabel) {
      const fieldWords = context.currentFieldLabel.toLowerCase().split(/\s+/);
      const hasFieldRef = fieldWords.some(
        (w) => w.length > 2 && lower.includes(w),
      );
      if (hasFieldRef) {
        return null; // Not off-topic — user is asking about the current field
      }
    }

    // Check for form-related keywords in the question
    const allFormKw = [...FORM_KEYWORDS, ...FORM_KEYWORDS_INTL];
    const hasFormKeyword = allFormKw.some((kw) => lower.includes(kw));
    if (hasFormKeyword) {
      return null; // Not off-topic — user is asking about a form concept
    }

    return {
      type: "off_topic",
      topic: "question",
      confidence: 0.75,
      local: true,
    };
  }

  return null;
}
