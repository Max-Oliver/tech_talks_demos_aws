#!/bin/bash

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Este es el path $DIR"

OUTPUT_DIR="$DIR/../events/res"
OUTPUT_FILE="$OUTPUT_DIR/publisher_response.json"

# Asegurarse de que el directorio existe
mkdir -p "$OUTPUT_DIR"

# Configuración
EVENT_FILE="$DIR/../events/req/publish_message.json"
RESPONSE_FILE="$OUTPUT_FILE"
LOGICAL_NAME="InternalPublisherFunction"
STACK_NAME="aws-demo-scenario-3"

# Verificar si el archivo de evento existe
if [[ ! -f "$EVENT_FILE" ]]; then
  echo "❌ El archivo $EVENT_FILE no existe."
  exit 1
fi

# Obtener el nombre real de la función desde CloudFormation
FUNCTION_NAME=$(aws --endpoint-url=http://localhost:4566 cloudformation describe-stack-resources \
  --stack-name $STACK_NAME \
  --query "StackResources[?LogicalResourceId=='$LOGICAL_NAME'].PhysicalResourceId" \
  --output text)

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "❌ No se pudo obtener el nombre físico de la función '$LOGICAL_NAME'."
  exit 1
fi

echo "☕️ Invocando Lambda '$FUNCTION_NAME' con evento '$EVENT_FILE'..."

# Invocar la lambda
aws --endpoint-url=http://localhost:4566 lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --payload fileb://$EVENT_FILE \
  "$RESPONSE_FILE"

echo "✅ Respuesta guardada en '$RESPONSE_FILE'"
