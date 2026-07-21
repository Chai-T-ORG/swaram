/**
 * Turns raw speech-recognition transcripts into properly formatted field
 * values: emails get @ and dots, phone numbers become digits, dates become
 * DD/MM/YYYY, names get capitalized, spoken punctuation ("comma", "full
 * stop") becomes real punctuation, and so on.
 */
import type { FormField } from "../types";

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** "double five" -> "55", "triple nine" -> "999", digit words -> digits. */
export function wordsToDigits(raw: string): string {
  // Engines punctuate numbers ("7736184696.") — strip everything that isn't
  // a letter, digit, or space before tokenizing, or the digits are lost.
  const tokens = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  let out = "";
  let repeat = 1;
  for (const token of tokens) {
    if (token === "double") {
      repeat = 2;
      continue;
    }
    if (token === "triple") {
      repeat = 3;
      continue;
    }
    let piece = "";
    if (/^\d+$/.test(token)) piece = token;
    else if (token in DIGIT_WORDS) piece = DIGIT_WORDS[token];
    if (piece) {
      out += piece.repeat(repeat);
      repeat = 1;
    } else {
      repeat = 1;
    }
  }
  return out;
}

/** Spoken punctuation to symbols, for free-text fields. */
export function spokenPunctuation(raw: string): string {
  return raw
    .replace(/\b(full stop|period)\b/gi, ".")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\bquestion mark\b/gi, "?")
    .replace(/\bexclamation mark\b/gi, "!")
    .replace(/\b(new line|next line)\b/gi, "\n")
    .replace(/\b(hyphen|dash)\b/gi, "-")
    .replace(/\bslash\b/gi, "/")
    .replace(/\bunderscore\b/gi, "_")
    .replace(/\s+([.,?!])/g, "$1")
    .replace(/\s+-\s+/g, "-")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (part.length > 0 && /[a-z]/.test(part[0]) ? part[0].toUpperCase() + part.slice(1) : part))
        .join(""),
    )
    .join(" ")
    .trim();
}

export function formatEmail(raw: string): string {
  let email = ` ${raw.toLowerCase().trim()} `;
  email = email
    .replace(/\s+at\s+the\s+rate\s+(of\s+)?/g, "@")
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+underscore\s+/g, "_")
    .replace(/\s+(hyphen|dash|minus)\s+/g, "-")
    .replace(/\s+plus\s+/g, "+");
  // Digits spoken as words inside the address.
  email = email.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => DIGIT_WORDS[w]);
  email = email.replace(/\s+/g, "").replace(/\.+$/, "");
  // Common STT artifact: "name@gmail. com"
  email = email.replace(/\.(com|in|org|net|co)\b/g, ".$1");
  return email;
}

export function formatPhone(raw: string): string {
  const digits = wordsToDigits(raw);
  if (digits.length >= 10) return digits.slice(-10).length === 10 && digits.length <= 12 ? digits : digits;
  return digits || raw.trim();
}

export function formatAadhaar(raw: string): string {
  const digits = wordsToDigits(raw);
  if (digits.length === 12) return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  return digits || raw.trim();
}

export function formatPincode(raw: string): string {
  const digits = wordsToDigits(raw);
  return digits.length >= 4 ? digits.slice(0, 6) : raw.trim();
}

/** How STT usually hears spoken letters ("bee" -> b, "why" -> y, "zed" -> z). */
const LETTER_HOMOPHONES: Record<string, string> = {
  ay: "a", bee: "b", be: "b", sea: "c", see: "c", si: "c", dee: "d", de: "d",
  ee: "e", ef: "f", eff: "f", gee: "g", ji: "g", aitch: "h", each: "h",
  eye: "i", jay: "j", kay: "k", el: "l", ell: "l", em: "m", en: "n",
  oh: "o", pea: "p", pee: "p", cue: "q", queue: "q", are: "r", ar: "r",
  es: "s", ess: "s", tea: "t", tee: "t", you: "u", yu: "u", vee: "v",
  ex: "x", why: "y", zee: "z", zed: "z",
};

