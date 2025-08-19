import json, time, os, sys

def jlog(**k):
    k.setdefault("ts", int(time.time()*1000))
    print(json.dumps(k), flush=True)

def env(name, default=None):
    return os.getenv(name, default)
