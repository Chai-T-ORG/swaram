/**
 * enhanceFields.ts — use the LLM to make OCR'd form fields smarter.
 *
 * OCR gives us noisy labels and rough types. This asks the LLM to, for the
 * whole field list at once:
 *   - clean up garbled labels ("Fathe's / Guardan Nam" -> "Father's / Guardian's Name")
 *   - fix the field type (text / date / choice / checkbox)
 *   - tidy choice options
 *   - write a natural spoken question and a short format hint
 *   - drop junk that isn't really a fillable field
 *
 * It's a best-effort enhancement layer: if the LLM is unavailable or returns
 * anything unexpected, the original OCR fields are used unchanged. Geometry
 * (bbox / page / order) is always preserved from the original field so
 * write-back still lands in the right place.
 */
import type { FormField } from "../types";
import { chatJson, isLlmAvailable } from "../voice/llm";

interface LlmField {
  id: string;
  label?: string;
  type?: string;
  options?: string[];
  question?: string;
  help?: string;
  drop?: boolean;
}

const SYSTEM = `You clean up form fields detected by OCR for a voice assistant that fills forms for blind users in India.
You are given a JSON array of fields (id, label, type, options). Return JSON: {"fields": [ ... ]} where each item has:
- "id": unchanged, matching the input.
- "label": the corrected, human-readable field label (fix OCR typos; expand abbreviations; keep it short).
- "type": one of "text", "date", "choice", "checkbox". Correct it if the OCR type is wrong (e.g. Date of Birth -> date; Gender/Category with options -> choice; a single yes/no box -> checkbox).
- "options": for "choice" only, the cleaned option list; omit otherwise.
- "question": a short, natural spoken question to ask the user (e.g. "What is your date of birth?"). Warm and plain.
- "help": a very short spoken hint about the expected format, or "" if none. This is India: dates are day-month-year (e.g. "Say it like 25 May 2002"), phone numbers are 10 digits, PIN codes are 6 digits.
- "drop": true only if this clearly is NOT a fillable field (a heading, instruction, page number, signature line, or photo box).
Keep the SAME number and order of ids you were given. Do not invent new fields. Never ask the user to speak Aadhaar or other ID numbers aloud in the help text.`;

/**
 * Returns a new field list with LLM-refined label/type/options/question/help.
 * Falls back to the input unchanged on any problem.
 */
export async function enhanceFieldsWithLlm(
  fields: FormField[],
  formName: string,
): Promise<FormField[]> {
  if (!isLlmAvailable() || fields.length === 0) return fields;

  const compact = fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    ...(f.options?.length ? { options: f.options } : {}),
  }));

  let parsed: { fields?: LlmField[] } | null = null;
  try {
    parsed = await chatJson(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Form: ${formName}\nFields: ${JSON.stringify(compact)}` },
      ],
      { maxTokens: 2000 },
    );
  } catch {
    return fields;
  }
  if (!parsed || !Array.isArray(parsed.fields)) return fields;

  const byId = new Map<string, LlmField>();
  for (const f of parsed.fields) {
    if (f && typeof f.id === "string") byId.set(f.id, f);
  }

  const validType = (t: unknown): FormField["type"] | null =>
    t === "text" || t === "date" || t === "choice" || t === "checkbox" ? t : null;

  const out: FormField[] = [];
  for (const field of fields) {
    const llm = byId.get(field.id);
    if (!llm) {
      out.push(field);
      continue;
    }
    if (llm.drop) continue; // LLM says this isn't a real field

    const nextType = validType(llm.type) ?? field.type;
    const options =
      nextType === "choice"
        ? (Array.isArray(llm.options) && llm.options.length ? llm.options : field.options)
        : undefined;

    out.push({
      ...field,
      type: nextType,
      options,
      question: typeof llm.question === "string" && llm.question.trim() ? llm.question.trim() : field.question,
      help: typeof llm.help === "string" ? llm.help.trim() || undefined : field.help,
    });
  }

  // Safety: if the LLM somehow dropped everything, keep the originals.
  return out.length > 0 ? out : fields;
}
