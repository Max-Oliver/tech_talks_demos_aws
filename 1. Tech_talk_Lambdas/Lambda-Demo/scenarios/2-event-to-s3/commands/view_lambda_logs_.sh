#!/bin/bash

# ⚙️ Parámetros fijos
LOG_FILE="../../../../localstack-compose/localstack_logs/2-api-to-s3/lambda_ApiToS3Endpoint.log"

# 🔐 Credenciales dummy para LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_PROFILE=localstack

# 📁 Crear carpeta si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# 🖥️ Mostrar e iniciar logging
echo "📜 Mostrando logs para: logs tail /aws/lambda/000000000000-dev-internal-ApiToS3Endpoint "
echo "📄 Guardando en archivo: $LOG_FILE"
echo "⌛ Presiona Ctrl+C para salir..."
echo

# 💡 Solución alternativa a tee que sí guarda con >>
aws --endpoint-url=http://localhost:4566 logs tail /aws/lambda/000000000000-dev-internal-ApiToS3Endpoint --follow # >> $LOG_FILE