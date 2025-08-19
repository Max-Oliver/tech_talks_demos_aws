import json


def handler(event, context):
    name = event.get("name", "World")
    message = f"Hola, {name}! Esta Lambda corrió localmente. 🚀"
    return {
        "statusCode": 200,
        "body": json.dumps({"message": message}, ensure_ascii=False),
    }
