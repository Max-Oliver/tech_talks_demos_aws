import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    for rec in event.get("Records", []):
        msg = json.loads(rec["body"]) if rec.get("body") else {}
        logger.info("[PAGOS] mensaje: %s", msg)
    return {"statusCode": 200}