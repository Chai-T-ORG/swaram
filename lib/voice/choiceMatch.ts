/**
 * choiceMatch.ts — matching a spoken answer to one of a field's fixed options.
 *
 * The answer to a choice field is a CLOSED vocabulary, so we can be far more
 * forgiving than free text: exact/substring, then a phonetic (Soundex) pass so
 * homophones like "mail" map to "Male", then a one-edit fuzzy pass. A spoken
 * option NUMBER ("say two") is a separate escape hatch a homophone can't block.
 */
import { editDistance } from "./transcriptFormat";

/** Soundex code — collapses homophones to the same key ("male"/"mail" -> M400). */
export function soundex(str: string): string {
  const a = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (!a) return "";
  const code = (c: string): number =>
    (({ B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 } as Record<string, number>)[c] ?? 0);
  let result = a[0];
  let prev = code(a[0]);
  for (let i = 1; i < a.length && result.length < 4; i++) {
    const d = code(a[i]);
    if (d !== 0 && d !== prev) result += d;
    if (a[i] !== "H" && a[i] !== "W") prev = d; // vowels reset; H/W don't
  }
  return (result + "000").slice(0, 4);
}

/** Match a transcript to one option, or null. Forgiving on a closed set. */
export function matchOption(transcript: string, options: string[]): string | null {
  const heard = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!heard) return null;
  for (const option of options) {
    if (option.toLowerCase() === heard) return option;
  }
  for (const option of options) {
    const o = option.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (heard.includes(o) || o.includes(heard)) return option;
  }
  const squashed = heard.replace(/\s+/g, "");
  for (const option of options) {
    const o = option.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (o === squashed) return option;
  }
  // Phonetic: a homophone ("mail" for "Male") shares a Soundex code.
  const heardSx = soundex(squashed);
  if (heardSx) {
    for (const option of options) {
      if (soundex(option.replace(/[^a-z0-9]/gi, "")) === heardSx) return option;
    }
  }
  // Fuzzy last resort: a one-edit mishearing of a single-word option.
  for (const option of options) {
    const o = option.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (o.length >= 3 && editDistance(squashed, o) <= 1) return option;
  }
  return null;
}

const OPTION_NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

/** "say two" / "number 2" / "the third one" -> zero-based option index, or null. */
export function parseOptionNumber(transcript: string, count: number): number | null {
  const t = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  let n: number | null = null;
  const digit = t.match(/\b(\d{1,2})\b/);
  if (digit) n = Number(digit[1]);
  if (n === null) {
    for (const [w, v] of Object.entries(OPTION_NUMBER_WORDS)) {
      if (new RegExp(`\\b${w}\\b`).test(t)) { n = v; break; }
    }
  }
  return n !== null && n >= 1 && n <= count ? n - 1 : null;
}
