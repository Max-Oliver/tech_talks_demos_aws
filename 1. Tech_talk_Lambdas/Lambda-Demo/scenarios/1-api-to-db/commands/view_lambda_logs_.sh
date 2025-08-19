#!/bin/bash

set -e

# 🎯 Parámetros base
ACCOUNT_ID="000000000000"
ENV="dev"
LAMBDA_NAME="internal"
FUNCTION_NAME="${ACCOUNT_ID}-${ENV}-${LAMBDA_NAME}-LambdaToDynamo"
LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"

# 📄 Archivo local para guardar logs
LOG_FILE="../../../../localstack-compose/localstack_logs/1-lambda-to-dynamo/lambda_${LAMBDA_NAME}.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo "📜 Mostrando logs para: $LOG_GROUP"
echo "📄 Guardando en archivo: $LOG_FILE"
echo "⌛ Presiona Ctrl+C para salir..."
echo

# Mostrar logs y guardar
aws --endpoint-url=http://localhost:4566 logs tail "$LOG_GROUP" --follow # >> "$LOG_FILE"
