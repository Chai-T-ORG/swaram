import { PDFDocument } from "pdf-lib";
import type { OcrLine, OcrWord } from "../ocr/tesseractEngine";
import type { AnalysisProgress } from "./analyzeForm";


export interface SarvamResult {
  pages: Record<string, unknown>;
}

type Coordinates = { x1: number; y1: number; x2: number; y2: number };
type SarvamBlock = {
  text?: string;
  confidence?: number;
  reading_order?: number;
  layout_tag?: string;
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
  if (!start.ok) throw new Error("Sarvam could not initiate document analysis.");
  const { jobId } = (await start.json()) as { jobId?: string };
  if (!jobId) throw new Error("Sarvam did not return a valid job identifier.");

  return new Promise((resolve, reject) => {
    // Establish the Server-Sent Events connection to the Next.js backend
    const eventSource = new EventSource(`/api/sarvam/stream?job_id=${encodeURIComponent(jobId)}`);
    let simulatedProgress = 0.08;

    eventSource.addEventListener("progress", () => {
      // Increment progress bar to ensure perceived performance remains high
      simulatedProgress = Math.min(0.92, simulatedProgress + 0.06);
      onProgress({ stage: "ocr", pct: simulatedProgress });
    });

    eventSource.addEventListener("complete", (event: MessageEvent) => {
      eventSource.close();
      try {
        const data = JSON.parse(event.data);
        onProgress({ stage: "ocr", pct: 1 });
        resolve({ pages: data.pages });
      } catch (err) {
        reject(new Error("Failed to parse the final Sarvam extraction payload."));
      }
    });

    eventSource.addEventListener("error", (event: MessageEvent) => {
      eventSource.close();
      const errorMessage = event.data ? JSON.parse(event.data).message : "SSE network connection lost.";
      reject(new Error(errorMessage));
    });
  });
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

  // Initialize an offscreen Canvas API context for precision typographic measurement
  const offscreen = typeof document !== 'undefined' ? document.createElement("canvas") : null;
  const ctx = offscreen ? offscreen.getContext("2d") : null;
  if (ctx) {
    // Utilize a standard sans-serif font rendering engine mapping to common form typography
    ctx.font = "16px sans-serif"; 
  }

  for (const block of findBlocks(page)
    .filter((block) => block.layout_tag !== "image")
    .sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0))) {
    
    const box = block.coordinates!;
    const textLines = (block.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!textLines.length) continue;
    
    const x0 = box.x1 * scaleX;
    const x1 = box.x2 * scaleX;
    const y0 = box.y1 * scaleY;
    const y1 = box.y2 * scaleY;
    const blockWidth = x1 - x0;
    const lineHeight = Math.max((y1 - y0) / textLines.length, 1);
    const confidence = Math.round((block.confidence ?? 0.8) * ((block.confidence ?? 0.8) <= 1 ? 100 : 1));

    textLines.forEach((text, index) => {
      const parts = text.split(/\s+/).filter(Boolean);
      
      // Calculate true geometric rendering weights via measureText, falling back to string length bounds
      const weights = parts.map((part) => ctx ? ctx.measureText(part).width : Math.max(part.length, 1));
      const spaceWeight = ctx ? ctx.measureText(" ").width : 1;
      
      const totalTextWidth = weights.reduce((sum, w) => sum + w, 0);
      const totalSpaceWidth = Math.max(parts.length - 1, 0) * spaceWeight;
      const totalWidth = totalTextWidth + totalSpaceWidth;

      let cursor = x0;
      const words: OcrWord[] = parts.map((part, wordIndex) => {
        const wordWidth = (weights[wordIndex] / Math.max(totalWidth, 1)) * blockWidth;
        const spaceOffset = (spaceWeight / Math.max(totalWidth, 1)) * blockWidth;
        
        const word = {
          text: part,
          confidence,
          bbox: { 
            x0: cursor, 
            y0: y0 + index * lineHeight, 
            x1: cursor + wordWidth, 
            y1: y0 + (index + 1) * lineHeight 
          },
        };
        cursor = word.bbox.x1 + spaceOffset;
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
