import fetch from 'node-fetch';

async function run() {
    const jobId = "20260718_a67be328-f53a-4f32-859e-1b832c465639";
    const res = await fetch(`http://localhost:3000/api/sarvam/status?job_id=${jobId}`);
    const data = await res.json();
    console.log("Status:", data.status);
    if (data.status === 'Completed') {
       console.log("HTML length:", data.result?.html?.length);
       console.log("Pages:", Object.keys(data.result?.pages || {}));
       if (data.result?.pages?.[1]) {
           console.log("Page 1 blocks count:", data.result.pages[1].blocks.length);
       }
    } else {
       console.log(data);
    }
}
run();
