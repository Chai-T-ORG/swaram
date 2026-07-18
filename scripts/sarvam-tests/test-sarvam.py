import os
import time
import requests
import json

API_KEY = "sk_z2t7k5do_YeVuMmYSu6M1lFPqf9ST6itT"
FILE_PATH = "g:/swaram/form-test/Original/Unfilled/Swaram Stress Test Form.pdf"

print("1. Creating Job...")
res = requests.post("https://api.sarvam.ai/doc-digitization/job/v1", 
  headers={"api-subscription-key": API_KEY},
  json={"job_parameters": {"model": "sarvam-vision", "language_code": "en-IN", "output_format": "html"}})
data = res.json()
print("Job Create:", data)
job_id = data.get("job_id")
if not job_id:
    exit(1)

print("2. Uploading file...")
with open(FILE_PATH, "rb") as f:
    files = {"file": ("Swaram_Stress_Test_Form_UNFILLED.pdf", f, "application/pdf")}
    data = {"job_id": job_id}
    res = requests.post("https://api.sarvam.ai/doc-digitization/job/v1/upload-files",
      headers={"api-subscription-key": API_KEY},
      data=data, files=files)
print("Upload:", res.text)

print("3. Starting job...")
res = requests.post(f"https://api.sarvam.ai/doc-digitization/job/v1/{job_id}/start",
  headers={"api-subscription-key": API_KEY, "Content-Type": "application/json"})
print("Start:", res.text)

print("4. Polling status...")
while True:
    time.sleep(3)
    res = requests.get(f"https://api.sarvam.ai/doc-digitization/job/v1/{job_id}/status",
      headers={"api-subscription-key": API_KEY})
    data = res.json()
    print("Status:", data.get("job_state"))
    if data.get("job_state") in ["Completed", "Failed"]:
        break

if data.get("job_state") == "Completed":
    print("5. Getting result...")
    res = requests.get(f"https://api.sarvam.ai/doc-digitization/job/v1/{job_id}/download-files",
      headers={"api-subscription-key": API_KEY})
    result = res.json()
    print("Result URLs:", result)
    
    # Download JSON result
    if "json" in result:
        res = requests.get(result["json"])
        with open("sarvam_result.json", "w") as f:
            f.write(res.text)
        print("Saved sarvam_result.json")
