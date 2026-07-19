/**
 * Form analysis pipeline. Everything runs in the browser:
 *
 *   PDF -> AcroForm?  -> yes: read fields via pdf-lib (no OCR)
 *                     -> no:  Sarvam Document Intelligence -> render pages (pdf.js)
 *                             -> shapes (opencv.js, best-effort)
 *                             -> keyword dictionary matching
 *                             -> column clustering + reading order
 *   Image -> same OCR path on the photo.
 */
import type { BBox, FormField, PageDim } from "../types";
import { newId } from "../types";
import { detectAcroform, extractAcroformFields } from "../pdf/acroformDetector";
import { loadPdfDocument, renderPageToCanvas, imageBlobToCanvas } from "../pdf/pdfReader";
import type { OcrLine } from "../ocr/tesseractEngine";
import { detectShapes, loadOpenCv, type DetectedShape } from "../vision/shapeDetector";
import { matchLabel, normalizeLabel, isNonFillableLabel } from "../matching/keywordDictionary";
import { orderFields } from "../vision/fieldClusterer";
import { runSarvamDigitize, sarvamPageToLines } from "./sarvamApi";

export type AnalysisStage =
  | "reading"      // opening the file
  | "ocr"          // reading text
  | "layout"       // detecting shapes/layout
  | "fields"       // identifying fields
  | "ordering";    // preparing questions

export interface AnalysisProgress {
  stage: AnalysisStage;
  page?: number;
  pageCount?: number;
  /** 0..1 within the current stage. */
  pct?: number;
}

export interface AnalysisResult {
  isAcroForm: boolean;
  fields: FormField[];
  pageDims: PageDim[];
  pageCount: number;
  /** True when OpenCV failed to load and OCR-only heuristics were used. */
  shapesUnavailable: boolean;
}

const MAX_PAGES = 10;
const UNDERSCORE_RUN = /_{3,}|\.{6,}/;

export async function analyzeForm(
  blob: Blob,
  sourceType: "pdf" | "image",
  onProgress: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  onProgress({ stage: "reading" });

  if (sourceType === "pdf") {
    const bytes = await blob.arrayBuffer();
    const detection = await detectAcroform(bytes);
    if (detection.isAcroForm) {
      const { fields, pageDims, pageCount } = await extractAcroformFields(bytes);
      onProgress({ stage: "ordering", pct: 1 });
      return { isAcroForm: true, fields, pageDims, pageCount, shapesUnavailable: false };
    }
    return analyzeScannedPdf(blob, bytes, onProgress);
  }

  return analyzeImage(blob, onProgress);
}

async function analyzeScannedPdf(
  blob: Blob,
  bytes: ArrayBuffer,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  // Start warming OpenCV while pdf.js renders.
  const cvWarmup = loadOpenCv();
  const sarvam = await runSarvamDigitize(blob, "pdf", onProgress);

  const pdf = await loadPdfDocument(bytes);
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pageDims: PageDim[] = [];
  const allFields: FormField[] = [];
  let shapesUnavailable = false;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const rendered = await renderPageToCanvas(pdf, pageIndex + 1);
    pageDims.push({ width: rendered.pageWidthPts, height: rendered.pageHeightPts });

    onProgress({ stage: "layout", page: pageIndex + 1, pageCount });
    const cv = await cvWarmup;
    let shapes: DetectedShape[] = [];
    if (cv) {
      shapes = await detectShapes(rendered.canvas);
    } else {
      shapesUnavailable = true;
    }
    onProgress({ stage: "fields", page: pageIndex + 1, pageCount });
    const lines = sarvamPageToLines(sarvam.pages[String(pageIndex + 1)], rendered.canvas.width, rendered.canvas.height);
    allFields.push(
      ...await inferFieldsFromPage(
        mergeLinesIntoRows(lines),
        shapes,
        rendered.canvas.width,
        rendered.canvas.height,
        pageIndex,
        rendered.canvas,
      ),
    );

    rendered.canvas.width = 0; // release bitmap memory
  }
  await pdf.cleanup();

  onProgress({ stage: "ordering" });
  return {
    isAcroForm: false,
    fields: orderFields(allFields),
    pageDims,
    pageCount,
    shapesUnavailable,
  };
}

