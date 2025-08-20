import json, os, time, boto3

APP = os.getenv("APP_NAME", "fanout")
DATA_BUCKET = os.getenv("DATA_BUCKET", "demo-data")
AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL")

s3 = boto3.client("s3", endpoint_url=AWS_ENDPOINT_URL) if AWS_ENDPOINT_URL else boto3.client("s3")

def put_trace(correlation_id: str, step: str, payload: dict):
    key = f"traces/{correlation_id}/{step}.json"
    s3.put_object(Bucket=DATA_BUCKET, Key=key, Body=json.dumps({"t": int(time.time()*1000), **payload}).encode("utf-8"))

def handler(event, context):
    for rec in event.get("Records", []):
        body = rec.get("body") or "{}"
        try:
            msg = json.loads(body)
        except:
            msg = {"raw": body}

        cid = msg.get("correlationId") or f"no-cid-{int(time.time()*1000)}"
        put_trace(cid, "12-shipping-received", {"message": msg})

        # “procesa envío”: genera etiqueta/confirmación
        order_id = msg.get("orderId", "unknown")
        ship_key = f"shipping/{order_id}-{int(time.time()*1000)}.json"
        artifact = {
            "orderId": order_id,
            "correlationId": cid,
            "carrier": "Acme Logistics",
            "tracking": f"TRK-{int(time.time()*1000)}",
            "status": "READY_TO_SHIP",
        }
        s3.put_object(Bucket=DATA_BUCKET, Key=ship_key, Body=json.dumps(artifact).encode("utf-8"))

        put_trace(cid, "22-shipping-processed", {"s3key": ship_key, "artifact": artifact})
    return {"ok": True}
