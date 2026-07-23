/**
 * Personal name dictionary — names the user has already confirmed (their own,
 * father's, mother's, home town…) so they are recognized correctly forever
 * after the first confirmation.
 *
 * Three consumers:
 *   - snapToKnownName(): deterministically corrects a fresh transcript toward
 *     a stored name (whole value or word-by-word). A hit also skips the LLM
 *     correction round-trip — free accuracy AND less spend.
 *   - knownNames(): context for the LLM corrector and the Azure phrase list,
 *     so both engines are biased toward this user's actual names.
 *   - rememberName(): called on every confirmed name-field commit.
 *
 * Stored in localStorage; capped small; guarded for SSR/Node.
 */
import { titleCase } from "./transcriptFormat";
import { nameClose, wordCloseEnough } from "./nameMatch";

const KEY = "swaram_name_dictionary";
const MAX_NAMES = 40;

interface NameDict {
  /** Latest confirmed value per profile key ("full_name" -> "Twinsha T Thilakan"). */
  byKey: Record<string, string>;
  /** All distinct confirmed name values, most recent last. */
  names: string[];
}

function load(): NameDict {
  if (typeof window === "undefined") return { byKey: {}, names: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { byKey: {}, names: [] };
    const parsed = JSON.parse(raw) as Partial<NameDict>;
    return {
      byKey: parsed.byKey && typeof parsed.byKey === "object" ? parsed.byKey : {},
      names: Array.isArray(parsed.names) ? parsed.names.filter((n) => typeof n === "string") : [],
    };
  } catch {
    return { byKey: {}, names: [] };
  }
}

function save(dict: NameDict): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(dict));
  } catch {
    // storage full/blocked — the dictionary is an enhancement, never required
  }
}

/** Record a confirmed name-field value. */
export function rememberName(profileKey: string | undefined, value: string): void {
  const clean = value.trim();
  // Only plausible name strings — no digits, no emails, not absurdly long.
  if (!clean || clean.length > 60 || /[\d@_/]/.test(clean)) return;
  const dict = load();
  // A new confirmation for the same field SUPERSEDES the old value — and the
  // old one was very likely a misrecognition the user has now corrected.
  // Purge it, or it keeps "healing" future transcripts toward the wrong name
  // (a stored "Manoraj" was turning a correctly-heard "Manoj" back into
  // "Manoraj").
  const prev = profileKey ? dict.byKey[profileKey] : undefined;
  if (profileKey) dict.byKey[profileKey] = clean;
  const lower = clean.toLowerCase();
  dict.names = dict.names.filter((n) => {
    const nl = n.toLowerCase();
    if (nl === lower) return false;
    if (prev && nl === prev.toLowerCase()) return false;
    return true;
  });
  dict.names.push(clean);
  if (dict.names.length > MAX_NAMES) dict.names = dict.names.slice(-MAX_NAMES);
  save(dict);
}

/** Every confirmed name, for STT biasing and LLM context. */
export function knownNames(): string[] {
  return load().names;
}

// The name-matching predicate (per-word, no given-name substitution, initial
// guard) lives in ./nameMatch as the SINGLE source of truth shared with the
// server ensemble — do not re-implement it here.

/**
 * Snap a fresh transcript toward the stored names. Tries the whole value
 * first, then repairs word-by-word (so "Twinsha T Tilkan" heals once
 * "Twinsha T Thilakan" is stored). Returns null when nothing matches —
 * never invents a correction for a genuinely new name.
 */
export function snapToKnownName(raw: string, profileKey?: string): string | null {
  const heard = raw.trim();
  if (!heard || heard.length > 80) return null;
  const dict = load();

  // The value previously confirmed for this exact field wins outright.
  const forKey = profileKey ? dict.byKey[profileKey] : undefined;
  if (forKey && nameClose(heard, forKey)) return forKey;

  for (const name of [...dict.names].reverse()) {
    if (nameClose(heard, name)) return name;
  }

  // Word-level repair against the vocabulary of all stored name words.
  const vocab = new Map<string, string>();
  for (const name of dict.names) {
    for (const w of name.split(/\s+/)) {
      if (w.length >= 4) vocab.set(w.toLowerCase(), w);
    }
  }
  if (vocab.size === 0) return null;
  let repaired = false;
  const words = heard.split(/\s+/).map((w) => {
    if (vocab.has(w.toLowerCase())) return vocab.get(w.toLowerCase())!;
    for (const [, original] of vocab) {
      if (w.length >= 4 && wordCloseEnough(w, original)) {
        repaired = true;
        return original;
      }
    }
    return w;
  });
  return repaired ? titleCase(words.join(" ")) : null;
}

/** Recovery valve: forget every stored name (Profile → "Forget saved names").
 * A poisoned dictionary must always be escapable without dev tools. */
export function clearNames(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked — nothing to clear
  }
}