async function analyzeImage(
  blob: Blob,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  const cvWarmup = loadOpenCv();
  const canvas = await imageBlobToCanvas(blob);
  const sarvam = await runSarvamDigitize(blob, "image", onProgress);

  onProgress({ stage: "layout" });
  const cv = await cvWarmup;
  let shapes: DetectedShape[] = [];
  let shapesUnavailable = false;
  if (cv) {
    shapes = await detectShapes(canvas);
  } else {
    shapesUnavailable = true;
  }

  onProgress({ stage: "fields" });
  const lines = sarvamPageToLines(sarvam.pages["1"], canvas.width, canvas.height);
  const fields = await inferFieldsFromPage(mergeLinesIntoRows(lines), shapes, canvas.width, canvas.height, 0, canvas);

  onProgress({ stage: "ordering" });
  return {
    isAcroForm: false,
    fields: orderFields(fields),
    pageDims: [{ width: canvas.width, height: canvas.height }],
    pageCount: 1,
    shapesUnavailable,
  };
}

/* ------------------------------------------------------------------ */
/* Field inference: OCR lines + optional shapes -> normalized fields   */
/* ------------------------------------------------------------------ */

function toFraction(x: number, y: number, w: number, h: number, pw: number, ph: number): BBox {
  return {
    x: Math.max(0, Math.min(1, x / pw)),
    y: Math.max(0, Math.min(1, y / ph)),
    w: Math.max(0.01, Math.min(1, w / pw)),
    h: Math.max(0.008, Math.min(1, h / ph)),
  };
}

function overlapY(aTop: number, aBottom: number, bTop: number, bBottom: number): boolean {
  return aTop < bBottom && bTop < aBottom;
}

type Word = OcrLine["words"][number];

/**
 * Tesseract often splits one visual row into several "lines" when the text
 * is widely spaced ("Label:   [] Opt1   [] Opt2", or two-column layouts).
 * Merge lines that share a baseline back into single rows so the segment
 * and option-gap logic can see the whole picture.
 */
export function mergeLinesIntoRows(lines: OcrLine[]): OcrLine[] {
  const sorted = [...lines]
    .filter((l) => l.text.trim())
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const rows: OcrLine[] = [];

  for (const line of sorted) {
    const h = Math.max(line.bbox.y1 - line.bbox.y0, 8);
    const target = rows.find((row) => {
      const rh = Math.max(row.bbox.y1 - row.bbox.y0, 8);
      const overlap = Math.min(row.bbox.y1, line.bbox.y1) - Math.max(row.bbox.y0, line.bbox.y0);
      return overlap > Math.min(h, rh) * 0.55;
    });
    if (!target) {
      rows.push({
        text: line.text,
        confidence: line.confidence,
        bbox: { ...line.bbox },
        words: [...line.words],
      });
      continue;
    }
    target.words.push(...line.words);
    target.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    target.text = target.words.map((w) => w.text).join(" ");
    target.bbox = {
      x0: Math.min(target.bbox.x0, line.bbox.x0),
      y0: Math.min(target.bbox.y0, line.bbox.y0),
      x1: Math.max(target.bbox.x1, line.bbox.x1),
      y1: Math.max(target.bbox.y1, line.bbox.y1),
    };
    const words = target.words;
    target.confidence =
      words.length > 0 ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length : target.confidence;
  }

  return rows;
}

const UNDERSCORE_WORD = /^[_\-.—]{2,}:?$/;

function isUnderscoreWord(word: Word): boolean {
  return UNDERSCORE_WORD.test(word.text.trim()) || /_{3,}/.test(word.text);
}

interface WordGroup {
  words: Word[];
  text: string;
  x0: number;
  x1: number;
}

/**
 * Empty checkbox squares OCR into junk tokens ("O", "[]", "LJ", "1"...).
 * Drop them when reading option text so they don't break the grouping.
 */
