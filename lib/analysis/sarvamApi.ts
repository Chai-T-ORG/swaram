import { PDFDocument } from "pdf-lib";
import type { OcrLine, OcrWord } from "../ocr/tesseractEngine";
import type { AnalysisProgress } from "./analyzeForm";

const POLL_INTERVAL_MS = 2_500;
const POLL_TIMEOUT_MS = 90_000;

export interface SarvamResult {
  pages: Record<string, unknown>;
}

type Coordinates = { x1: number; y1: number; x2: number; y2: number };
type SarvamBlock = {
  text?: string;
  confidence?: number;
  reading_order?: number;
  coordinates?: Coordinates;
};

/** Convert a camera JPEG/PNG to a one-page PDF, the format Sarvam accepts. */
async function imageToPdf(image: Blob): Promise<File> {
  const pdf = await PDFDocument.create();
  const bytes = await image.arrayBuffer();
  const embedded = image.type === "image/png"
    ? await pdf.embedPng(bytes)
    : await pdf.embedJpg(bytes);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  const output = await pdf.save();
  const outputBuffer = new ArrayBuffer(output.byteLength);
  new Uint8Array(outputBuffer).set(output);
  return new File([outputBuffer], "camera-scan.pdf", { type: "application/pdf" });
}

export async function createSarvamUpload(blob: Blob, sourceType: "pdf" | "image"): Promise<File> {
  if (sourceType === "image") return imageToPdf(blob);
  return new File([blob], "form.pdf", { type: "application/pdf" });
}

export async function runSarvamDigitize(
  blob: Blob,
  sourceType: "pdf" | "image",
  onProgress: (progress: AnalysisProgress) => void,
): Promise<SarvamResult> {
  onProgress({ stage: "ocr", pct: 0 });
  const form = new FormData();
  form.append("file", await createSarvamUpload(blob, sourceType));
  const start = await fetch("/api/sarvam/job", { method: "POST", body: form });
  if (!start.ok) throw new Error("Sarvam could not start document analysis");
  const { jobId } = (await start.json()) as { jobId?: string };
  if (!jobId) throw new Error("Sarvam did not return a job identifier");

  const startedAt = Date.now();
  let progress = 0.08;
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    progress = Math.min(0.92, progress + 0.06);
    onProgress({ stage: "ocr", pct: progress });
    const response = await fetch(`/api/sarvam/status?job_id=${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error("Sarvam status check failed");
    const result = (await response.json()) as { status?: string; pages?: Record<string, unknown>; error?: string };
    if (result.status === "Completed" && result.pages) {
      onProgress({ stage: "ocr", pct: 1 });
      return { pages: result.pages };
    }
    if (result.status === "Failed" || result.error) throw new Error(result.error || "Sarvam could not analyze this document");
  }
  throw new Error("Sarvam analysis timed out. Please try again.");
}

function isBlock(value: unknown): value is SarvamBlock {
  return Boolean(value && typeof value === "object" && "text" in value && "coordinates" in value);
}

function findBlocks(value: unknown): SarvamBlock[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.blocks)) return record.blocks.filter(isBlock);
  for (const candidate of Object.values(record)) {
    const found = findBlocks(candidate);
    if (found.length) return found;
  }
  return [];
}

function imageDimension(page: unknown, key: "image_width" | "image_height"): number | null {
  if (!page || typeof page !== "object") return null;
  const value = (page as Record<string, unknown>)[key];
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * Sarvam provides reliable coordinates for each text block. It does not expose
 * per-word boxes in the page JSON, so words are proportionally placed only
 * within their own real block rectangle; no coordinates are invented outside
 * that rectangle.
 */
export function sarvamPageToLines(page: unknown, canvasWidth: number, canvasHeight: number): OcrLine[] {
  const width = imageDimension(page, "image_width") ?? canvasWidth;
  const height = imageDimension(page, "image_height") ?? canvasHeight;
  const scaleX = canvasWidth / width;
  const scaleY = canvasHeight / height;
  const lines: OcrLine[] = [];

  for (const block of findBlocks(page).sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0))) {
    const box = block.coordinates!;
    const textLines = (block.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!textLines.length) continue;
    const x0 = box.x1 * scaleX;
    const x1 = box.x2 * scaleX;
    const y0 = box.y1 * scaleY;
    const y1 = box.y2 * scaleY;
    const lineHeight = Math.max((y1 - y0) / textLines.length, 1);
    const confidence = Math.round((block.confidence ?? 0.8) * ((block.confidence ?? 0.8) <= 1 ? 100 : 1));

    textLines.forEach((text, index) => {
      const parts = text.split(/\s+/).filter(Boolean);
      const weights = parts.map((part) => Math.max(part.length, 1));
      const total = weights.reduce((sum, item) => sum + item, 0) + Math.max(parts.length - 1, 0);
      let cursor = x0;
      const words: OcrWord[] = parts.map((part, wordIndex) => {
        const wordWidth = ((x1 - x0) * weights[wordIndex]) / Math.max(total, 1);
        const word = {
          text: part,
          confidence,
          bbox: { x0: cursor, y0: y0 + index * lineHeight, x1: cursor + wordWidth, y1: y0 + (index + 1) * lineHeight },
        };
        cursor = word.bbox.x1 + (x1 - x0) / Math.max(total, 1);
        return word;
      });
      if (words.length) {
        lines.push({
          text,
          confidence,
          bbox: { x0, y0: y0 + index * lineHeight, x1, y1: y0 + (index + 1) * lineHeight },
          words,
        });
      }
    });
  }
  return lines;
}