const SPELL_FILLERS = new Set(["for", "as", "in", "like", "the", "letter", "capital", "small", "then", "next", "and"]);

/**
 * Parse an utterance spelled letter-by-letter into text:
 * "t w i n s h a space t" -> "twinsha t". Handles digit words, "double"/
 * "triple", letter homophones, and "space"/"dot"/"dash"/"at".
 */
export function spellTokensToText(raw: string): string {
  const tokens = raw.toLowerCase().replace(/[.,;:!?]/g, " ").split(/\s+/).filter(Boolean);
  let out = "";
  let repeat = 1;
  // "a for apple": the word after an anchor filler repeats the letter it
  // anchors — it must not emit a second copy of that letter.
  let anchorPending = false;
  for (const token of tokens) {
    if (token === "double") { repeat = 2; continue; }
    if (token === "triple") { repeat = 3; continue; }
    let piece = "";
    if (token === "space") piece = " ";
    else if (token === "dot" || token === "period" || token === "fullstop") piece = ".";
    else if (token === "dash" || token === "hyphen" || token === "minus") piece = "-";
    else if (token === "at") piece = "@";
    else if (token === "underscore") piece = "_";
    else if (token === "apostrophe") piece = "'";
    else if (token === "slash") piece = "/";
    else if (/^[a-z]$/.test(token)) piece = token;
    else if (token in LETTER_HOMOPHONES) piece = LETTER_HOMOPHONES[token];
    else if (token in DIGIT_WORDS) piece = DIGIT_WORDS[token];
    else if (/^\d+$/.test(token)) piece = token;
    else if (SPELL_FILLERS.has(token)) {
      repeat = 1;
      if (token === "for" || token === "as" || token === "like" || token === "in") anchorPending = true;
      continue;
    }
    // STT often merges quickly-spoken letters into one token ("t w" -> "tw",
    // "TWN" -> "twn"). A vowelless cluster is never a real word, so expand it
    // back into its letters instead of collapsing to the first one.
    else if (/^[bcdfghjklmnpqrstvwxz]{2,6}$/.test(token)) piece = token;
    else if (/^[a-z]{2,}$/.test(token)) {
      // Anchor word ("apple" after "a for") — the letter was already emitted.
      if (anchorPending && out.endsWith(token[0])) { anchorPending = false; repeat = 1; continue; }
      piece = token[0];
    }
    anchorPending = false;
    if (piece) {
      out += piece.repeat(piece.length === 1 ? repeat : 1);
      repeat = 1;
    } else {
      repeat = 1;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Classic Levenshtein distance, case-insensitive. Small strings only. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

/**
 * The user spelled a WHOLE multi-word value but the recognizer dropped the
 * word separators ("twinshatthilakan"). Re-insert the spaces by aligning the
 * spelled letters against the previously-heard value's letters and projecting
 * its space positions through the alignment. Returns null when the strings
 * are too different to be the same value.
 */
function projectSpaces(base: string, spelled: string): string | null {
  const baseLetters = base.toLowerCase().replace(/\s+/g, "");
  const s = spelled.toLowerCase();
  if (!baseLetters || !s) return null;
  if (Math.abs(baseLetters.length - s.length) > Math.max(2, Math.round(baseLetters.length * 0.4))) return null;
  // Letter indices in `base` that have a space AFTER them.
  const spaceAfter = new Set<number>();
  let li = 0;
  for (const ch of base) {
    if (/\s/.test(ch)) spaceAfter.add(li);
    else li += 1;
  }
  if (spaceAfter.size === 0) return null;

  const n = baseLetters.length;
  const m = s.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (baseLetters[i - 1] === s[j - 1] ? 0 : 1),
      );
    }
  }
  // Backtrace: where does each base-letter boundary land in the spelled
  // string? Record only the FIRST visit per row (the largest j), so inserted
  // letters attach to the word on their LEFT — "twinshA|t", not "twinsh|At".
  const map = new Array<number>(n + 1).fill(-1);
  map[n] = m;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (map[i] === -1) map[i] = j;
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (baseLetters[i - 1] === s[j - 1] ? 0 : 1)) {
      i -= 1; j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  map[0] = 0;
  for (let k = 1; k <= n; k++) if (map[k] === -1) map[k] = map[k - 1];

  const cuts = [...spaceAfter].map((k) => map[k]).sort((a, b) => a - b);
  let out = "";
  let prev = 0;
  for (const c of cuts) {
    if (c <= prev || c >= m) continue;
    out += s.slice(prev, c) + " ";
    prev = c;
  }
  out += s.slice(prev);
  return out.trim();
}

