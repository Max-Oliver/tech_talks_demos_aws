import json, os, random, time
from utils.log import jlog, env

FAIL = float(env("FAIL_RATIO","0"))
SLEEP = int(env("SLEEP_MS","0"))/1000.0

def handler(event, context):
    recs = event.get("Records", [])
    jlog(component="thr", status="batch", size=len(recs))
    for r in recs:
        body = r.get("body")
        jlog(component="thr", msg=body)
        time.sleep(SLEEP)
        if random.random() < FAIL:
            raise Exception("Fallo intencional")
    return {"ok": True}