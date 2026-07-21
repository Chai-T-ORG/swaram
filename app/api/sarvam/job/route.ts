import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE_URL = "https://api.sarvam.ai/doc-digitization/job/v1";
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

function error(message: string, status: number, details?: string) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

/**
 * Starts a Sarvam Document Intelligence job. The browser sends a PDF for
 * every source: original PDFs pass through and photos are wrapped as a
 * one-page PDF by the client. Sarvam's upload API accepts PDFs or ZIPs only.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.SARWAM_DIGITALIZE_KEY;
    if (!apiKey) return error("Sarvam Document Intelligence is not configured", 503);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("A PDF file is required", 400);
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      return error("Sarvam requires a PDF upload", 400);
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return error("The PDF must be between 1 byte and 200 MB", 400);
    }

    const headers = {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    };
    const create = await fetch(BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        job_parameters: {
          // `language`, not `language_code`, is the Document Intelligence API parameter.
          language: "en-IN",
          output_format: "html",
        },
      }),
    });
    if (!create.ok) return error("Sarvam could not create an analysis job", 502, await create.text());
    const created = (await create.json()) as { job_id?: string };
    if (!created.job_id) return error("Sarvam returned no job identifier", 502);

    const uploadLinks = await fetch(`${BASE_URL}/upload-files`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job_id: created.job_id, files: [file.name] }),
    });
    if (!uploadLinks.ok) return error("Sarvam could not prepare the file upload", 502, await uploadLinks.text());
    const links = (await uploadLinks.json()) as {
      upload_urls?: Record<string, { file_url?: string } | string>;
    };
    const upload = links.upload_urls?.[file.name];
    const uploadUrl = typeof upload === "string" ? upload : upload?.file_url;
    if (!uploadUrl) return error("Sarvam returned no upload URL", 502);

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "x-ms-blob-type": "BlockBlob" },
      body: file,
    });
    if (!put.ok) return error("Sarvam could not receive the PDF", 502, await put.text());

    const start = await fetch(`${BASE_URL}/${created.job_id}/start`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!start.ok) return error("Sarvam could not start analysis", 502, await start.text());

    return NextResponse.json({ jobId: created.job_id });
  } catch (cause) {
    console.error("[sarvam] failed to start digitization job", cause);
    return error("Unable to start document analysis", 500);
  }
}
