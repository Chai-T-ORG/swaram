import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

const API_KEY = process.env.SARWAM_DIGITALIZE_KEY || 'sk_z2t7k5do_YeVuMmYSu6M1lFPqf9ST6itT';
const FILE_PATH = 'g:/swaram/form-test/Original/Unfilled/Swaram Stress Test Form.pdf';

async function test() {
  console.log("1. Creating Job...");
  let res = await axios.post('https://api.sarvam.ai/doc-digitization/job/v1', {
    job_parameters: {
      model: 'sarvam-vision',
      language_code: 'en-IN',
      output_format: 'html'
    }
  }, {
    headers: {
      'api-subscription-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  let data = res.data;
  console.log("Job Create Response:", data);
  const jobId = data.job_id;
  if (!jobId) return;

  console.log("2. Uploading file...");
  const formData = new FormData();
  formData.append('job_id', jobId);
  formData.append('file', fs.createReadStream(FILE_PATH));

  res = await axios.post('https://api.sarvam.ai/doc-digitization/job/v1/upload-files', formData, {
    headers: {
      'api-subscription-key': API_KEY,
      ...formData.getHeaders()
    }
  });
  console.log("Upload Response:", res.data);

  console.log("3. Starting job...");
  res = await axios.post(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/start`, {}, {
    headers: {
      'api-subscription-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  console.log("Start Response:", res.data);

  console.log("4. Polling status...");
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    res = await axios.get(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/status`, {
      headers: {
        'api-subscription-key': API_KEY
      }
    });
    data = res.data;
    console.log("Status:", data.job_state);
    if (data.job_state === 'Completed' || data.job_state === 'Failed') {
      break;
    }
  }

  if (data.job_state === 'Completed') {
    console.log("5. Getting result...");
    res = await axios.get(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/download-files`, {
      headers: {
        'api-subscription-key': API_KEY
      }
    });
    console.log("Result URLs:", res.data);
    
    if (res.data.json) {
        let jsonRes = await axios.get(res.data.json);
        fs.writeFileSync("sarvam_result.json", JSON.stringify(jsonRes.data, null, 2));
        console.log("Saved sarvam_result.json");
    }
  }
}

test().catch(err => {
    if (err.response) {
        console.error("API Error:", err.response.data);
    } else {
        console.error("Error:", err.message);
    }
});
