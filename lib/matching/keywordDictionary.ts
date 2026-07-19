/**
 * Starter dictionary of common Indian form fields. Used two ways:
 *  1. During analysis, OCR'd label text is matched against synonyms to get a
 *     clean spoken label + field type.
 *  2. During auto-fill, entries with a profileKey link detected fields to
 *     saved profile values.
 *
 * Entries marked `sensitive` (Aadhaar and other government IDs) are NEVER
 * saved to a profile — their values only ever land in the local PDF output.
 */
import type { FieldType } from "../types";

export interface DictEntry {
  key: string;
  /** Clean label used for speech, e.g. "Full Name". */
  label: string;
  type: FieldType;
  /** Profile storage key; absent means "never auto-fill / never save". */
  profileKey?: string;
  sensitive?: boolean;
  options?: string[];
  synonyms: string[];
}

import { EXTENDED_DICTIONARY } from "./dictionaryData";

export const DICTIONARY: DictEntry[] = EXTENDED_DICTIONARY;

export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, "") // father's -> fathers, so possessives match
    .replace(/[^a-z0-9]+/g, " ") // slashes, colons, brackets, dashes -> space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Labels that must never become spoken questions: they need a pen, a photo,
 * or are boilerplate — not a voice answer.
 */
const NON_FILLABLE = [
  /\bsignature\b/,
  /\bsign here\b/,
  /^sign$/,
  /\baffix\b/,
  /\bpassport size\b/,
  /\bphotograph\b/,
  /^photo$/,
  /\bfor office use\b/,
  /\boffice use only\b/,
  /\bregistration no\b/,
  /\bdate received\b/,
  /\bdeclaration\b/,
  /\binstructions?\b/,
  /\bone letter per box\b/,
  /\bleave .*blank\b/,
  /\bdo not use initials\b/,
  /\bdo not staple\b/,
  /\blast date for submission\b/,
  /\bthumb impression\b/,
  /\bseal\b/,
  /\battested?\b/,
];

export function isNonFillableLabel(text: string): boolean {
  const normalized = normalizeLabel(text);
  if (!normalized) return true;
  return NON_FILLABLE.some((pattern) => pattern.test(normalized));
}

/**
 * Find the best dictionary entry contained in (or equal to) the given label
 * text. Prefers longer synonym matches ("father's name" beats "name").
 */
export function matchLabel(text: string): DictEntry | null {
  const normalized = normalizeLabel(text);
  if (!normalized) return null;
  let best: DictEntry | null = null;
  let bestLen = 0;
  for (const entry of DICTIONARY) {
    for (const syn of entry.synonyms) {
      const normSyn = normalizeLabel(syn);
      if (normSyn.length <= bestLen) continue;
      if (
        normalized === normSyn ||
        new RegExp(`(^|\\s)${normSyn.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}($|\\s|:)`).test(normalized)
      ) {
        best = entry;
        bestLen = normSyn.length;
      }
    }
  }
  return best;
}
