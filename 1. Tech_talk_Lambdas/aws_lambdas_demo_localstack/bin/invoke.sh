#!/bin/bash

.venv/bin/awslocal lambda invoke \
  --function-name hello-local \
  --payload file://payload.json \
  response.json

echo ""
echo "Respuesta:"
cat response.json