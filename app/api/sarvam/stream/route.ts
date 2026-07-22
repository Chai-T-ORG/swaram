import { NextRequest } from "next/server";
import AdmZip from "adm-zip";

// Enforce dynamic execution and the robust Node.js runtime for stream longevity
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE_URL = "https://api.sarvam.ai/doc-digitization/job/v1";
const POLL_INTERVAL_MS = 2500;
const TIMEOUT_MS = 90000;

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("job_id");
  const apiKey = process.env.SARWAM_DIGITALIZE_KEY;

  if (!jobId || !apiKey) {
    return new Response("Missing parameters or API configuration", { status: 400 });
  }

  let isStreamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Helper utility to safely format and enqueue SSE payloads
      const sendEvent = (event: string, data: any) => {
        if (!isStreamClosed) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };

      const startTime = Date.now();
      const headers = { "api-subscription-key": apiKey, "Content-Type": "application/json" };

      try {
        while (Date.now() - startTime < TIMEOUT_MS && !isStreamClosed) {
          const statusRes = await fetch(`${BASE_URL}/${encodeURIComponent(jobId)}/status`, { headers });
          
          if (!statusRes.ok) {
            sendEvent("error", { message: "Sarvam status telemetry request failed." });
            break;
          }

          const status = await statusRes.json();
          sendEvent("progress", { status: status.job_state });

          if (status.job_state === "Completed") {
            // Initiate artifact download upon successful terminal state
            const downloads = await fetch(`${BASE_URL}/${encodeURIComponent(jobId)}/download-files`, { 
              method: "POST", 
              headers, 
              body: "{}" 
            });
            const downloadData = await downloads.json();
            
            const firstLink = Object.values(downloadData.download_urls ?? {})[0] as any;
            const url = typeof firstLink === "string" ? firstLink : firstLink?.file_url;
            
            if (!url) throw new Error("Sarvam returned a completed status but no artifact URL.");

            // Download and extract the ZIP archive directly within the server stream memory
            const archiveResponse = await fetch(url);
            const buffer = await archiveResponse.arrayBuffer();
            const archive = new AdmZip(Buffer.from(buffer));
            const pages: Record<string, unknown> = {};
            
            for (const entry of archive.getEntries()) {
              if (!entry.isDirectory && entry.entryName.endsWith(".json")) {
                 const match = entry.entryName.match(/page[_-]?(\d+)/i);
                 if (match) {
                   pages[String(match[1])] = JSON.parse(entry.getData().toString("utf8"));
                 }
              }
            }
            
            sendEvent("complete", { pages });
            break;
          }

          if (status.job_state === "Failed" || status.error_message) {
            sendEvent("error", { message: status.error_message || "Sarvam Document Intelligence failed." });
            break;
          }

          // Yield execution thread, awaiting the next polling cycle
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } catch (err) {
        sendEvent("error", { message: "Stream processing encountered an unrecoverable exception." });
      } finally {
        if (!isStreamClosed) {
          controller.close();
        }
      }
    },
    cancel() {
      // Handle client disconnects gracefully to prevent memory leaks
      isStreamClosed = true;
    }
  });

  // Return the stream with strict headers to bypass proxy buffering mechanisms
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
