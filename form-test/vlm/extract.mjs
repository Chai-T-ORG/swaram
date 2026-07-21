// VLM-native form field extraction prototype (Gemini vision).
// Exports extractPage(); CLI: node extract.mjs <filled|unfilled> <page>
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function loadKey() {
  const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  const m = env.match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m) throw new Error("GEMINI_API_KEY not found in .env.local");
  return m[1].trim();
}

export const MODEL = process.env.VLM_MODEL || "gemini-flash-latest";

const PROMPT = ({ page, total }) => `You are an expert form-layout analyzer for a voice accessibility app that fills forms for blind users in India. You are given ONE page image — page ${page} of ${total} — of a scanned/printed application form.

Extract EVERY fillable field a person would need to answer, in natural reading order (top-to-bottom; left-to-right for fields sharing a row).

Return ONLY a JSON object: { "fields": [ ... ] }.

Each non-table field object:
- "label": clean human-readable label. Fix OCR/typos, expand abbreviations, DROP leading numbering ("1.1"). e.g. "Father's / Guardian's Name".
- "type": one of "text" | "date" | "choice" | "comb" | "signature".
    * "comb"      = a row of separate character cells, one letter/digit per box (Aadhaar, PAN, PIN, Mobile, Register Number, boxed dates).
    * "choice"    = pick one/more from printed options that each have a square checkbox or a radio circle.
    * "date"      = a date (may be written into DD/MM/YYYY boxes — still "date").
    * "signature" = a place to physically sign (NOT voice-fillable).
    * "text"      = free text written on a line / blank.
- "options": ONLY for "choice" — array of the printed option labels, in order. e.g. ["General","OBC","SC","ST","EWS"].
- "optionBboxes": ONLY for "choice" — an array PARALLEL to "options" (same length and order). Each entry is the [ymin,xmin,ymax,xmax] box of THAT option's tick target — the small square checkbox or radio circle itself (NOT the word next to it). This is where a checkmark gets drawn.
- "combLength": for "comb", the number of character cells. ALSO include it for a "date" written into per-character boxes (e.g. D D / M M / Y Y Y Y) — set it to the number of DIGIT cells (usually 8). Omit for a date on a plain line.
- "cellBboxes": ONLY when a comb's cells are SPLIT INTO GROUPS with visible gaps (Aadhaar 4-4-4, a boxed date D D / M M / Y Y Y Y) — an array with ONE [ymin,xmin,ymax,xmax] per character cell, left to right, count matching combLength. OMIT for a plain contiguous run of equal boxes (PAN, Mobile, IFSC).
- "value": the answer ALREADY filled on this form.
    * choice   -> the selected option label(s) that are ticked / encircled. "" if none.
    * comb/text/date -> the written characters with normal spacing (Aadhaar "482177349210", name "ANJALI S NAIR", date "14/07/2007"). "" if blank.
- "bbox": the ANSWER region where the value goes (NOT the printed label). Format [ymin, xmin, ymax, xmax] as integers 0-1000 normalized to the image. For "choice", enclose the full span of all options. Be precise — the box must tightly cover the writable area / boxes / option row.

For a bordered TABLE, emit ONE field with:
- "label", "type":"table",
- "columns": the DATA column headers in order. EXCLUDE the leading row-header / serial-number column (e.g. "#", "S.No", or an "Examination" label column) — that one becomes each row's rowLabel, NOT a data column.
- "rows": array; each element { "rowLabel": <the leading row-header / serial value, e.g. "1" or "SSLC / Class X">, "cells": [ { "value": "...", "bbox": [ymin,xmin,ymax,xmax] }, ... EXACTLY ONE PER DATA COLUMN, same order and same count as "columns" ] }.
- Emit every data row including trailing blank rows (cells with value "").

Rules:
- DO NOT emit: section headings, instructions, page numbers, form numbers, the photograph box, footers, or the small running "Applicant's Name:" blank repeated in each page header.
- DO NOT emit anything a section says is "not to be filled in by the applicant" — e.g. a "For Office Use Only" block, "Registration No.", a "Certificate by the Head of the Institution" section, or an office seal box.
- Signatures: emit ONLY the applicant's own signature line (type "signature"). Do NOT emit thumb-impression, parent/guardian signature, or head-of-institution signature boxes.
- Include applicant fields even when blank (value: "").
- Fields can share a row (e.g. PIN Code / District / State, or Course + Branch) — emit each separately with its own bbox.
- Distinguish "comb" from "choice": many small adjacent boxes for ONE value = comb; a few boxes each next to a WORD = choice.
- Be exhaustive. Every labelled blank, box-row, checkbox/radio group, and table the APPLICANT fills.
Output JSON only, no markdown fence.`;

export async function extractPage(kind, page, total = 4) {
  const key = loadKey();
  const imgPath = resolve(__dirname, "pages", `${kind}-${page}.png`);
  const b64 = readFileSync(imgPath).toString("base64");

  const body = {
    contents: [
      { parts: [
        { inline_data: { mime_type: "image/png", data: b64 } },
        { text: PROMPT({ page, total }) },
      ] },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 40000 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  let res, lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    lastErr = `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (res.status === 429 || res.status === 503 || res.status >= 500) {
      const wait = Math.min(2000 * 2 ** attempt, 30000) + Math.random() * 1000;
      process.stderr.write(`  (retry ${attempt + 1}, ${res.status}, wait ${Math.round(wait)}ms)\n`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(lastErr);
  const json = await res.json();
  const cand = json.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text).join("") ?? "";
  const parsed = parseLenientJson(text);
  if (!parsed) throw new Error("Non-JSON response:\n" + text.slice(0, 500));
  return { fields: parsed.fields ?? [], usage: json.usageMetadata };
}

/** Tolerate the model's occasional truncated JSON (STOP with a missing closer)
 *  by balancing unclosed strings/brackets. Mirrors app/api/vlm/extract/route.ts. */
function parseLenientJson(raw) {
  const s = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch { /* repair below */ }
  let inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let fixed = s;
  if (inStr) fixed += '"';
  fixed = fixed.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i] === "{" ? "}" : "]";
  try { return JSON.parse(fixed); } catch { return null; }
}

// gemini [ymin,xmin,ymax,xmax] 0-1000  ->  app {x,y,w,h} fraction 0-1
export function toAppBbox(g) {
  if (!Array.isArray(g) || g.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = g;
  return {
    x: +(xmin / 1000).toFixed(4),
    y: +(ymin / 1000).toFixed(4),
    w: +((xmax - xmin) / 1000).toFixed(4),
    h: +((ymax - ymin) / 1000).toFixed(4),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind = "filled", pageArg = "1"] = process.argv.slice(2);
  const { fields, usage } = await extractPage(kind, Number(pageArg), 4);
  console.log(JSON.stringify({ kind, page: Number(pageArg), usage, fields }, null, 2));
}