/**
 * Merge a spelled correction into a previously-heard value, so the user can
 * fix just the wrong word instead of re-spelling everything:
 *
 *   heard "Twinsha T Tilkan", spelled "thilakan" -> "Twinsha T Thilakan"
 *
 * A spelled string containing a space is a full re-spell and replaces the
 * whole value. A single-word spelling as long as the whole value is a full
 * re-spell whose separators were lost — spaces are re-projected from the
 * heard value. Otherwise the closest word of `heard` (by edit distance) is
 * replaced — but only when it's actually similar; a completely different
 * spelling also replaces the whole value.
 */
export function mergeSpelledCorrection(heard: string, spelled: string): string {
  const fix = spelled.trim();
  const base = heard.trim();
  if (!base) return fix;
  if (!fix) return base;
  if (/\s/.test(fix)) return fix; // multi-word spelling = full re-spell
  const words = base.split(/\s+/);
  if (words.length < 2) return fix;

  // A "single word" as long as the entire value = a full re-spell with the
  // separators eaten by the recognizer. Recover the spaces by alignment.
  if (fix.length >= Math.round(base.replace(/\s+/g, "").length * 0.66)) {
    const projected = projectSpaces(base, fix);
    if (projected) return projected;
  }

  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const d = editDistance(words[i], fix);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // Similar enough to be a correction of that word (more than half the
  // letters survive) — otherwise treat the spelling as a full replacement.
  const threshold = Math.max(1, Math.floor(Math.max(words[bestIdx].length, fix.length) * 0.6));
  if (bestIdx >= 0 && bestDist > 0 && bestDist <= threshold) {
    words[bestIdx] = fix;
    return words.join(" ");
  }
  if (bestDist === 0) return base; // already right — nothing to change
  return fix;
}

/* ------------------------- spoken edit commands --------------------------- */

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1,
};

function ordinalToIndex(word: string): number | null {
  const w = word.toLowerCase();
  // Word ordinals first — "first"/"third"/"last" must not lose their tails
  // to the digit-suffix strip ("3rd" -> 3).
  if (w in ORDINALS) return ORDINALS[w];
  const n = Number(w.replace(/^(\d+)(st|nd|rd|th)$/, "$1"));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Give `ch` the letter case of the character it replaces. */
function matchCase(original: string, ch: string): string {
  return original === original.toUpperCase() && original !== original.toLowerCase()
    ? ch.toUpperCase()
    : ch.toLowerCase();
}

/** Replace the Nth letter/digit of `value` (1-based; -1 = last), keeping spaces. */
function setLetterAt(value: string, ord: number, ch: string): string | null {
  const chars = [...value];
  const positions: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (/[\p{L}\p{N}]/u.test(chars[i])) positions.push(i);
  }
  if (positions.length === 0) return null;
  const idx = ord === -1 ? positions[positions.length - 1] : positions[ord - 1];
  if (idx === undefined) return null;
  chars[idx] = matchCase(chars[idx], ch);
  return chars.join("");
}

/** Does this phrase read as spelled letters ("tee aitch" / "t h") rather than a word? */
function looksSpelled(phrase: string): boolean {
  const tokens = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(
    (t) => /^[a-z]$/.test(t) || t in LETTER_HOMOPHONES || t in DIGIT_WORDS || /^\d$/.test(t),
  );
}

