#!/bin/bash

# Configuration
API_URL="http://localhost:3001/api"
ACCOUNT_ID="0463f296-f544-4796-b21d-7ac741b55e76"  # Replace with your test account ID

# Start a new sync job
echo "Starting new sync job..."
RESPONSE=$(curl -s -X POST "$API_URL/emails/sync/start" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "'$ACCOUNT_ID'",
    "folders": ["INBOX"],
    "name": "API Test Sync"
  }')

echo "API Response: $RESPONSE"

# Extract job ID
JOB_ID=$(echo $RESPONSE | jq -r '.syncJobId')

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "null" ]; then
  echo "Failed to start sync job"
  exit 1
fi

echo "Sync job started with ID: $JOB_ID"
echo "Monitoring job status..."

# Monitor job status
while true; do
  JOB_STATUS=$(curl -s "$API_URL/emails/sync/jobs/$JOB_ID" | jq -r '.status')
  
  if [ "$JOB_STATUS" = "completed" ]; then
    echo "\nJob completed successfully!"
    break
  elif [ "$JOB_STATUS" = "failed" ]; then
    echo "\nJob failed!"
    # Get error details
    curl -s "$API_URL/emails/sync/jobs/$JOB_ID" | jq .
    break
  fi
  
  echo -n "."
  sleep 2
done

echo "\nJob details:"
curl -s "$API_URL/emails/sync/jobs/$JOB_ID" | jq .
