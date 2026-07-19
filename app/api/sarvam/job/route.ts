import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | File;
    
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    
    const fileName = (file as File).name || "document.pdf";

    const apiKey = process.env.SARWAM_DIGITALIZE_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SARWAM_DIGITALIZE_KEY missing" }, { status: 500 });
    }

    // 1. Create Job
    const createRes = await fetch("https://api.sarvam.ai/doc-digitization/job/v1", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_parameters: {
          model: "sarvam-vision",
          language_code: "en-IN",
          output_format: "html",
          prompt_type: "default_ocr"
        },
      }),
    });
    const createData = await createRes.json();
    if (!createData.job_id) {
      return NextResponse.json({ error: "Failed to create job", details: createData }, { status: 500 });
    }
    const jobId = createData.job_id;

    // 2. Get Upload URLs
    const uploadLinksRes = await fetch("https://api.sarvam.ai/doc-digitization/job/v1/upload-files", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
          job_id: jobId,
          files: [fileName]
      }),
    });
    
    if (!uploadLinksRes.ok) {
        return NextResponse.json({ error: "Failed to get upload links", details: await uploadLinksRes.text() }, { status: 500 });
    }
    const uploadLinksData = await uploadLinksRes.json();
    // uploadLinksData contains presigned URLs. It probably looks like: { "filename.pdf": "https://..." } or { data: { "filename.pdf": "https://..." } }
    
    // We need to find the presigned URL
    let presignedUrl = "";
    if (uploadLinksData.upload_urls && uploadLinksData.upload_urls[fileName]) {
        presignedUrl = uploadLinksData.upload_urls[fileName].file_url || uploadLinksData.upload_urls[fileName];
    }

    if (!presignedUrl) {
         return NextResponse.json({ error: "Could not find presigned URL in response", details: uploadLinksData }, { status: 500 });
    }

    // 3. Upload File to Presigned URL
    const putRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
            "Content-Type": file.type || "application/pdf",
            "x-ms-blob-type": "BlockBlob"
        },
        body: file
    });
    
    if (!putRes.ok) {
         return NextResponse.json({ error: "Failed to PUT file to presigned URL", details: await putRes.text() }, { status: 500 });
    }

    // 4. Start Job
    const startRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/start`, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!startRes.ok) {
        return NextResponse.json({ error: "Failed to start job", details: await startRes.text() }, { status: 500 });
    }

    return NextResponse.json({ jobId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
