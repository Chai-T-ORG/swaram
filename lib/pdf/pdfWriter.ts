/**
 * Writes answers back into the original form with pdf-lib.
 *
 * Three paths:
 *  - AcroForm PDFs: set field values directly and flatten.
 *  - Flat/scanned PDFs: draw text at each field's bbox, converted from
 *    fractional coordinates to PDF points using the page's real size.
 *  - Photographed images: embed the photo as the page background, then draw.
 *
 * Output is the original form, visually unchanged except for filled values.
 */
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { FormField } from "../types";

const INK = rgb(0.05, 0.05, 0.35);

function isYes(value: string): boolean {
  return /^(yes|y|true|checked|haan|ha)$/i.test(value.trim());
}

/** Shrink font size until text fits the box width (floor 8pt for legibility). */
function fitFontSize(font: PDFFont, text: string, maxWidth: number, start = 11): number {
  let size = start;
  while (size > 14 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawCheckmark(page: PDFPage, bbox: { x: number; y: number; w: number; h: number }, checkFont: PDFFont): void {
  const { width: pw, height: ph } = page.getSize();
  let boxX = bbox.x * pw;
  let boxW = Math.max(bbox.w * pw, 6);
  const boxH = Math.max(bbox.h * ph, 6);
  const boxBottom = ph - (bbox.y + bbox.h) * ph;
  
  if (boxW > boxH * 1.5) {
    boxX -= 18;
    boxW = 16;
  }

  const size = Math.min(Math.max(boxH * 0.9, 9), 15);
  page.drawText("✓", {
    x: boxX + Math.max((boxW - size * 0.8) / 2, 0.5),
    y: boxBottom + Math.max((boxH - size) / 2, 0.5),
    size,
    font: checkFont,
    color: INK,
  });
}

function drawAnswer(
  page: PDFPage,
  field: FormField,
  font: PDFFont,
  checkFont: PDFFont,
): void {
  if (!field.value.trim()) return;
  const { width: pw, height: ph } = page.getSize();

  // Choice with detected option positions: tick the box of EACH chosen option
  // (multi-select values arrive comma-separated, e.g. "Aadhaar copy, Mark lists").
  if (field.type === "choice" && field.options?.length && field.optionBboxes?.length) {
    const chosen = field.value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    let ticked = 0;
    for (const pick of chosen) {
      let index = field.options.findIndex((o) => o.trim().toLowerCase() === pick);
      if (index < 0) index = field.options.findIndex((o) => o.trim().toLowerCase().includes(pick) || pick.includes(o.trim().toLowerCase()));
      const target = index >= 0 ? field.optionBboxes[index] : null;
      if (target) {
        drawCheckmark(page, target, checkFont);
        ticked++;
      }
    }
    if (ticked > 0) return;
  }

  if (field.type === "signature") {
    // Signatures cannot be filled digitally via text overlay
    return;
  }

  if (field.type === "table" && field.cells) {
    try {
      const data = JSON.parse(field.value);
      if (Array.isArray(data)) {
        data.forEach((rowVals, r) => {
          if (!Array.isArray(rowVals)) return;
          rowVals.forEach((cellVal, c) => {
            const cellBbox = field.cells?.[r]?.[c];
            if (cellBbox && cellVal) {
              const strVal = String(cellVal).trim();
              if (!strVal) return;
              const boxX = cellBbox.x * pw;
              const boxW = cellBbox.w * pw;
              const boxH = cellBbox.h * ph;
              const boxBottom = ph - (cellBbox.y + cellBbox.h) * ph;
              const size = fitFontSize(font, strVal, Math.max(boxW - 2, 8));
              const baseline = boxBottom + Math.max(boxH * 0.22, 2.5);
              page.drawText(strVal, { x: boxX + 2, y: baseline, size, font, color: INK });
            }
          });
        });
      }
    } catch (e) {
      // Failed to parse table data, ignore
    }
    return;
  }

  if (!field.bbox) return;
  const boxX = field.bbox.x * pw;
  const boxW = Math.max(field.bbox.w * pw, 30);
  const boxH = field.bbox.h * ph;
  // bbox origin is top-left fraction; PDF origin is bottom-left points.
  const boxBottom = ph - (field.bbox.y + field.bbox.h) * ph;

  if (field.type === "checkbox" || (field.type === "choice" && field.bbox.w < 0.06)) {
    if (field.type === "checkbox" && !isYes(field.value)) return;
    drawCheckmark(page, field.bbox, checkFont);
    return;
  }

  const text = field.value.trim();

  if (field.combLength) {
    let chars: string[];
    if (field.type === "date") {
      chars = text.replace(/\D/g, "").split("");
    } else {
      // Smart fit: a name-style comb puts a blank box between words, so KEEP the
      // spaces when the spaced value already fits the boxes. Otherwise the
      // spaces are just grouping ("1234 5678 9012", "25 BCS 200") — STRIP them
      // so the characters land in their boxes. (If it doesn't fit even stripped
      // it's likely wrong; the draw loop truncates to combLength.)
      const spaced = text.split("");
      chars = spaced.length <= field.combLength ? spaced : text.replace(/\s+/g, "").split("");
    }
    // Precise path: one box per character (grouped combs / boxed dates). Used
    // only when we have a full parallel set of cells; otherwise fall through to
    // uniform division so nothing regresses.
    const cells = field.combCells;
    if (cells && chars.length > 0 && cells.length >= chars.length) {
      for (let i = 0; i < chars.length; i++) {
        const c = cells[i];
        const cx = c.x * pw;
        const cw = Math.max(c.w * pw, 4);
        const ch = Math.max(c.h * ph, 4);
        const cBottom = ph - (c.y + c.h) * ph;
        const size = fitFontSize(font, "W", cw - 2, 12);
        const charW = font.widthOfTextAtSize(chars[i], size);
        page.drawText(chars[i], {
          x: cx + (cw - charW) / 2,
          y: cBottom + Math.max(ch * 0.22, 2.5),
          size,
          font,
          color: INK,
        });
      }
      return;
    }

    const cellW = boxW / field.combLength;
    const size = fitFontSize(font, "W", cellW - 2, 12);
    const baseline = boxBottom + Math.max(boxH * 0.22, 2.5);
    for (let i = 0; i < Math.min(chars.length, field.combLength); i++) {
      const charW = font.widthOfTextAtSize(chars[i], size);
      const charX = boxX + i * cellW + (cellW - charW) / 2;
      page.drawText(chars[i], { x: charX, y: baseline, size, font, color: INK });
    }
    return;
  }

  // If it's a large box, wrap text.
  if (boxH > 28 && text.length > 30) {
    page.drawText(text, {
      x: boxX + 2,
      y: boxBottom + boxH - 12, // start near the top of the box
      size: 11,
      font,
      color: INK,
      maxWidth: boxW - 4,
      lineHeight: 14,
    });
    return;
  }

  const size = fitFontSize(font, text, boxW - 4);
  // A thin bbox IS the printed underline (the model boxes the line itself), so
  // sit the text just above its TOP edge — font-size-independent, so long fields
  // whose font shrinks don't drop onto the line. A tall bbox is an open answer
  // area: write near its bottom.
  // gboxToBBox floors h at 0.008, so a printed underline arrives as exactly
  // 0.008 — catch that (a real answer area is 0.011+).
  const isUnderline = field.bbox.h < 0.009;
  const baseline = isUnderline
    ? ph - field.bbox.y * ph + 3
    : boxBottom + Math.max(boxH * 0.22, size * 0.4);
  page.drawText(text, {
    x: boxX + 2,
    y: baseline,
    size,
    font,
    color: INK,
  });
}

/** Fill an AcroForm PDF by setting its embedded fields, then flatten. */
export async function fillAcroformPdf(original: ArrayBuffer, fields: FormField[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const form = doc.getForm();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  for (const field of fields) {
    if (!field.acroName || !field.value.trim()) continue;
    try {
      const raw = form.getField(field.acroName);
      if (raw instanceof PDFTextField) {
        raw.setText(field.value);
      } else if (raw instanceof PDFCheckBox) {
        if (isYes(field.value)) raw.check();
        else raw.uncheck();
      } else if (raw instanceof PDFRadioGroup || raw instanceof PDFDropdown) {
        const options = raw.getOptions();
        const match =
          options.find((o) => o.toLowerCase() === field.value.trim().toLowerCase()) ??
          options.find((o) => o.toLowerCase().includes(field.value.trim().toLowerCase()));
        if (match) raw.select(match);
      } else if (raw instanceof PDFOptionList) {
        const options = raw.getOptions();
        const match = options.find((o) => o.toLowerCase() === field.value.trim().toLowerCase());
        if (match) raw.select(match);
      }
    } catch {
      // Skip fields that fail; better a partially filled form than none.
    }
  }

  try {
    form.updateFieldAppearances(helvetica);
    form.flatten();
  } catch {
    // Some PDFs have broken appearance streams; leave interactive.
  }
  return doc.save();
}

/** Fill a flat (scanned/no-fields) PDF by drawing text at bbox coordinates. */
export async function fillFlatPdf(original: ArrayBuffer, fields: FormField[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const checkFont = await doc.embedFont(StandardFonts.ZapfDingbats);
  const pages = doc.getPages();

  for (const field of fields) {
    const page = pages[field.page];
    if (!page) continue;
    drawAnswer(page, field, font, checkFont);
  }
  return doc.save();
}

/** Build a PDF from a photographed form image, then draw the answers on top. */
export async function fillImageForm(imageBlob: Blob, fields: FormField[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bytes = await imageBlob.arrayBuffer();
  const isPng = imageBlob.type.includes("png");
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

  // Normalize to A4 width, preserving the photo's aspect ratio.
  const pageWidth = 595.28;
  const pageHeight = (image.height / image.width) * pageWidth;
  const page = doc.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const checkFont = await doc.embedFont(StandardFonts.ZapfDingbats);
  for (const field of fields) {
    if (field.page !== 0) continue;
    drawAnswer(page, field, font, checkFont);
  }
  return doc.save();
}

/** One entry point: routes to the right fill strategy. */
export async function generateFilledPdf(
  originalBlob: Blob,
  fields: FormField[],
  options: { sourceType: "pdf" | "image"; isAcroForm: boolean },
): Promise<Blob> {
  let bytes: Uint8Array;
  if (options.sourceType === "image") {
    bytes = await fillImageForm(originalBlob, fields);
  } else if (options.isAcroForm) {
    bytes = await fillAcroformPdf(await originalBlob.arrayBuffer(), fields);
  } else {
    bytes = await fillFlatPdf(await originalBlob.arrayBuffer(), fields);
  }
  return new Blob([bytes.slice().buffer], { type: "application/pdf" });
}
