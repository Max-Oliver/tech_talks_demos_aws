#!/bin/bash

# ✅ Nombre base que usás en tus funciones (debería coincidir con tu template)
ACCOUNT_ID="000000000000"
ENV="dev"
LAMBDA_NAME="internal"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_PROFILE=localstack

# Verificamos si pasaste un argumento
if [[ -z "$1" ]]; then
  echo "❌ Debes especificar qué logs ver: publisher | subscriber"
  exit 1
fi

case "$1" in
  publisher)
    FN_NAME="${ACCOUNT_ID}-${ENV}-${LAMBDA_NAME}-Publisher"
    SHORT_NAME="Producer-${ENV}-${LAMBDA_NAME}-Publisher"
    ;;
  subscriber)
    FN_NAME="${ACCOUNT_ID}-${ENV}-${LAMBDA_NAME}-Subscriber"
    SHORT_NAME="Consumer-${ENV}-${LAMBDA_NAME}-Subscriber"
    ;;
  *)
    echo "❌ Argumento inválido. Usa: publisher | subscriber"
    exit 1
    ;;
esac

# Ruta del log desde la raíz del script actual
LOG_FILE="../../../../localstack-compose/localstack_logs/3-pub_sub/lambda_${SHORT_NAME}.log"

# Crear carpeta si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# Mostrar logs en tiempo real
echo "📄 Mostrando logs de $LOG_FILE"

echo "📜 Mostrando logs para: /aws/lambda/${FN_NAME}"
echo "⌛ Presiona Ctrl+C para salir..."
echo

aws --endpoint-url=http://localhost:4566 logs tail "/aws/lambda/${FN_NAME}" --follow # >> "$LOG_FILE"
