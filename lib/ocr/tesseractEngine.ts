/**
 * tesseract.js wrapper. Worker, WASM core, and language data are all served
 * from /public — OCR never makes a network request beyond this origin.
 */
import type { Worker as TesseractWorker } from "tesseract.js";

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
}

export interface OcrResult {
  words: OcrWord[];
  lines: OcrLine[];
}

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress?: (progress: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        logger: (m) => {
          if (m.status === "recognizing text" && onProgress) {
            onProgress(m.progress);
          }
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Run OCR on a canvas; returns word + line boxes in canvas pixel coords. */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);

  const lines: OcrLine[] = (data.lines ?? []).map((line) => ({
    text: line.text.trim(),
    confidence: line.confidence,
    bbox: { ...line.bbox },
    words: (line.words ?? []).map((word) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: { ...word.bbox },
    })),
  }));

  return { words: lines.flatMap((l) => l.words), lines };
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      // already gone
    }
    workerPromise = null;
  }
}
