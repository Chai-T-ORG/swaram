/**
 * pdf.js wrapper: renders PDF pages to canvases for OCR and previews.
 * The worker is served from /public so nothing loads from a CDN.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  return pdfjs.getDocument({ data: data.slice(0) }).promise;
}

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  /** Page size in PDF points (72 dpi units). */
  pageWidthPts: number;
  pageHeightPts: number;
  /** Pixels per PDF point at the rendered scale. */
  scale: number;
}

/**
 * Render one page (1-based) to a canvas, targeting a pixel width good for
 * OCR (~1800px) without exploding memory on large pages.
 */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  targetWidth = 1800,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(Math.max(targetWidth / baseViewport.width, 1), 4);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas context");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return {
    canvas,
    pageWidthPts: baseViewport.width,
    pageHeightPts: baseViewport.height,
    scale,
  };
}

/** Draw an image blob onto a canvas (for the scan/photo path). */
export async function imageBlobToCanvas(blob: Blob, maxWidth = 2200): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
