import AdmZip from "adm-zip";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE_URL = "https://api.sarvam.ai/doc-digitization/job/v1";

type PageResult = Record<string, unknown>;

function pageNumberFromName(name: string): number | null {
  const match = name.match(/page[_-]?(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** Polls a job and returns raw page JSON only after Sarvam has completed it. */
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("job_id");
    const apiKey = process.env.SARWAM_DIGITALIZE_KEY;
    if (!jobId) return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "Sarvam Document Intelligence is not configured" }, { status: 503 });

    const headers = { "api-subscription-key": apiKey, "Content-Type": "application/json" };
    const statusResponse = await fetch(`${BASE_URL}/${encodeURIComponent(jobId)}/status`, { headers });
    if (!statusResponse.ok) {
      return NextResponse.json({ error: "Sarvam status request failed" }, { status: 502 });
    }
    const status = (await statusResponse.json()) as { job_state?: string; error_message?: string };
    if (status.job_state !== "Completed") {
      return NextResponse.json({ status: status.job_state ?? "Unknown", error: status.error_message || undefined });
    }

    const downloads = await fetch(`${BASE_URL}/${encodeURIComponent(jobId)}/download-files`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!downloads.ok) return NextResponse.json({ error: "Sarvam result request failed" }, { status: 502 });
    const downloadData = (await downloads.json()) as {
      download_urls?: Record<string, { file_url?: string } | string>;
    };
    const first = Object.values(downloadData.download_urls ?? {})[0];
    const url = typeof first === "string" ? first : first?.file_url;
    if (!url) return NextResponse.json({ error: "Sarvam returned no result file" }, { status: 502 });

    const archiveResponse = await fetch(url);
    if (!archiveResponse.ok) return NextResponse.json({ error: "Could not download Sarvam result" }, { status: 502 });
    const archive = new AdmZip(Buffer.from(await archiveResponse.arrayBuffer()));
    const pages: Record<string, PageResult> = {};
    for (const entry of archive.getEntries()) {
      if (entry.isDirectory || !entry.entryName.endsWith(".json")) continue;
      const pageNumber = pageNumberFromName(entry.entryName);
      if (!pageNumber) continue;
      try {
        pages[String(pageNumber)] = JSON.parse(entry.getData().toString("utf8")) as PageResult;
      } catch {
        // A malformed auxiliary JSON file must not prevent usable pages from returning.
      }
    }
    return NextResponse.json({ status: "Completed", pages });
  } catch (cause) {
    console.error("[sarvam] failed to read digitization result", cause);
    return NextResponse.json({ error: "Unable to retrieve document analysis" }, { status: 500 });
  }
}
