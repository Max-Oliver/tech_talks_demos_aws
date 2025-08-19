#!/bin/bash

# 📂 Calcula la ruta real del script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 🧠 Ruta al template (ajustá si es .yml en lugar de .yaml)
TEMPLATE="$DIR/..template.yaml"
EVENT_FILE="$DIR/../events/publish_message.json"
ENV_VARS="$DIR/../commands/env/publisher_env.json"

# 🛡️ Validaciones
[[ ! -f "$TEMPLATE" ]] && echo "❌ No se encontró $TEMPLATE" && exit 1
[[ ! -f "$EVENT_FILE" ]] && echo "❌ No se encontró $EVENT_FILE" && exit 1
[[ ! -f "$ENV_VARS" ]] && echo "❌ No se encontró $ENV_VARS" && exit 1

# 🚀 Invocar lambda
echo '☕️ Invocando a la lambda InternalPublisherFunction para publicar en SNS...'
sam local invoke InternalPublisherFunction \
  --template "$TEMPLATE" \
  --event "$EVENT_FILE" \
  --env-vars "$ENV_VARS"

echo '✅ Finalizó con éxito la publicación.'
