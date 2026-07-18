import type { AnalysisProgress } from "./analyzeForm";

export interface SarvamResult {
  html?: string;
  pages: Record<string, SarvamPage>;
}

export interface SarvamPage {
  page_num: number;
  image_width: number;
  image_height: number;
  blocks: SarvamBlock[];
}

export interface SarvamBlock {
  block_id: string;
  coordinates: { x1: number; y1: number; x2: number; y2: number };
  layout_tag: string;
  confidence: number;
  reading_order: number;
  text: string;
}

export async function runSarvamDigitize(
  blob: Blob,
  onProgress: (progress: AnalysisProgress) => void
): Promise<SarvamResult> {
  onProgress({ stage: "ocr", pct: 0 }); // Use OCR stage to indicate text extraction

  // 1. Create Job and Upload
  const formData = new FormData();
  formData.append("file", blob, "document.pdf"); // Give a filename so backend knows type

  const res = await fetch("/api/sarvam/job", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to create Sarvam job: ${await res.text()}`);
  }

  const { jobId } = await res.json();
  onProgress({ stage: "ocr", pct: 0.1 });

  let pct = 0.1;
  // 2. Poll Status
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));
    
    // We are estimating progress by time since Sarvam doesn't give fractional progress
    pct = Math.min(0.9, pct + 0.05);
    onProgress({ stage: "ocr", pct }); 

    const statusRes = await fetch(`/api/sarvam/status?job_id=${jobId}`);
    if (!statusRes.ok) {
        throw new Error(`Failed to check Sarvam job status: ${await statusRes.text()}`);
    }

    const statusData = await statusRes.json();
    
    if (statusData.status === "Completed") {
      onProgress({ stage: "ocr", pct: 1 });
      return statusData.result;
    } else if (statusData.status === "Failed" || statusData.error) {
      throw new Error(`Sarvam job failed: ${JSON.stringify(statusData)}`);
    }
  }
}
