#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
TOPIC_NAME="${TOPIC_NAME:-demo-fanout-topic}"

# --- Resolver/crear el Topic ARN ---
TOPIC_ARN="$(awslocal sns list-topics \
  --query "Topics[?ends_with(TopicArn, ':${TOPIC_NAME}')].TopicArn | [0]" \
  --output text || true)"

if [[ -z "${TOPIC_ARN:-}" || "${TOPIC_ARN}" == "None" ]]; then
  TOPIC_ARN="$(awslocal sns create-topic --name "${TOPIC_NAME}" --query TopicArn --output text)"
fi

# --- CID portable ---
cid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    printf '%s-%s\n' "$(date +%s)" "$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c8)"
  fi
}

publish() {
  local evt="$1" prio="$2" pid="$3" qty="$4" price="$5"
  local corr_id; corr_id="$(cid)"
  local order_id; order_id="$(cid)"

  awslocal sns publish \
    --topic-arn "$TOPIC_ARN" \
    --message "$(printf '{"orderId":"%s","eventType":"%s","priority":"%s","product":"%s","quantity":%s,"price":%s,"correlationId":"%s"}' \
      "$order_id" "$evt" "$prio" "$pid" "$qty" "$price" "$corr_id")" \
    --message-attributes "eventType={DataType=String,StringValue=\"$evt\"},priority={DataType=String,StringValue=\"$prio\"}"

  echo "sent $evt -> cid=$corr_id"
}

publish "OrderPlaced"  "high" "StartUp book" 1 10
publish "OrderUpdated" "low"  "StartUp book" 1 10
publish "OrderShipped" "high" "StartUp book" 1 10
