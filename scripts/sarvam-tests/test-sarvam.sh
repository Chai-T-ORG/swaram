#!/bin/bash
API_KEY="sk_z2t7k5do_YeVuMmYSu6M1lFPqf9ST6itT"
FILE_PATH="g:/swaram/form-test/Original/Unfilled/Swaram Stress Test Form.pdf"

echo "1. Creating Job..."
CREATE_RES=$(curl -s -X POST https://api.sarvam.ai/doc-digitization/job/v1 \
  -H "api-subscription-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_parameters": {"model": "sarvam-vision", "language_code": "en-IN", "output_format": "html"}}')

echo "Create response: $CREATE_RES"
JOB_ID=$(echo $CREATE_RES | grep -o '"job_id":"[^"]*' | grep -o '[^"]*$')
echo "Job ID: $JOB_ID"

echo "2. Uploading file..."
UPLOAD_RES=$(curl -s -X POST https://api.sarvam.ai/doc-digitization/job/v1/upload-files \
  -H "api-subscription-key: $API_KEY" \
  -F "job_id=$JOB_ID" \
  -F "file=@$FILE_PATH")
echo "Upload response: $UPLOAD_RES"

echo "3. Starting job..."
START_RES=$(curl -s -X POST https://api.sarvam.ai/doc-digitization/job/v1/$JOB_ID/start \
  -H "api-subscription-key: $API_KEY" \
  -H "Content-Type: application/json")
echo "Start response: $START_RES"

echo "4. Polling status..."
STATUS="Accepted"
while [ "$STATUS" != "Completed" ] && [ "$STATUS" != "Failed" ]; do
  sleep 5
  STATUS_RES=$(curl -s -X GET https://api.sarvam.ai/doc-digitization/job/v1/$JOB_ID/status \
    -H "api-subscription-key: $API_KEY")
  STATUS=$(echo $STATUS_RES | grep -o '"job_state":"[^"]*' | grep -o '[^"]*$')
  echo "Status: $STATUS"
done

echo "Final Status Response: $STATUS_RES"

if [ "$STATUS" == "Completed" ]; then
  echo "5. Downloading result..."
  DOWNLOAD_RES=$(curl -s -X GET https://api.sarvam.ai/doc-digitization/job/v1/$JOB_ID/download-files \
    -H "api-subscription-key: $API_KEY")
  echo "Download response: $DOWNLOAD_RES"
fi
