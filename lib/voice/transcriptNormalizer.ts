/**
 * transcriptNormalizer.ts — Post-processing pipeline for STT output.
 *
 * Runs on every transcript (Whisper or Web Speech API) before it reaches
 * the form filler. Handles number words, email patterns, phone formatting,
 * address shortcuts, and common mishearings.
 */

// ─── Number Words ──────────────────────────────────────────────────────
const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000,
  million: 1000000, crore: 10000000, billion: 1000000000,
};

/**
 * Convert a sequence of number words to digits.
 * "twenty three" → "23", "one hundred and fifty" → "150"
 */
function numberWordsToDigits(text: string): string {
  return text.replace(
    /\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lac|million|crore|billion|and)\b[\s-]*)+/gi,
    (match) => {
      const words = match.toLowerCase().replace(/-/g, " ").split(/\s+/).filter((w) => w !== "and");
      let total = 0;
      let current = 0;

      for (const word of words) {
        if (ONES[word] !== undefined) {
          current += ONES[word];
        } else if (TENS[word] !== undefined) {
          current += TENS[word];
        } else if (SCALES[word] !== undefined) {
          const scale = SCALES[word];
          if (current === 0) current = 1;
          if (scale >= 1000) {
            total += current * scale;
            current = 0;
          } else {
            current *= scale;
          }
        }
      }
      total += current;

      // If the result is 0 and the original wasn't just "zero", return original
      if (total === 0 && !words.every((w) => w === "zero")) {
        return match;
      }

      return String(total);
    },
  );
}

/**
 * Convert individually spoken digits to a number string.
 * "nine eight seven six five four three two one zero" → "9876543210"
 */
function spokenDigitsToNumber(text: string): string {
  // Only match sequences of 4+ digit words (to avoid false positives)
  const digitWords = Object.keys(ONES).filter((k) => ONES[k] <= 9);
  const digitPattern = new RegExp(
    `\\b((?:${digitWords.join("|")})(?:\\s+(?:${digitWords.join("|")})){3,})\\b`,
    "gi",
  );

  return text.replace(digitPattern, (match) => {
    const words = match.toLowerCase().split(/\s+/);
    return words.map((w) => String(ONES[w] ?? w)).join("");
  });
}

// ─── Email Patterns ────────────────────────────────────────────────────

function normalizeEmail(text: string): string {
  let result = text;

  // "at the rate" / "at sign" / "at the rate of" → "@"
  result = result.replace(/\bat\s+the\s+rate(?:\s+of)?\b/gi, "@");
  result = result.replace(/\bat\s+sign\b/gi, "@");
  result = result.replace(/\bat\s+rate\b/gi, "@");

  // "dot" → "." when surrounded by word characters (email/URL context)
  // Be careful not to replace "dot" in "polka dot dress"
  result = result.replace(/(\w)\s+dot\s+(\w)/gi, "$1.$2");

  // "underscore" → "_"
  result = result.replace(/\bunderscore\b/gi, "_");

  // "hyphen" / "dash" → "-"
  result = result.replace(/\b(?:hyphen|dash)\b/gi, "-");

  // Clean up spaces around @ and .
  result = result.replace(/\s*@\s*/g, "@");
  result = result.replace(/\s*\.\s*(?=\w)/g, ".");

  return result;
}

// ─── Phone Formatting ──────────────────────────────────────────────────

function normalizePhone(text: string): string {
  // "double" / "triple" expansion: "double five" → "five five"
  let result = text.replace(/\b(double|triple)\s+(\w+)/gi, (_, mult, digit) => {
    const count = mult.toLowerCase() === "double" ? 2 : 3;
    return Array(count).fill(digit).join(" ");
  });

  // "plus" at start of phone context → "+"
  result = result.replace(/^plus\s+/i, "+");

  return result;
}

// ─── Address Shortcuts ─────────────────────────────────────────────────

const ADDRESS_EXPANSIONS: [RegExp, string][] = [
  [/\bstreet\b/gi, "St"],
  [/\bavenue\b/gi, "Ave"],
  [/\bboulevard\b/gi, "Blvd"],
  [/\bdrive\b/gi, "Dr"],
  [/\bbuilding\b/gi, "Bldg"],
  [/\bapartment\b/gi, "Apt"],
  [/\bfloor\b/gi, "Fl"],
  [/\bnumber\b/gi, "No"],
  [/\broad\b/gi, "Rd"],
  [/\blane\b/gi, "Ln"],
  [/\bcourt\b/gi, "Ct"],
  [/\bplace\b/gi, "Pl"],
  [/\bsquare\b/gi, "Sq"],
];

