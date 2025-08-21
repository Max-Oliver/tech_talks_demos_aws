import json, os, random, time
from utils.log import jlog, env  # tus helpers

FAIL = float(env("FAIL_RATIO", "0"))         # ej 0.30 => 30%
SLEEP = int(env("SLEEP_MS", "0")) / 1000.0   # ej 2000 => 2s
JITTER = int(env("JITTER_MS", "300")) / 1000.0  # jitter opcional

def _sleep():
    if SLEEP <= 0 and JITTER <= 0:
        return
    base = SLEEP if SLEEP > 0 else 0
    jit = random.random() * JITTER if JITTER > 0 else 0
    time.sleep(base + jit)

def handler(event, context):
    recs = event.get("Records", [])
    jlog(component="thr", status="batch", size=len(recs), fail_ratio=FAIL)

    failed_ids = []   # 👈 acá listamos SOLO los que queremos reintentar
    ok = 0

    for r in recs:
        _sleep()
        body = r.get("body")
        mid = r.get("messageId") or r.get("messageID")  # localstack sometimes
        will_fail = random.random() < FAIL

        if will_fail:
            # lo “rechazamos”: el lote sigue, pero este id será reintentado
            failed_ids.append(mid)
            jlog(component="thr", msg="FAIL", id=mid, body=body)
        else:
            # lo aceptamos
            ok += 1
            jlog(component="thr", msg="OK", id=mid, body=body)

    # Formato de retorno para Partial Batch Response
    resp = {"batchItemFailures": [{"itemIdentifier": i} for i in failed_ids]}
    jlog(component="thr", status="done", ok=ok, failed=len(failed_ids))
    return resp
