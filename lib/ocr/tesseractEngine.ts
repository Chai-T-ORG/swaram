/**
 * tesseract.js wrapper. Worker, WASM core, and language data are all served
 * from /public — OCR never makes a network request beyond this origin.
 */
import type { Worker as TesseractWorker } from "tesseract.js";
import { getVoiceSettings } from "../voice/voiceSettings";

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
let currentLang = "";

function resolveOcrLang(): string {
  if (typeof window === "undefined") return "eng";
  const sttLang = getVoiceSettings().sttLang || "en-IN";
  if (sttLang.startsWith("hi")) return "eng+hin";
  if (sttLang.startsWith("ml")) return "eng+mal";
  return "eng";
}

async function getWorker(
  lang: string,
  onProgress?: (progress: number) => void,
): Promise<TesseractWorker> {
  if (workerPromise && currentLang !== lang) {
    try {
      const oldWorker = await workerPromise;
      await oldWorker.terminate();
    } catch {
      // ignore
    }
    workerPromise = null;
  }

  if (!workerPromise) {
    currentLang = lang;
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const worker = await createWorker(lang, OEM.LSTM_ONLY, {
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
      currentLang = "";
    });
  }
  return workerPromise;
}

/** Run OCR on a canvas; returns word + line boxes in canvas pixel coords. */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number) => void,
  options?: { whitelist?: string; psm?: number },
): Promise<OcrResult> {
  const lang = resolveOcrLang();
  const worker = await getWorker(lang, onProgress);

  const params: Record<string, string> = {
    preserve_interword_spaces: "1",
  };
  if (options?.whitelist) {
    params.tessedit_char_whitelist = options.whitelist;
  } else {
    params.tessedit_char_whitelist = "";
  }
  if (options?.psm !== undefined) {
    params.tessedit_pageseg_mode = String(options.psm);
  } else {
    params.tessedit_pageseg_mode = "3";
  }

  await worker.setParameters(params);
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
    currentLang = "";
  }
}
