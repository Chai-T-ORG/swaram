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
  while (size > 8 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawCheckmark(page: PDFPage, bbox: { x: number; y: number; w: number; h: number }, checkFont: PDFFont): void {
  const { width: pw, height: ph } = page.getSize();
  const boxX = bbox.x * pw;
  const boxW = Math.max(bbox.w * pw, 6);
  const boxH = Math.max(bbox.h * ph, 6);
  const boxBottom = ph - (bbox.y + bbox.h) * ph;
  // U+2713 maps to the ZapfDingbats checkmark glyph.
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

  // Choice with detected option positions: tick the box of the chosen option.
  if (field.type === "choice" && field.options?.length && field.optionBboxes?.length) {
    const value = field.value.trim().toLowerCase();
    let index = field.options.findIndex((o) => o.trim().toLowerCase() === value);
    if (index < 0) index = field.options.findIndex((o) => o.trim().toLowerCase().includes(value) || value.includes(o.trim().toLowerCase()));
    const target = index >= 0 ? field.optionBboxes[index] : null;
    if (target) {
      drawCheckmark(page, target, checkFont);
      return;
    }
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
    // Strip spaces that might have been typed, e.g., for Aadhaar "1234 5678" -> "12345678"
    const chars = text.replace(/\s+/g, "").split("");
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

  const size = fitFontSize(font, text, boxW - 4);
  // The bbox bottom is the writing line — sit the text on it, not across it.
  const baseline = boxBottom + Math.max(boxH * 0.22, 2.5);
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
