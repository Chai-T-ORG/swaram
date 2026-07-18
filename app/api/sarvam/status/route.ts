import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) {
      return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
    }

    const apiKey = process.env.SARWAM_DIGITALIZE_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SARWAM_DIGITALIZE_KEY missing" }, { status: 500 });
    }

    // Check status
    const statusRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/status`, {
      method: "GET",
      headers: {
        "api-subscription-key": apiKey,
      },
    });
    
    if (!statusRes.ok) {
        return NextResponse.json({ error: "Failed to fetch status", details: await statusRes.text() }, { status: 500 });
    }
    const statusData = await statusRes.json();

    if (statusData.job_state === "Completed") {
      // Fetch result download links
      const resultRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/download-files`, {
        method: "POST",
        headers: {
          "api-subscription-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      if (!resultRes.ok) {
        return NextResponse.json({ error: "Failed to get download URLs", details: await resultRes.text() }, { status: 500 });
      }
      
      const downloadData = await resultRes.json();
      
      // Look for the ZIP URL
      const downloadUrls = downloadData.download_urls || {};
      let targetUrl = '';
      for (const key in downloadUrls) {
        if (downloadUrls[key]?.file_url) {
          targetUrl = downloadUrls[key].file_url;
          break;
        }
      }

      if (targetUrl) {
        // Fetch the zip and extract in memory
        const zipRes = await fetch(targetUrl);
        const arrayBuffer = await zipRes.arrayBuffer();
        
        // Dynamic import because this is a server module
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(Buffer.from(arrayBuffer));
        const entries = zip.getEntries();
        
        const result: { html?: string, pages: Record<string, any> } = { pages: {} };
        
        for (const entry of entries) {
          if (!entry.isDirectory) {
            const entryName = entry.entryName;
            if (entryName.endsWith('document.html')) {
              result.html = entry.getData().toString('utf8');
            } else if (entryName.includes('metadata/page_') && entryName.endsWith('.json')) {
              const jsonContent = JSON.parse(entry.getData().toString('utf8'));
              // extract the page number from "page_001.json"
              const match = entryName.match(/page_(\d+)\.json/);
              if (match) {
                const pageNum = parseInt(match[1], 10);
                result.pages[pageNum] = jsonContent;
              }
            }
          }
        }
        
        return NextResponse.json({ status: "Completed", result });
      }

      return NextResponse.json({ status: "Completed", resultUrls: downloadData });
    }

    return NextResponse.json({ status: statusData.job_state });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
