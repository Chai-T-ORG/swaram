/**
 * noiseFilter.ts — Regex-only hallucination / silence / garbage detector.
 *
 * Runs BEFORE normalization on every raw STT transcript. Zero LLM calls,
 * pure regex patterns. Designed to drop Whisper/Google/WebKit artifacts
 * that would otherwise waste a listener cycle or confuse the intent
 * classifier downstream.
 */

export interface NoiseCheckResult {
  isNoise: boolean;
  reason?: string;
}

// ── Silence / bracket markers ────────────────────────────────────────
const SILENCE_RE = /^\[?(?:silence|noise|background noise|no speech|静寂|無音)\]?\s*$/i;
const BRACKETED_EMPTY_RE = /^\[[\s.,;:!?…]*\]$/;

// ── Known Whisper hallucination phrases ──────────────────────────────
const HALLUCINATIONS = [
  "thank you for watching",
  "thanks for watching",
  "thank you for watching this video",
  "thanks for watching this video",
  "thank you for watching this",
  "subscribe",
  "please subscribe",
  "thank you",
  "thanks",
  "bye",
  "goodbye",
  "see you",
  "see you next time",
  "see you later",
  "subtitles by",
  "subtitles",
  "captions by",
  "transcript by",
  // Hindi / multi-script hallucinations
  "धन्यवाद",
  "शुक्रिया",
  "अलविदा",
  "നന്ദി",
  "വിട",
  "au revoir",
  "merci",
];

// ── Single-word fillers / disfluencies ───────────────────────────────
const FILLER_RE = /^(?:uh+|um+|hmm+|hm+|ah+|eh+|mm+|mhm+|erm+)$/i;

// ── Single-char or 2-char garbage ────────────────────────────────────
// Allow "I" (English first-person pronoun) and Hindi "मैं" as valid.

// ── All-punctuation / symbol garbage ─────────────────────────────────
const PUNCT_RE = /^[^\w\u0900-\u097F\u0D00-\u0D7F]+$/u;

// ── Repeated single word: "hello hello hello" ───────────────────────
const REPEATED_WORD_RE = /^(\S+)(\s+\1){2,}$/i;

// ── Single repeated character: "aaaa", "mmmm" ───────────────────────
const REPEATED_CHAR_RE = /^(.)\1{3,}$/;

// ── Excessive same-word repetition (3+) in a short utterance ────────
function hasExcessiveRepetition(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 3) return false;
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
    if (freq.get(w)! >= 3) return true;
  }
  return false;
}

/**
 * Check if a raw transcript is noise / hallucination.
 *
 * This is intentionally aggressive — dropping a valid 1–2 word answer is
 * cheap (the user can just say it again) while passing noise through wastes
 * an LLM call or confuses the fill loop.
 */
export function detectNoise(raw: string): NoiseCheckResult {
  const trimmed = raw.trim();
  if (!trimmed) return { isNoise: true, reason: "empty" };

  // Bracketed silence / noise markers
  if (SILENCE_RE.test(trimmed)) return { isNoise: true, reason: "silence" };
  if (BRACKETED_EMPTY_RE.test(trimmed)) return { isNoise: true, reason: "silence" };

  // Exact hallucination phrase match (case-insensitive, after stripping punctuation)
  const lower = trimmed.toLowerCase().replace(/[.,!?;:'"…]+$/g, "").trim();
  if (HALLUCINATIONS.includes(lower)) return { isNoise: true, reason: "hallucination" };

  // Filler words when spoken alone
  if (FILLER_RE.test(lower)) return { isNoise: true, reason: "filler" };

  // All punctuation / symbols
  if (PUNCT_RE.test(trimmed)) return { isNoise: true, reason: "garbage" };

  // Repeated single word: "hello hello hello"
  if (REPEATED_WORD_RE.test(trimmed)) return { isNoise: true, reason: "repetition" };

  // Repeated single character: "aaaa"
  if (REPEATED_CHAR_RE.test(trimmed)) return { isNoise: true, reason: "repetition" };

  // Excessive same-word repetition
  if (hasExcessiveRepetition(trimmed)) return { isNoise: true, reason: "repetition" };

  return { isNoise: false };
}
