import json, os, boto3, time
from utils.log import jlog, env

AWS_ENDPOINT_URL = env("AWS_ENDPOINT_URL")
DATA_BUCKET = env("DATA_BUCKET", "demo-data")
s3 = (
    boto3.client("s3", endpoint_url=AWS_ENDPOINT_URL)
    if AWS_ENDPOINT_URL
    else boto3.client("s3")
)


def _write_json(key, obj):
    s3.put_object(Bucket=DATA_BUCKET, Key=key, Body=json.dumps(obj).encode("utf-8"))
    # helper común


def should_fail(service_name: str, msg: dict) -> bool:
    ff = msg.get("forceFail")
    if not ff:
        return False
    if ff is True or ff == "all":
        return True
    if isinstance(ff, str):
        return ff.lower() == service_name.lower()
    if isinstance(ff, list):
        return any(str(s).lower() == service_name.lower() for s in ff)
    return False


def handler(event, context):
    jlog(component="analytics", status="invoked", records=len(event.get("Records", [])))
    for r in event["Records"]:
        msg = json.loads(r["body"])
        corr = msg.get("correlationId")

        # 👇 si queremos forzar DLQ en Fulfillment
        if should_fail("fulfillment", msg):
            # opcional: escribir que fue recibido antes de fallar
            _write_json(f"traces/{corr}/10-fulfillment-received.json", {"forced": True})
            raise Exception("Forced fail (demo): fulfillment")

        product = msg.get("product") or msg.get("productId") or "UNKNOWN"
        quantity = int(msg.get("quantity", 1))
        price = float(msg.get("price", 0))
        order_id = msg.get("orderId")

        # 11: recibido
        _write_json(
            f"traces/{corr}/11-analytics-received.json",
            {
                "timestamp": int(time.time() * 1000),
                "receiveCount": 1,
                "orderId": order_id,
                "eventType": msg.get("eventType"),
            },
        )

        # generar registro de analytics
        key = f"analytics/{msg.get('eventType','Event')}/{order_id}.json"
        _write_json(
            key,
            {
                "orderId": order_id,
                "productId": product,
                "quantity": quantity,
                "price": price,
                "correlationId": corr,
            },
        )

        # 21: procesado
        _write_json(
            f"traces/{corr}/21-analytics-processed.json",
            {"timestamp": int(time.time() * 1000), "s3key": key},
        )

        jlog(component="analytics", status="done", order=order_id)
    return {"ok": True}
