/**
 * Pure helpers for the voice fill loop: command recognition and confirmation
 * policy. Kept out of the page component so they can be unit-tested.
 */
import type { FormField } from "../types";
import { INTL_KEYWORDS, containsKeyword } from "./intlCommands";

export type FillCommand = "repeat" | "skip" | "back" | "type" | "pause" | "help" | "spell" | null;

/**
 * Recognise a spoken command. Anchored to the WHOLE utterance and tolerant of
 * punctuation/casing (cloud Whisper returns "Skip." or "Go back please"), so a
 * real answer that merely contains a command word is never mistaken for one.
 *
 * English matches the anchored regexes below; Hindi / Malayalam / French match
 * the shared multilingual keyword lists (see intlCommands.ts), since the
 * recognizer returns native script in those languages.
 */
export function parseFillCommand(text: string): FillCommand {
  const t = text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    // strip leading/trailing politeness so "go back please" still matches
    .replace(/^\s*(please|okay|ok|now|hey|um|uh)\s+/g, "")
    .replace(/\s+(please|now|thanks|thank you|okay|ok)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(please )?(repeat|repeat that|say (that|it) again|again|dobara( bolo)?)$/.test(t)) return "repeat";
  if (/^(skip|next)( (this|it|the|this one))?( (field|question|one))?$|^(chhod do|aage badho)$/.test(t)) return "skip";
  if (/^(go back|back|previous|previous question|go to previous|change( it| that| answer| my answer)?|piche jao)$/.test(t)) return "back";
  if (/^(type|type instead|keyboard|i('| wi)ll type|let me type)$/.test(t)) return "type";
  if (/^(pause|stop|wait|hold on|one moment)$/.test(t)) return "pause";
  if (/^(help|what can i say|commands|what are my options)$/.test(t)) return "help";
  if (/^(let me spell|i('| wi)ll spell|spell( it| that)?( out)?|spell mode|by letters?)$/.test(t)) return "spell";

  // Non-English (script-based) commands.
  if (containsKeyword(text, INTL_KEYWORDS.repeat)) return "repeat";
  if (containsKeyword(text, INTL_KEYWORDS.skip)) return "skip";
  if (containsKeyword(text, INTL_KEYWORDS.back)) return "back";
  if (containsKeyword(text, INTL_KEYWORDS.type)) return "type";
  if (containsKeyword(text, INTL_KEYWORDS.pause)) return "pause";
  if (containsKeyword(text, INTL_KEYWORDS.help)) return "help";
  if (containsKeyword(text, INTL_KEYWORDS.spell)) return "spell";
  return null;
}

const NAME_KEYS = new Set(["full_name", "father_name", "mother_name", "guardian_name"]);

export function isNameField(field: Pick<FormField, "profileKey" | "label">): boolean {
  return NAME_KEYS.has(field.profileKey ?? "") || /\bname\b/i.test(field.label);
}

/**
 * Field-type-driven confirmation — replaces the meaningless STT "confidence"
 * number (cloud Whisper always reports ~0.97). Confirm only where an error
 * would be costly or a mishearing is common; accept the rest (the review
 * screen is the final safety net) so the flow stays fast.
 */
/**
 * Lightweight plausibility check — reject answers that are clearly wrong for
 * the field type *before* asking the user to confirm.  Returns null when the
 * answer looks plausible, or a short rejection reason string when it doesn't.
 *
 * This is intentionally conservative: only reject on obvious mismatches (digits
 * in a name field, letters in a phone field, etc.) so the flow stays fast and
 * non-frustrating.  The review screen remains the final safety net.
 */
export function plausibleAnswer(
  value: string,
  field: Pick<FormField, "type" | "profileKey" | "label" | "sensitive">,
): string | null {
  if (!value) return null; // empty is handled elsewhere
  const trimmed = value.trim();
  const digits = (trimmed.match(/\d/g) || []).length;
  const letters = (trimmed.match(/[a-zA-Z\u0900-\u097F\u0D00-\u0D7F\u00C0-\u024F]/g) || []).length;
  const key = field.profileKey ?? "";
  const label = field.label.toLowerCase();

  // ---- Phone / numeric IDs ----
  if (key === "phone" || /(mobile|phone|contact|whatsapp)/.test(label)) {
    const digitOnly = trimmed.replace(/\D/g, "");
    if (digitOnly.length < 7 || digitOnly.length > 15) {
      return "a phone number should be 7 to 15 digits";
    }
    if (letters > digitOnly.length) {
      return "that looks like text, not a phone number";
    }
    return null;
  }

  // ---- Aadhaar ----
  if (field.sensitive && /(aadhaar|aadhar|adhar|uid)/.test(label)) {
    const stripped = trimmed.replace(/\s/g, "");
    if (!/^\d{12}$/.test(stripped) && !/^\d{4}\s?\d{4}\s?\d{4}$/.test(trimmed)) {
      return "an Aadhaar number should be exactly 12 digits";
    }
    return null;
  }

  // ---- Pincode ----
  if (key === "pincode" || /pin\s?code|postal/.test(label)) {
    if (!/^\d{6}$/.test(trimmed.replace(/\s/g, ""))) {
      return "a pincode should be exactly 6 digits";
    }
    return null;
  }

  // ---- Email ----
  if (key === "email" || /e-?mail/.test(label)) {
    if (!trimmed.includes("@") || trimmed.length < 5) {
      return "that doesn't look like an email address";
    }
    return null;
  }

  // ---- IFSC ----
  if (key === "ifsc" || /ifsc/.test(label)) {
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(trimmed.replace(/\s/g, ""))) {
      return "an IFSC code should be 4 letters, a zero, then 6 characters";
    }
    return null;
  }

  // ---- Name fields ----
  if (isNameField(field)) {
    if (digits > 0 && digits >= letters) {
      return "that doesn't sound like a name — it has more numbers than letters";
    }
    if (trimmed.split(/\s+/).length > 6) {
      return "that seems too long for a name";
    }
    return null;
  }

  // ---- Date ----
  if (field.type === "date") {
    // Very loose: reject obvious non-dates ("hello", random words)
    if (letters > 0 && digits === 0 && trimmed.split(/\s+/).length > 4) {
      return "that doesn't look like a date — try saying a day, month, and year";
    }
    return null;
  }

  // ---- Address / free text / choice / checkbox / anything else ----
  // Too flexible to reject.  Return null.
  return null;
}

export function needsConfirmation(field: FormField, unclear: boolean): boolean {
  if (field.sensitive || unclear) return true;
  if (field.type === "date") return true;
  const key = field.profileKey ?? "";
  const label = field.label.toLowerCase();
  const critical =
    ["phone", "email", "pincode", "aadhaar", "bank_account", "ifsc", "roll_number", "annual_income"].includes(key) ||
    /(phone|mobile|e-?mail|aadhaar|aadhar|pin ?code|account|ifsc|number|amount|income|roll)/.test(label);
  if (critical) return true;
  if (isNameField(field)) return true;
  return false; // addresses, institutions, free text, choices, yes/no
}