const CHECKBOX_ARTIFACT = /^[^a-zA-Z0-9]{1,3}$|^[oO0dDcCuUjJlLiI]$|^[\[\](){}|]{1,2}[a-zA-Z]?$/;

function isCheckboxArtifact(word: Word): boolean {
  return CHECKBOX_ARTIFACT.test(word.text.trim());
}

/**
 * Split words into visually separated groups. A gap much wider than the
 * line's own character width means "next column/option starts here".
 */
function groupWordsByGap(words: Word[], pageW: number): WordGroup[] {
  const usable = words.filter(
    (w) => !isUnderscoreWord(w) && !isCheckboxArtifact(w) && w.text.trim(),
  );
  if (usable.length === 0) return [];
  const widths = usable
    .map((w) => (w.bbox.x1 - w.bbox.x0) / Math.max(w.text.length, 1))
    .sort((a, b) => a - b);
  const charW = widths[Math.floor(widths.length / 2)] || pageW * 0.008;
  const gapThreshold = Math.max(charW * 3.2, pageW * 0.028);

  const groups: WordGroup[] = [];
  let current: Word[] = [];
  for (const word of usable) {
    if (current.length > 0 && word.bbox.x0 - current[current.length - 1].bbox.x1 > gapThreshold) {
      groups.push(makeGroup(current));
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) groups.push(makeGroup(current));
  return groups;
}

function makeGroup(words: Word[]): WordGroup {
  return {
    words,
    text: words.map((w) => w.text).join(" ").trim(),
    x0: Math.min(...words.map((w) => w.bbox.x0)),
    x1: Math.max(...words.map((w) => w.bbox.x1)),
  };
}

function groupsLookLikeOptions(groups: WordGroup[]): boolean {
  return (
    groups.length >= 2 &&
    groups.length <= 6 &&
    groups.every((g) => g.words.length <= 4 && g.text.length >= 2 && g.text.length <= 32)
  );
}

export async function inferFieldsFromPage(
  lines: OcrLine[],
  shapes: DetectedShape[],
  pageW: number,
  pageH: number,
  pageIndex: number,
  canvas?: HTMLCanvasElement,
): Promise<FormField[]> {
  const fields: FormField[] = [];
  const usedShapes = new Set<DetectedShape>();

  // Letter counters ("D", "O", "Q"...) look like little squares to the shape
  // detector. A real checkbox is empty, so its center never falls inside an
  // OCR'd word — use that to drop the impostors.
  const realWords = lines
    .flatMap((l) => l.words)
    .filter((w) => !isUnderscoreWord(w) && !isCheckboxArtifact(w) && w.text.trim().length >= 2);
  const insideAWord = (s: DetectedShape) => {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return realWords.some(
      (w) => cx >= w.bbox.x0 && cx <= w.bbox.x1 && cy >= w.bbox.y0 && cy <= w.bbox.y1,
    );
  };

  const checkboxes = shapes.filter((s) => s.kind === "checkbox" && !insideAWord(s));
  const writables = shapes.filter((s) => s.kind === "line" || s.kind === "box");
  /** Vertical bands already consumed by a choice row (avoid duplicates). */
  const takenBands: { y0: number; y1: number }[] = [];

  const inTakenBand = (y0: number, y1: number) =>
    takenBands.some((band) => overlapY(y0, y1, band.y0, band.y1));

  /** Tick target for an option: a real checkbox shape if one sits just left, else a synthesized square. */
  function tickBoxFor(group: WordGroup, lineTop: number, lineBottom: number): BBox {
    const shape = checkboxes.find(
      (box) =>
        !usedShapes.has(box) &&
        overlapY(box.y, box.y + box.h, lineTop - 4, lineBottom + 4) &&
        box.x + box.w <= group.x0 + 4 &&
        group.x0 - (box.x + box.w) < pageW * 0.06,
    );
    if (shape) {
      usedShapes.add(shape);
      return toFraction(shape.x, shape.y, shape.w, shape.h, pageW, pageH);
    }
    const size = Math.max((lineBottom - lineTop) * 0.75, pageW * 0.012);
    return toFraction(Math.max(group.x0 - size - 6, 0), lineTop, size, size, pageW, pageH);
  }

  function pushChoice(
    label: string,
    dict: ReturnType<typeof matchLabel>,
    groups: WordGroup[],
    lineTop: number,
    lineBottom: number,
    confidence: number,
  ) {
    const options = groups.map((g) => cleanLabelText(g.text));
    const optionBboxes = groups.map((g) => tickBoxFor(g, lineTop, lineBottom));
    fields.push({
      id: newId(),
      label: dict?.label ?? cleanLabelText(label),
      type: "choice",
      options,
      optionBboxes,
      page: pageIndex,
      bbox: optionBboxes[0],
      order: fields.length,
      confidence: Math.round(confidence),
      source: "ocr",
      profileKey: dict?.profileKey,
      sensitive: dict?.sensitive,
      value: "",
      status: "pending",
    });
    takenBands.push({ y0: lineTop, y1: lineBottom });
  }

  /* --- Pass A: rows of detected checkbox squares -> choice fields --- */
  const rows: DetectedShape[][] = [];
  for (const box of [...checkboxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - box.y) < box.h * 1.5);
    if (row) row.push(box);
    else rows.push([box]);
  }

  for (const row of rows) {
    if (row.length < 2) continue; // single boxes are handled by the text pass
    row.sort((a, b) => a.x - b.x);
    const rowTop = Math.min(...row.map((b) => b.y));
    const rowBottom = Math.max(...row.map((b) => b.y + b.h));

    const options = row.map((box, i) => {
      const nextX = i + 1 < row.length ? row[i + 1].x : pageW;
      return wordsNear(lines, box, pageW, nextX) || `Option ${i + 1}`;
    });
    const labelLine = findLabelLineForRow(lines, rowTop, rowBottom, options);
    const labelText = labelLine ? labelLine.text.split(":")[0] : options.join(" or ");
    const dict = labelLine ? matchLabel(labelText) : null;
    if (isNonFillableLabel(labelText)) continue;

    fields.push({
      id: newId(),
      label: dict?.label ?? cleanLabelText(labelText),
      type: "choice",
      options,
      optionBboxes: row.map((box) => toFraction(box.x, box.y, box.w, box.h, pageW, pageH)),
      page: pageIndex,
      bbox: toFraction(row[0].x, row[0].y, row[0].w, row[0].h, pageW, pageH),
      order: fields.length,
      confidence: Math.round(labelLine?.confidence ?? 70),
      source: "ocr",
      profileKey: dict?.profileKey,
      sensitive: dict?.sensitive,
      value: "",
      status: "pending",
    });
    row.forEach((b) => usedShapes.add(b));
    takenBands.push({ y0: rowTop, y1: rowBottom });
  }

  /* --- Pass B: text lines -> text/date/choice fields --- */
  let pendingHeader: { label: string; dict: ReturnType<typeof matchLabel>; y1: number; lineHeight: number } | null =
    null;

  for (const line of lines) {
    const raw = line.text.trim();
    if (!raw || raw.length < 2) continue;
    const lineHeight = Math.max(line.bbox.y1 - line.bbox.y0, 10);
    if (inTakenBand(line.bbox.y0, line.bbox.y1)) continue;

    // "(tick one)" style headers: the next line holds the options.
    if (/\b(tick|choose|select)\b.*\b(one|any)\b|\(tick/i.test(raw)) {
      const headerLabel = raw
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/\((tick|choose|select)[^)]*\)/gi, "")
        .replace(/\b(tick|choose|select)\s+(one|any)\b/gi, "")
        .trim();
      pendingHeader = {
        label: headerLabel || raw,
        dict: matchLabel(headerLabel),
        y1: line.bbox.y1,
        lineHeight,
      };
      continue;
    }

    // Options line under a pending header.
    if (pendingHeader && line.bbox.y0 - pendingHeader.y1 < pendingHeader.lineHeight * 4) {
      const groups = groupWordsByGap(line.words, pageW);
      if (groupsLookLikeOptions(groups)) {
        pushChoice(pendingHeader.label, pendingHeader.dict, groups, line.bbox.y0, line.bbox.y1, line.confidence);
        pendingHeader = null;
        continue;
      }
    }
    if (pendingHeader && line.bbox.y0 - pendingHeader.y1 >= pendingHeader.lineHeight * 4) {
      pendingHeader = null;
    }

    // Several "Label:" tokens on one line -> one field per segment.
    const segments = splitLineSegments(line);
    if (segments.length > 1) {
      for (const segment of segments) {
        if (!segment.labelText || segment.labelText.length < 2) continue;
        if (isNonFillableLabel(segment.labelText)) continue;
        const dict = matchLabel(segment.labelText);
        if (!dict && segment.labelText.split(/\s+/).length > 6) continue;
        if (fields.some((f) => labelsEqual(f.label, segment.labelText) || (dict && f.label === dict.label))) continue;
        fields.push({
          id: newId(),
          label: dict?.label ?? cleanLabelText(segment.labelText),
          type: dict?.type ?? "text",
          options: dict?.type === "choice" ? dict.options : undefined,
          page: pageIndex,
          bbox: toFraction(
            segment.answerX0,
            line.bbox.y0,
            Math.max(segment.answerX1 - segment.answerX0, pageW * 0.08),
            Math.max(lineHeight * 1.2, 14),
            pageW,
            pageH,
          ),
          order: fields.length,
          confidence: Math.round(segment.confidence),
          source: "ocr",
          profileKey: dict?.profileKey,
          sensitive: dict?.sensitive,
          value: "",
          status: "pending",
        });
      }
      continue;
    }

    // --- Single-label line. Work from word geometry, not raw text. ---
    const words = line.words.filter((w) => w.text.trim());
    if (words.length === 0) continue;

    const colonIdx = (() => {
      for (let i = 0; i < words.length; i++) {
        if (/:$/.test(words[i].text.trim()) && !isUnderscoreWord(words[i])) return i;
      }
      return -1;
    })();

    const labelWords = (colonIdx >= 0 ? words.slice(0, colonIdx + 1) : words).filter(
      (w) => !isUnderscoreWord(w),
    );
    if (labelWords.length === 0) continue;
    const labelPart = cleanLabelText(labelWords.map((w) => w.text).join(" "));
    if (!labelPart || labelPart.length < 2) continue;
    if (isNonFillableLabel(labelPart)) continue;

    const labelEndX = Math.max(...labelWords.map((w) => w.bbox.x1));
    const underscoreWords = words.filter(isUnderscoreWord);
    const hasUnderscores = underscoreWords.length > 0 || UNDERSCORE_RUN.test(raw);
    const endsWithColon = colonIdx >= 0;
    const dict = matchLabel(labelPart);

    // Options printed right on the line after the colon -> choice field.
    if (colonIdx >= 0) {
      const postWords = words.slice(colonIdx + 1);
      const groups = groupWordsByGap(postWords, pageW);
      if (groupsLookLikeOptions(groups) && (dict?.type === "choice" || groups.length >= 3 || checkboxes.length > 0)) {
        pushChoice(labelPart, dict, groups, line.bbox.y0, line.bbox.y1, line.confidence);
        continue;
      }
    }

    // A writable shape counts as evidence: on the same row after the label,
    // or directly below — but "below" only for real label candidates, so
    // stray box edges (photo frames etc.) can't adopt random short lines.
    const isLabelCandidate = Boolean(dict) || endsWithColon || hasUnderscores;
    const shape = writables.find((s) => {
      if (usedShapes.has(s)) return false;
      const sameRow =
        overlapY(s.y, s.y + Math.max(s.h, 4), line.bbox.y0 - lineHeight * 0.3, line.bbox.y1 + lineHeight * 0.6) &&
        s.x >= labelEndX - 12 &&
        s.x <= line.bbox.x1 + pageW * 0.35;
      const below =
        (isLabelCandidate || labelWords.length <= 3) &&
        s.y > line.bbox.y1 &&
        s.y < line.bbox.y1 + lineHeight * 1.8 &&
        s.x < labelEndX + pageW * 0.05 &&
        s.x + s.w > line.bbox.x0;
      return sameRow || below;
    });

    if (!dict && !endsWithColon && !hasUnderscores && !shape) continue;
    if (!dict && labelWords.length > 8) continue;
    if (fields.some((f) => labelsEqual(f.label, labelPart) || (dict && f.label === dict.label))) continue;

    let bbox: BBox;
    if (shape) {
      usedShapes.add(shape);
      // For an underline, the write area sits on top of it.
      bbox = toFraction(
        shape.x,
        shape.kind === "line" ? shape.y - lineHeight * 1.1 : shape.y,
        shape.w,
        shape.kind === "line" ? lineHeight * 1.15 : Math.max(shape.h, lineHeight * 1.2),
        pageW,
        pageH,
      );
    } else if (underscoreWords.length > 0) {
      // Blank run inside the OCR line: write exactly over it.
      const startX = Math.max(labelEndX + 6, Math.min(...underscoreWords.map((w) => w.bbox.x0)));
      const endX = Math.max(...underscoreWords.map((w) => w.bbox.x1));
      bbox = toFraction(startX, line.bbox.y0, Math.max(endX - startX, pageW * 0.08), Math.max(lineHeight * 1.2, 14), pageW, pageH);
    } else {
      // No visible blank: from the end of the label to the right margin.
      const startX = Math.min(labelEndX + 8, pageW * 0.9);
      const width = Math.max(pageW * 0.94 - startX, pageW * 0.15);
      bbox = toFraction(startX, line.bbox.y0, width, Math.max(lineHeight * 1.2, 14), pageW, pageH);
    }

    const labelConfidence =
      labelWords.reduce((sum, w) => sum + w.confidence, 0) / labelWords.length;

    fields.push({
      id: newId(),
      label: dict?.label ?? labelPart,
      type: dict?.type ?? "text",
      options: dict?.type === "choice" ? dict.options : undefined,
      page: pageIndex,
      bbox,
      order: fields.length,
      confidence: Math.round(labelConfidence),
      source: "ocr",
      profileKey: dict?.profileKey,
      sensitive: dict?.sensitive,
      value: "",
      status: "pending",
    });
  }

  // --- Post-processing: snap inferred answers to detected writable shapes ---
  const medianLineHeight = (() => {
    const heights = lines.map((l) => l.bbox.y1 - l.bbox.y0).filter((h) => h > 0);
    if (heights.length === 0) return 14;
    heights.sort((a, b) => a - b);
    return heights[Math.floor(heights.length / 2)];
  })();

  if (canvas) {
    for (const field of fields) {
      if (field.type !== "checkbox" && field.bbox) {
        field.bbox = snapToNearestShape(field.bbox, shapes, pageW, pageH, medianLineHeight);
      }
    }
  }

  return fields.slice(0, 50);
}

