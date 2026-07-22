/**
 * Canonical extraction prompt for the VLM form analyzer. Kept in one place so
 * the API route is the single source of truth. (The standalone harness in
 * form-test/vlm/ carries a copy for offline experiments — keep them in sync.)
 */
export function buildExtractionPrompt(page: number, total: number): string {
  return `You are an expert form-layout analyzer for a voice accessibility app that fills forms for blind users in India. You are given ONE page image — page ${page} of ${total} — of a scanned/printed application form.

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
- "combLength": for "comb", the number of character cells. ALSO include it for a "date" that is written into per-character boxes (e.g. D D / M M / Y Y Y Y) — set it to the number of DIGIT cells (usually 8). Omit for a date written on a plain line.
- "cellBboxes": ONLY when a comb's cells are SPLIT INTO GROUPS with visible gaps (Aadhaar 4-4-4, a boxed date D D / M M / Y Y Y Y) — an array with ONE [ymin,xmin,ymax,xmax] per character cell, left to right, count matching combLength. Each entry is that single cell's box. This makes every digit land in its own box. OMIT it for a plain contiguous run of equal boxes (PAN, Mobile, IFSC) where uniform spacing already works.
- "value": the answer ALREADY filled on this form.
    * choice   -> the selected option label(s) that are ticked / encircled. "" if none. If several are ticked, return them all.
    * comb/text/date -> the written characters with normal spacing (Aadhaar "482177349210", name "ANJALI S NAIR", date "14/07/2007"). "" if blank.
- "bbox": the ANSWER region where the value goes (NOT the printed label). Format [ymin, xmin, ymax, xmax] as integers 0-1000 normalized to the image. For "choice", enclose the full span of all options. Be precise — the box must tightly cover the writable area / boxes / option row.
- "confidence": integer 0-100 — how sure you are you read this field and any filled value correctly. Lower it for faint / handwritten / ambiguous content.

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
}
