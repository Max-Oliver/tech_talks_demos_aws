#!/bin/bash

set -e

ACCOUNT="000000000000"
ENVIRONMENT="dev"
LAMBDA_NAME="internal"
FUNCTION_NAME="${ACCOUNT}-${ENVIRONMENT}-${LAMBDA_NAME}-LambdaToDynamo"

echo "🔗 Obteniendo URL pública de Lambda: $FUNCTION_NAME"

aws --endpoint-url=http://localhost:4566 lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --query 'FunctionUrl' \
  --output text