function snapToNearestShape(
  bbox: BBox,
  shapes: DetectedShape[],
  pageW: number,
  pageH: number,
  lineHeight: number,
): BBox {
  const bx = bbox.x * pageW;
  const by = bbox.y * pageH;
  const bw = bbox.w * pageW;
  const bh = bbox.h * pageH;

  const tolerance = lineHeight * 1.5;
  const bestShape = shapes.find((s) => {
    if (s.kind !== "line" && s.kind !== "box") return false;
    const sameRow = Math.abs(s.y - (by + bh)) < tolerance || Math.abs(s.y - by) < tolerance;
    const horizontalOverlap = s.x < bx + bw && s.x + s.w > bx;
    return sameRow && horizontalOverlap;
  });

  if (bestShape) {
    return toFraction(
      bestShape.x,
      bestShape.kind === "line" ? bestShape.y - lineHeight * 1.1 : bestShape.y,
      bestShape.w,
      bestShape.kind === "line" ? lineHeight * 1.15 : Math.max(bestShape.h, lineHeight * 1.2),
      pageW,
      pageH,
    );
  }
  return bbox;
}

function labelsEqual(a: string, b: string): boolean {
  return normalizeLabel(a) === normalizeLabel(b);
}

interface LineSegment {
  labelText: string;
  confidence: number;
  /** Answer write-area, canvas pixels. */
  answerX0: number;
  answerX1: number;
}

