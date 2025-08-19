import json, os, boto3, time
from utils.log import jlog, env

AWS_ENDPOINT_URL = env("AWS_ENDPOINT_URL")
DATA_BUCKET = env("DATA_BUCKET", "demo-data")

s3 = boto3.client("s3", endpoint_url=AWS_ENDPOINT_URL) if AWS_ENDPOINT_URL else boto3.client("s3")

def _write_json(key, obj):
    s3.put_object(Bucket=DATA_BUCKET, Key=key, Body=json.dumps(obj).encode("utf-8"))

def handler(event, context):
    jlog(component="fulfillment", status="invoked", records=len(event.get("Records", [])))
    for r in event["Records"]:
        body = r["body"]
        msg = json.loads(body)
        corr = msg.get("correlationId") or f"c-{int(time.time()*1000)}"
        product = msg.get("product") or msg.get("productId") or "UNKNOWN"
        quantity = int(msg.get("quantity", 1))
        price = float(msg.get("price", 0))

        # 10: recibido
        _write_json(f"traces/{corr}/10-fulfillment-received.json",
                    {"timestamp": int(time.time()*1000), "receiveCount": 1, "orderId": msg.get("orderId"), "eventType": msg.get("eventType")})

        # simular procesamiento y “reserva de stock”
        order_key = f"orders/{msg.get('orderId','no-id')}.json"
        _write_json(order_key, {"orderId": msg.get("orderId"), "product": product, "quantity": quantity, "price": price, "correlationId": corr})

        # 20: procesado
        _write_json(f"traces/{corr}/20-fulfillment-processed.json",
                    {"timestamp": int(time.time()*1000), "s3key": order_key})

        jlog(component="fulfillment", status="done", order=msg.get("orderId"))
    return {"ok": True}
