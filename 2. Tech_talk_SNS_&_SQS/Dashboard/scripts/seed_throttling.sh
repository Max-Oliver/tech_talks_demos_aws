#!/usr/bin/env bash
set -euo pipefail
URL=$(awslocal sqs get-queue-url --queue-name demo-thr --query QueueUrl --output text)
for i in $(seq 1 100); do
  awslocal sqs send-message --queue-url "$URL" --message-body "msg-$i"
done
echo "100 messages sent"