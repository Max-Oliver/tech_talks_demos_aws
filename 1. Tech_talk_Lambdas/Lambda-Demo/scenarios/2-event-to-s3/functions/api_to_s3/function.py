import os
import json
import uuid
import boto3  # type: ignore
import logging

# Logger configurado como el resto de las lambdas
logger = logging.getLogger()
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)

s3 = boto3.client("s3", endpoint_url=os.environ.get("AWS_ENDPOINT_URL"))


def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    body = event.get("body", "{}")
    correlation_id = str(uuid.uuid4())

    logger.info(f"[ApiToS3] 🔑 Correlation ID: {correlation_id}")
    try:
        logger.info("[ApiToS3] ✅ Lambda ApiToS3FunctionApi invocada.")
        payload = json.loads(body)
        object_key = f"event-{uuid.uuid4()}.json"

        logger.info(f"[ApiToS3] 📥 Payload recibido: {json.dumps(payload)}")
        logger.info(
            f"[ApiToS3] 💾 Guardando en bucket '{bucket_name}' con key '{object_key}'"
        )

        s3.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=json.dumps(payload),
            ContentType="application/json",
        )

        publicUri = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket_name, "Key": object_key},
            ExpiresIn=3600,
        )

        logger.info("[ApiToS3] ✅ Archivo guardado correctamente en S3")

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"message": "Archivo guardado en S3", "key": object_key, "public_uri": publicUri}
            ),
        }

    except Exception as e:
        logger.error(f"[ApiToS3] ❌ Error al guardar archivo en S3: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