/** A phrase used as replacement text: spelled letters are decoded, words kept. */
function resolveReplacement(phrase: string): string {
  const clean = phrase.trim().replace(/[.,!?]+$/, "");
  return looksSpelled(clean) ? spellTokensToText(clean) : clean;
}

/**
 * Apply an IVR-style spoken correction to a confirmed-but-wrong value:
 *
 *   "change k to c"                    -> first "k" becomes "c"
 *   "the third letter is e"            -> positional letter edit
 *   "replace tilkan with thilakan"     -> closest word swapped
 *
 * Returns the edited value, or null when the utterance isn't an edit command
 * (so the caller can fall through to yes/no handling).
 */
export function applySpokenEdit(value: string, utterance: string): string | null {
  const u = utterance.toLowerCase().trim().replace(/[.,!?]+$/, "");
  if (!value.trim() || !u) return null;

  // "the third letter is e" / "3rd letter should be m" / "last letter is n"
  const positional = u.match(
    /^(?:the\s+)?([a-z]+|\d+(?:st|nd|rd|th)?)\s+letter\s+(?:is|should be|becomes|to)\s+(.+)$/,
  );
  if (positional) {
    const ord = ordinalToIndex(positional[1]);
    const ch = resolveReplacement(positional[2]);
    if (ord !== null && ch.length === 1) {
      const edited = setLetterAt(value, ord, ch);
      return edited && edited !== value ? edited : null;
    }
    return null;
  }

  // "change/replace/make X with/to/into Y"
  const swap = u.match(/^(?:change|replace|make)\s+(?:the\s+)?(.+?)\s+(?:with|to|into)\s+(.+)$/);
  if (!swap) return null;
  const targetRaw = swap[1].trim();
  const replacement = resolveReplacement(swap[2]);
  if (!replacement) return null;

  // Target "third letter" inside the swap form.
  const ordTarget = targetRaw.match(/^([a-z]+|\d+(?:st|nd|rd|th)?)\s+letter$/);
  if (ordTarget) {
    const ord = ordinalToIndex(ordTarget[1]);
    if (ord !== null && replacement.length === 1) {
      const edited = setLetterAt(value, ord, replacement);
      return edited && edited !== value ? edited : null;
    }
    return null;
  }

  // Single-letter target: replace its first occurrence, keeping its case.
  const targetLetter = looksSpelled(targetRaw) ? spellTokensToText(targetRaw) : targetRaw;
  if (targetLetter.length === 1 && replacement.length >= 1) {
    const idx = value.toLowerCase().indexOf(targetLetter.toLowerCase());
    if (idx < 0) return null;
    const cased = matchCase(value[idx], replacement[0]) + replacement.slice(1);
    return value.slice(0, idx) + cased + value.slice(idx + 1);
  }

  // Word target: swap the closest word of the value.
  const words = value.split(/\s+/);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const d = editDistance(words[i], targetLetter);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const tolerance = Math.max(1, Math.floor(Math.max(1, targetLetter.length) * 0.4));
  if (bestIdx < 0 || bestDist > tolerance) return null;
  words[bestIdx] = replacement;
  const edited = words.join(" ");
  return edited !== value ? edited : null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Spoken ordinal day words ("twenty fifth") -> day numbers. */
const ORDINAL_DAYS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, thirtieth: 30,
};
// Numeric keys too: the transcript normalizer may already have turned
// "twenty fifth" into "20 fifth" before this runs.
const ORDINAL_TENS: Record<string, number> = { twenty: 20, thirty: 30, "20": 20, "30": 30 };

