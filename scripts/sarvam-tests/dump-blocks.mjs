import fetch from 'node-fetch';

async function test() {
  const jobId = '20260718_add7f409-210c-4154-80d5-4f4d4bda34f5';
  console.log("Polling status...");
  let res = await fetch(`http://localhost:3000/api/sarvam/status?job_id=${jobId}`);
  let data = await res.json();
  
  if (data.status === 'Completed') {
    const p1 = data.result?.pages?.[1];
    if (p1) {
       console.log(`Page 1 Size: ${p1.image_width}x${p1.image_height}`);
       console.log(`Page keys:`, Object.keys(p1));
       console.log(`Block 0 keys:`, Object.keys(p1.blocks[0]));
       console.log(`Total blocks:`, p1.blocks?.length);
    }
    console.log("HTML:", data.result.html.substring(0, 1000));
  } else {
    console.log("Failed:", data);
  }
}
test();
