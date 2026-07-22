/**
 * vlmClient.ts — browser-side helper that posts a rendered page image to the
 * server VLM route and returns the raw field schema. Kept tiny and separate so
 * analyzeForm can try it first and fall back to the legacy pipeline on failure.
 */
import type { VlmPage, VlmField } from "./vlmAdapter";

/** Canvas -> PNG Blob (promisified toBlob). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/png",
    );
  });
}

/** POST one page image to /api/vlm/extract. Throws on any non-OK response. */
export async function extractPageFields(image: Blob, page: number, total: number): Promise<VlmPage> {
  const fd = new FormData();
  fd.append("image", image, `page-${page}.png`);
  fd.append("page", String(page));
  fd.append("total", String(total));

  const res = await fetch("/api/vlm/extract", { method: "POST", body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`vlm route ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { page?: number; fields?: unknown[] };
  return {
    page: typeof data.page === "number" ? data.page : page - 1,
    fields: Array.isArray(data.fields) ? (data.fields as VlmField[]) : [],
  };
}
