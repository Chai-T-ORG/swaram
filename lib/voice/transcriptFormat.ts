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
  const tokens = raw.toLowerCase().replace(/[-,]/g, " ").split(/\s+/);
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
    else if (SPELL_FILLERS.has(token)) { repeat = 1; continue; }
    else if (/^[a-z]{2,}$/.test(token)) piece = token[0]; // "a for apple" style
    if (piece) {
      out += piece.repeat(piece.length === 1 ? repeat : 1);
      repeat = 1;
    } else {
      repeat = 1;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Spoken date -> DD/MM/YYYY (day-first, Indian convention). */
export function formatDate(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bof\b/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  if (key === "address" || /address/.test(label)) return formatAddress(trimmed);
  if (NAME_KEYS.has(key) || /\bname\b/.test(label)) return titleCase(spokenPunctuation(trimmed));
  if (key === "annual_income" || /income/.test(label)) {
    const digits = wordsToDigits(trimmed);
    return digits.length >= 4 ? Number(digits).toLocaleString("en-IN") : sentenceCase(trimmed);
  }
  return sentenceCase(trimmed);
}
