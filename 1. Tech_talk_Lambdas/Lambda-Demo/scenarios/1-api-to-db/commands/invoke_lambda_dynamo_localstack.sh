#!/bin/bash

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📍 Este es el path: $DIR"

OUTPUT_DIR="$DIR/../events/res"
OUTPUT_FILE="$OUTPUT_DIR/put_event_record_response.json"
EVENT_FILE="$DIR/../events/req/put_event_record.json"
LOGICAL_NAME="LambdaToDynamoFunction"
STACK_NAME="aws-demo-scenario-1"

mkdir -p "$OUTPUT_DIR"

if [[ ! -f "$EVENT_FILE" ]]; then
  echo "❌ El archivo $EVENT_FILE no existe."
  exit 1
fi

# Obtener el nombre real de la función
FUNCTION_NAME=$(aws --endpoint-url=http://localhost:4566 cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query "StackResources[?LogicalResourceId=='$LOGICAL_NAME'].PhysicalResourceId" \
  --output text)

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "❌ No se pudo obtener el nombre físico de la función '$LOGICAL_NAME'."
  exit 1
fi

echo "☁️ Invocando Lambda '$FUNCTION_NAME' con evento '$EVENT_FILE'..."

aws --endpoint-url=http://localhost:4566 lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --payload fileb://$EVENT_FILE \
  "$OUTPUT_FILE"

echo "✅ Respuesta guardada en '$OUTPUT_FILE'"
