#!/bin/bash

set -e

STACK_NAME="aws-demo-scenario-2"
REGION="us-east-1"
ACCOUNT_ID="000000000000"
STAGE="dev"
LOGICAL_ID="ApiToS3Api"

echo "🔍 Buscando API Gateway REST ID del stack '$STACK_NAME'..."

API_ID=$(aws --endpoint-url=http://localhost:4566 cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query "StackResources[?LogicalResourceId=='$LOGICAL_ID'].PhysicalResourceId" \
  --output text)

if [[ -z "$API_ID" ]]; then
  echo "❌ No se encontró el API Gateway con Logical ID '$LOGICAL_ID'."
  exit 1
fi

echo "✅ API Gateway ID: $API_ID"
echo "🔗 URL de invocación (usando LocalStack):"
echo "http://localhost:4566/restapis/$API_ID/$STAGE/_user_request_/upload-s3-event"
