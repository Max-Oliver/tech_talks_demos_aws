import json, os, time, uuid, boto3

TABLE = os.environ.get("TABLE_NAME", "visits")
dynamodb = boto3.resource("dynamodb", endpoint_url="http://localhost:4566")
table = dynamodb.Table(TABLE)


def handler(event, context):
    name = (event.get("queryStringParameters") or {}).get("name", "world")
    ts = int(time.time())
    item = {"id": str(uuid.uuid4()), "name": name, "ts": ts}
    table.put_item(Item=item)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": f"Hello, {name}", "timestamp": ts}),
    }
