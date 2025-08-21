# shipping_worker.py
import json, os, time
import boto3

APP = os.getenv("APP_NAME", "fanout")
DATA_BUCKET = os.getenv("DATA_BUCKET", "demo-data")
AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL")

s3 = (
    boto3.client("s3", endpoint_url=AWS_ENDPOINT_URL)
    if AWS_ENDPOINT_URL
    else boto3.client("s3")
)


def _write_json(key: str, obj: dict):
    s3.put_object(Bucket=DATA_BUCKET, Key=key, Body=json.dumps(obj).encode("utf-8"))


def put_trace(correlation_id: str, step: str, payload: dict):
    _write_json(
        f"traces/{correlation_id}/{step}.json",
        {"t": int(time.time() * 1000), **payload},
    )


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
    ok = 0
    for rec in event.get("Records", []):
        body = rec.get("body") or "{}"
        try:
            msg = json.loads(body) if isinstance(body, str) else body
        except Exception:
            msg = {"raw": body}

        cid = msg.get("correlationId") or f"no-cid-{int(time.time()*1000)}"
        order_id = msg.get("orderId", "unknown")

        try:
            # Forzar DLQ si vino pedido
            if should_fail("shipping", msg):
                put_trace(cid, "12-shipping-received", {"forced": True, "message": msg})
                print(f"[shipping] forced fail for cid={cid}")
                raise Exception("Forced fail (demo): shipping")

            # Recibido
            put_trace(
                cid,
                "12-shipping-received",
                {
                    "receiveCount": int(
                        rec.get("attributes", {}).get("ApproximateReceiveCount", "1")
                    ),
                    "message": msg,
                },
            )

            # “Procesamiento”
            artifact = {
                "orderId": order_id,
                "correlationId": cid,
                "carrier": "Acme Logistics",
                "tracking": f"TRK-{int(time.time()*1000)}",
                "status": "READY_TO_SHIP",
            }
            s3key = f"shipping/OrderShipped/{order_id}-{cid}.json"
            _write_json(s3key, artifact)

            # Done
            put_trace(
                cid, "22-shipping-processed", {"s3key": s3key, "artifact": artifact}
            )
            ok += 1

        except Exception as e:
            # Dejá evidencia de error y rethrow para que SQS reintente → DLQ si corresponde
            err = {"error": str(e), "body": body}
            put_trace(cid, "98-shipping-error", err)
            print(f"[shipping] ERROR cid={cid}: {e}")
            raise

    return {"ok": ok, "count": len(event.get("Records", []))}