/**
 * Split a line at words ending with ":" — two or more of them means the
 * line holds several fields side by side. Underscore runs are treated as
 * answer space, not label text.
 */
function splitLineSegments(line: OcrLine): LineSegment[] {
  const words = line.words;
  const colonIdx = words
    .map((w, i) => (/:$/.test(w.text.trim()) && !isUnderscoreWord(w) ? i : -1))
    .filter((i) => i >= 0);
  if (colonIdx.length < 2) return [];

  const segments: LineSegment[] = [];
  let start = 0;
  for (let k = 0; k < colonIdx.length; k++) {
    const end = colonIdx[k];
    const labelWords = words.slice(start, end + 1).filter((w) => !isUnderscoreWord(w));
    const labelText = labelWords
      .map((w) => w.text)
      .join(" ")
      .replace(/:$/, "")
      .trim();
    const nextLabelStart = k + 1 < colonIdx.length ? findSegmentStart(words, end + 1, colonIdx[k + 1]) : -1;
    const answerX0 = words[end].bbox.x1 + 6;
    const answerX1 = nextLabelStart >= 0 ? words[nextLabelStart].bbox.x0 - 8 : line.bbox.x1 + 40;
    const confidence =
      labelWords.length > 0
        ? labelWords.reduce((sum, w) => sum + w.confidence, 0) / labelWords.length
        : line.confidence;
    segments.push({ labelText, confidence, answerX0, answerX1 });
    start = nextLabelStart >= 0 ? nextLabelStart : end + 1;
  }
  return segments;
}

