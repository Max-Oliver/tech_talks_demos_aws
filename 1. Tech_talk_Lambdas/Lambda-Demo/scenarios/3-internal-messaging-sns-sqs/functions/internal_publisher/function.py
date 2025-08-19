import json
import logging
import os
import uuid
import boto3  # type: ignore
import botocore  # type: ignore

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

    logger.info(f"[Publisher] 🔑 Correlation ID: {correlation_id}")
    try:
        logger.info("[Publisher] ✅ Lambda InternalPublisherFunction invocada.")
        region_name = os.environ.get("region", "us-east-1")
        topic = os.environ.get("topicArn")

        if not topic:
            raise ValueError("topicArn no está definido en las variables de entorno.")

        logger.info(f"[Publisher] 🌍 Región: {region_name}")
        logger.info(f"[Publisher] 🔗 Topic ARN: {topic}")
        sns = boto3.client("sns", region_name=region_name)

        logger.info(f"[Publisher] 📦 Evento recibido: {json.dumps(event)}")
        message = json.loads(event.get("body", "{}"))

        content = message.get("content")
        subject = message.get("subject")

        if not subject or not content:
            raise ValueError(
                "El mensaje debe incluir los campos 'subject' y 'content'."
            )

        logger.info(
            f"[Publisher] 📨 Enviando mensaje: subject='{subject}' | content='{content}'"
        )
        res = sns.publish(TopicArn=topic, Message=content, Subject=subject)

        logger.info(f"[Publisher] ✅ Respuesta SNS: {res}")

        return {
            "statusCode": 200,
            "headers": {"X-Correlation-ID": correlation_id},
            "body": json.dumps({"sentMessage": res}),
        }

    except (ValueError, KeyError) as ex:
        logger.error(f"[Publisher] ⚠️ Error de datos: {str(ex)}")
        return {
            "statusCode": 400,
            "headers": {"X-Correlation-ID": correlation_id},
            "body": json.dumps({"error": str(ex)}),
        }

    except botocore.exceptions.ClientError as ex:
        error_message = ex.response["Error"]["Message"]
        logger.error(f"[Publisher] ❌ Error del cliente SNS: {error_message}")
        return {
            "statusCode": 500,
            "headers": {"X-Correlation-ID": correlation_id},
            "body": json.dumps({"error": error_message}),
        }