function normalizeAddress(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ADDRESS_EXPANSIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Common Corrections ────────────────────────────────────────────────

const CORRECTIONS: [RegExp, string][] = [
  // Common mishearings
  [/\bfull stop\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation(?:\s+mark)?\b/gi, "!"],
  [/\bcolon\b/gi, ":"],
  [/\bsemicolon\b/gi, ";"],
  [/\bforward slash\b/gi, "/"],
  [/\bback\s?slash\b/gi, "\\"],
  [/\bhashtag\b/gi, "#"],
  [/\bhash\b/gi, "#"],
  [/\bopen (?:bracket|parenthesis)\b/gi, "("],
  [/\bclose (?:bracket|parenthesis)\b/gi, ")"],
  [/\bspace\b/gi, " "],
  [/\bnew line\b/gi, "\n"],

  // Indian English mishearings
  [/\bpincode\b/gi, "PIN code"],
  [/\baadhaar\b/gi, "Aadhaar"],
  [/\baadhar\b/gi, "Aadhaar"],
  [/\bpan\s+card\b/gi, "PAN card"],
];

function applyCorrections(text: string): string {
  let result = text;
  for (const [pattern, replacement] of CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Field-Type-Aware Processing ───────────────────────────────────────

export type FieldHint = "email" | "phone" | "number" | "address" | "date" | "name" | "text";

function applyFieldHint(text: string, hint?: FieldHint): string {
  if (!hint) return text;

  switch (hint) {
    case "email":
      return normalizeEmail(text).replace(/\s+/g, "").toLowerCase();
    case "phone":
      return normalizePhone(numberWordsToDigits(spokenDigitsToNumber(text))).replace(/[^\d+\-() ]/g, "");
    case "number":
      return numberWordsToDigits(spokenDigitsToNumber(text));
    case "address":
      return normalizeAddress(numberWordsToDigits(text));
    default:
      return text;
  }
}

// ─── Main Normalizer ───────────────────────────────────────────────────

export interface NormalizeOptions {
  /** Hint about what type of data this field expects. */
  fieldHint?: FieldHint;
  /** All transcript alternatives from the STT engine. */
  alternatives?: string[];
}

/**
 * Normalize a raw STT transcript for form filling.
 *
 * This runs on every transcript regardless of which engine produced it.
 * The goal is to turn spoken language into the format the form expects.
 */
export function normalizeTranscript(raw: string, options: NormalizeOptions = {}): string {
  let text = raw.trim();
  if (!text) return text;

  // General normalizations (always applied)
  text = applyCorrections(text);
  text = normalizePhone(text);
  text = spokenDigitsToNumber(text);
  text = numberWordsToDigits(text);
  text = normalizeEmail(text);

  // Field-type-specific processing
  if (options.fieldHint) {
    text = applyFieldHint(text, options.fieldHint);
  }

  // Clean up extra whitespace
  text = text.replace(/\s{2,}/g, " ").trim();

  return text;
}

/**
 * Score a list of transcript alternatives against a field hint and
 * return the best match. Useful when the STT engine provides multiple
 * alternatives and we want to pick the one most likely to be correct
 * for the given field type.
 */
export function pickBestAlternative(
  alternatives: string[],
  fieldHint?: FieldHint,
): { transcript: string; index: number } {
  if (alternatives.length === 0) return { transcript: "", index: -1 };
  if (!fieldHint || alternatives.length === 1) {
    return { transcript: normalizeTranscript(alternatives[0], { fieldHint }), index: 0 };
  }

  let bestScore = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i < alternatives.length; i++) {
    const normalized = normalizeTranscript(alternatives[i], { fieldHint });
    let score = 0;

    switch (fieldHint) {
      case "email":
        if (normalized.includes("@") && normalized.includes(".")) score += 10;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) score += 20;
        break;
      case "phone":
        // Count digits — more digits likely means a better phone transcription
        score += (normalized.match(/\d/g) || []).length * 2;
        break;
      case "number":
        if (/^\d+$/.test(normalized.replace(/[,.\s]/g, ""))) score += 10;
        break;
      case "address":
        // Addresses with numbers score higher
        if (/\d/.test(normalized)) score += 5;
        break;
    }

    // Penalize very short results (likely misrecognition)
    if (normalized.length < 2) score -= 10;

    // Slight bias toward the first alternative (engine's top pick)
    score -= i * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return {
    transcript: normalizeTranscript(alternatives[bestIndex], { fieldHint }),
    index: bestIndex,
  };
}
