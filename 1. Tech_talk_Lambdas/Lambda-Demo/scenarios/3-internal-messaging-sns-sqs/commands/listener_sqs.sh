#!/bin/bash

# 🚨 Configurá tu cola si no usás la primera

QUEUE_URL=$(aws --endpoint-url=http://localhost:4566 sqs list-queues --query 'QueueUrls[0]' --output text)

echo "🎧 Escuchando mensajes en: $QUEUE_URL"
echo "Presioná Ctrl+C para salir."
echo

while true; do
    response=$(aws --endpoint-url=http://localhost:4566 sqs receive-message \
        --queue-url "$QUEUE_URL" \
        --max-number-of-messages 1 \
        --wait-time-seconds 5 \
    --output json)
    
    message_body=$(echo "$response" | jq -r '.Messages[0].Body // empty')
    receipt_handle=$(echo "$response" | jq -r '.Messages[0].ReceiptHandle // empty')
    
    if [[ -n "$message_body" && -n "$receipt_handle" ]]; then
        echo "📨 Mensaje recibido:"
        echo "$message_body" | jq -R '
            (fromjson? // {}) as $base |
            if $base.Message? then
                ($base.Message | fromjson? // $base.Message)
            elif $base.body? then
                ($base.body | fromjson? // $base.body)
            else
                "⚠️ Mensaje no parseable como JSON anidado de SNS o manual"
            end
        '
        # Si queremos conservar los mensajes por alguna razon.. estos podrian repetirse al no filtrarse bien, FIFO o Standard.
        echo "🗑️  Borrando mensaje..."
        aws --endpoint-url=http://localhost:4566 sqs delete-message \
        --queue-url "$QUEUE_URL" \
        --receipt-handle "$receipt_handle"
        echo "✅ Mensaje procesado y eliminado."
        echo
    else
        echo "⌛ Esperando mensajes..."
    fi
    
    sleep 1
done
