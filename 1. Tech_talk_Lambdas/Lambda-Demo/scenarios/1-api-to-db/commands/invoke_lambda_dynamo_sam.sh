#!/bin/bash

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TEMPLATE="$DIR/../template.yaml"
EVENT_FILE="$DIR/../events/req/put_event_record.json"
ENV_VARS="$DIR/../commands/env/dynamo_env.json"

[[ ! -f "$TEMPLATE" ]] && echo "❌ No se encontró $TEMPLATE" && exit 1
[[ ! -f "$EVENT_FILE" ]] && echo "❌ No se encontró $EVENT_FILE" && exit 1
[[ ! -f "$ENV_VARS" ]] && echo "❌ No se encontró $ENV_VARS" && exit 1

echo '☁️ Invocando a la Lambda LambdaToDynamoFunction para guardar en DynamoDB...'

sam local invoke LambdaToDynamoFunction \
  --template "$TEMPLATE" \
  --event "$EVENT_FILE" \
  --env-vars "$ENV_VARS"

echo '✅ Invocación finalizada correctamente.'
