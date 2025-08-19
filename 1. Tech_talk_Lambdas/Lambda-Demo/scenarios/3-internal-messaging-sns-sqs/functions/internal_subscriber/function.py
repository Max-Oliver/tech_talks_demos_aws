import json
import logging
import uuid

# Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def lambda_handler(event, context):
    correlation_id = str(uuid.uuid4())

    logger.info(f"[Subscriber] 🔑 Correlation ID: {correlation_id}")
    logger.info("[Subscriber] 📥 Lambda InternalSubscriberFunction fue invocada.")

    try:
        received_messages = []

        for record in event.get("Records", []):
            raw_body = record.get("body")
            logger.info(f"[Subscriber] 📨 Mensaje raw recibido: {raw_body}")
            parsed_body = json.loads(raw_body)
            sns_message_raw = parsed_body.get("Message")

            if not sns_message_raw:
                raise ValueError(
                    "Falta el campo 'Message' en el cuerpo recibido desde SNS"
                )

            try:
                sns_message = json.loads(sns_message_raw)
            except json.JSONDecodeError:
                sns_message = {"content": sns_message_raw}

            subject = parsed_body.get("Subject", "Sin asunto")
            content = sns_message.get("content", "Sin contenido")

            logger.info(f"[Subscriber] 📦 Subject: {subject}")
            logger.info(f"[Subscriber] 📄 Contenido: {content}")

            received_messages.append({"subject": subject, "content": content})

        logger.info(
            "[Subscriber] ✅ Todos los mensajes fueron procesados correctamente."
        )

        return {
            "statusCode": 200,
            "headers": {"X-Correlation-ID": correlation_id},
            "body": json.dumps({"receivedMessages": received_messages}),
        }

    except Exception as ex:
        logger.error(f"[Subscriber] ❌ Error al procesar el mensaje: {str(ex)}")
        return {
            "statusCode": 500,
            "headers": {"X-Correlation-ID": correlation_id},
            "body": json.dumps({"error": str(ex)}),
        }
