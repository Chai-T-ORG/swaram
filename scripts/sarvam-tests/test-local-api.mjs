import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPathSync } from 'formdata-node/file-from-path';
import fetch from 'node-fetch';
import extract from 'extract-zip';

const FILE_PATH = 'g:/swaram/form-test/Original/Unfilled/Swaram Stress Test Form.pdf';

async function test() {
  const file = fileFromPathSync(FILE_PATH);
  const formData = new FormData();
  formData.append('file', file);
  
  console.log("1. Creating & Uploading Job...");
  let res = await fetch('http://localhost:3000/api/sarvam/job', {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
      console.error(await res.text());
      return;
  }
  let data = await res.json();
  console.log("Job Create Response:", data);
  const jobId = data.jobId;

  console.log("2. Polling status...");
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(`http://localhost:3000/api/sarvam/status?job_id=${jobId}`);
    data = await res.json();
    console.log("Status:", data.status);
    if (data.status === 'Completed' || data.status === 'Failed' || data.error) {
      break;
    }
  }

  if (data.status === 'Completed') {
    const downloadUrls = data.resultUrls;
    let targetUrl = '';
    const allVals = Object.values(downloadUrls).flatMap(v => typeof v === 'object' && v !== null ? Object.values(v) : [v]);
    targetUrl = allVals.find(v => typeof v === 'string' && v.startsWith('http'));
    
    if (targetUrl) {
       console.log("Downloading from:", targetUrl);
       const finalRes = await fetch(targetUrl);
       const parsedUrl = new URL(targetUrl);
       if (parsedUrl.pathname.endsWith(".zip")) {
           const arrayBuffer = await finalRes.arrayBuffer();
           fs.writeFileSync("sarvam_result.zip", Buffer.from(arrayBuffer));
           console.log("Saved sarvam_result.zip");
           try {
               await extract("sarvam_result.zip", { dir: process.cwd() + "/sarvam_out" });
               console.log("Extracted ZIP to /sarvam_out");
           } catch (e) {
               console.error("Extract failed", e);
           }
       } else {
           const finalData = await finalRes.text();
           fs.writeFileSync("sarvam_result.json", finalData);
           console.log("Saved sarvam_result.json");
       }
    }
  } else {
    console.log("Failed data:", data);
  }
}

test().catch(console.error);