/** First non-underscore word between two colon words — the next label's start. */
function findSegmentStart(words: OcrLine["words"], from: number, colonAt: number): number {
  for (let i = from; i <= colonAt; i++) {
    if (!/^[_\-.]+$/.test(words[i].text.trim())) return i;
  }
  return colonAt;
}

function cleanLabelText(text: string): string {
  return text
    .replace(UNDERSCORE_RUN, " ")
    .replace(/[|®©™[\]]/g, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[:*]+\s*$/, "")
    .trim();
}

/** Text immediately to the right of a checkbox (its option label). */
function wordsNear(lines: OcrLine[], box: DetectedShape, pageW: number, stopAtX = Infinity): string {
  const maxDistance = Math.min(box.w * 6, pageW * 0.18);
  const picked: string[] = [];
  for (const line of lines) {
    if (!overlapY(line.bbox.y0, line.bbox.y1, box.y - box.h * 0.5, box.y + box.h * 1.5)) continue;
    for (const word of line.words) {
      if (
        word.bbox.x0 >= box.x + box.w &&
        word.bbox.x0 <= Math.min(box.x + box.w + maxDistance, stopAtX - 4)
      ) {
        picked.push(word.text);
        if (picked.join(" ").length > 28) break;
      }
    }
    if (picked.length) break;
  }
  return cleanLabelText(picked.join(" "));
}

function findLabelLineForRow(
  lines: OcrLine[],
  rowTop: number,
  rowBottom: number,
  options: string[],
): OcrLine | null {
  const optionSet = new Set(options.map(normalizeLabel));
  let best: OcrLine | null = null;
  let bestDistance = Infinity;
  for (const line of lines) {
    const text = normalizeLabel(line.text);
    if (!text || optionSet.has(text)) continue;
    const height = Math.max(line.bbox.y1 - line.bbox.y0, 10);
    const distance = rowTop - line.bbox.y1;
    if (distance > height * 3.5 || line.bbox.y0 > rowBottom) continue;
    const d = Math.abs(distance);
    if (d < bestDistance) {
      bestDistance = d;
      best = line;
    }
  }
  return best;
}