/** Spoken date -> DD/MM/YYYY (day-first, Indian convention). */
export function formatDate(raw: string): string {
  let cleaned = raw
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bof\b/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "twenty fifth" -> 25, "thirtieth" -> 30 — STT often leaves ordinal words
  // that the number-word normalizer doesn't touch.
  cleaned = cleaned.replace(
    /\b(?:(twenty|thirty|20|30)[\s-])?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)\b/g,
    (_m, tens, ord) => String((tens ? ORDINAL_TENS[tens] : 0) + ORDINAL_DAYS[ord]),
  );

  // Numeric: 25/5/2002, 25-05-02, "25 5 2002"
  const numeric = cleaned.match(/^(\d{1,2})[\s/.-](\d{1,2})[\s/.-](\d{2,4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    const year = y.length === 2 ? `20${y}` : y;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${year}`;
  }

  // "25 may 2002" or "may 25 2002"
  const tokens = cleaned.split(" ");
  let day = 0;
  let month = 0;
  let year = 0;
  for (const token of tokens) {
    if (token in MONTHS) month = MONTHS[token];
    else if (/^\d{4}$/.test(token)) year = Number(token);
    else if (/^\d{1,2}$/.test(token)) day = Number(token);
  }
  if (day >= 1 && day <= 31 && month >= 1 && year > 1000) {
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
  return raw.trim();
}

/** Addresses: spoken punctuation, capitalized words, digits kept. */
export function formatAddress(raw: string): string {
  const punctuated = spokenPunctuation(raw);
  return punctuated
    .split(/(\n|,)/)
    .map((segment) => (segment === "," || segment === "\n" ? segment : titleCase(segment).trim()))
    .join("")
    .replace(/,(\S)/g, ", $1")
    .trim();
}

function sentenceCase(raw: string): string {
  const text = spokenPunctuation(raw);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const NAME_KEYS = new Set([
  "full_name", "father_name", "mother_name", "guardian_name",
  "city", "state", "nationality", "religion", "place", "blood_group",
]);

/** Fields whose value is an alphanumeric code (roll no, registration no…). */
export const ID_FIELD_RE = /roll|registration|application|enrol|admission|licen[cs]e|reference|token no/;

/** "ab 12 c 3456." -> "AB12C3456" — codes are written tight and uppercase. */
export function formatIdCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/\b(?:DASH|HYPHEN|MINUS)\b/g, "-")
    .replace(/\bSLASH\b/g, "/")
    .replace(/[.,:;'"”“]+/g, "")
    .replace(/\s+/g, "");
  return cleaned || raw.trim();
}

/** Format a raw transcript for a specific field. */
export function formatAnswer(raw: string, field: Pick<FormField, "type" | "profileKey" | "sensitive" | "label">): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (field.type === "date") return formatDate(trimmed);

  const key = field.profileKey ?? "";
  const label = field.label.toLowerCase();

  if (key === "email" || /e-?mail/.test(label)) return formatEmail(trimmed);
  if (key === "phone" || /(mobile|phone|contact|whatsapp)/.test(label)) return formatPhone(trimmed);
  if (field.sensitive && /(aadhaar|aadhar|adhar|uid)/.test(label)) return formatAadhaar(trimmed);
  if (key === "pincode" || /pin\s?code|postal/.test(label)) return formatPincode(trimmed);
  if (ID_FIELD_RE.test(label)) return formatIdCode(trimmed);
  if (key === "address" || /address/.test(label)) return formatAddress(trimmed);
  if (NAME_KEYS.has(key) || /\bname\b/.test(label)) {
    // Engines punctuate initials differently ("K.M.", "K. M", "K M") — the
    // printed form wants bare spaced letters: "Tejas K M".
    const deDotted = spokenPunctuation(trimmed)
      .replace(/\b(\p{L})\.(?=\s|\p{L}|$)/gu, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
    return titleCase(deDotted);
  }
  if (key === "annual_income" || /income/.test(label)) {
    const digits = wordsToDigits(trimmed);
    return digits.length >= 4 ? Number(digits).toLocaleString("en-IN") : sentenceCase(trimmed);
  }
  return sentenceCase(trimmed);
}
