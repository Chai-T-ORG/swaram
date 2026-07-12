/**
 * Pure helpers for the voice fill loop: command recognition and confirmation
 * policy. Kept out of the page component so they can be unit-tested.
 */
import type { FormField } from "../types";

export type FillCommand = "repeat" | "skip" | "back" | "type" | "pause" | "help" | "spell" | null;

/**
 * Recognise a spoken command. Anchored to the WHOLE utterance and tolerant of
 * punctuation/casing (cloud Whisper returns "Skip." or "Go back please"), so a
 * real answer that merely contains a command word is never mistaken for one.
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
