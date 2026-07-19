import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPathSync } from 'formdata-node/file-from-path';
import fetch from 'node-fetch';

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
    console.log("Success! HTML length:", data.result?.html?.length);
    const p1 = data.result?.pages?.[1];
    if (p1) {
       console.log(`Page 1 Size: ${p1.image_width}x${p1.image_height}`);
       console.log(`Block 0:`, p1.blocks?.[0]);
       console.log(`Block 1:`, p1.blocks?.[1]);
       console.log(`Total blocks:`, p1.blocks?.length);
    }
  } else {
    console.log("Failed:", data);
  }
}

test();
