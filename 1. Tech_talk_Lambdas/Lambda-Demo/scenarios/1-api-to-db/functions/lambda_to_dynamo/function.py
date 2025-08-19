import os
import json
import uuid
import boto3 # type: ignore
import logging

# Logger estandarizado
logger = logging.getLogger()
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)

dynamodb = boto3.client("dynamodb", endpoint_url=os.environ.get("AWS_ENDPOINT_URL"))


def lambda_handler(event, context):
    table_name = os.environ["TABLE_NAME"]
    body = event.get("body", "{}")
    correlation_id = str(uuid.uuid4())

    logger.info(f"[LambdaToDynamo] 🔑 Correlation ID: {correlation_id}")

    try:
        logger.info("[LambdaToDynamo] ✅ Lambda invocada vía HTTP URL")
        payload = json.loads(body)

        record_id = str(uuid.uuid4())
        logger.info(f"[LambdaToDynamo] 📥 Payload recibido: {json.dumps(payload)}")

        # Armado del item para DynamoDB
        item = {"id": {"S": record_id}, "data": {"S": json.dumps(payload)}}

        logger.info(f"[LambdaToDynamo] 💾 Guardando en DynamoDB: {table_name}")
        dynamodb.put_item(TableName=table_name, Item=item)

        logger.info("[LambdaToDynamo] ✅ Registro guardado exitosamente")

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": "Registro guardado en DynamoDB",
                    "id": record_id,
                    "correlation_id": correlation_id,
                }
            ),
        }

    except Exception as e:
        logger.error(f"[LambdaToDynamo] ❌ Error al guardar en DynamoDB: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
