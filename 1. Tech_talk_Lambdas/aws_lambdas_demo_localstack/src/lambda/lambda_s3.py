import boto3
import os

HOST = os.environ.get("LOCALSTACK_HOSTNAME", "localhost")
s3 = boto3.client("s3", endpoint_url=f"http://{HOST}:4566")

def handler(event, context):
    bucket = os.environ.get('BUCKET_NAME')
    key = 'prueba_lambda.txt'
    contenido = "Este archivo fue creado desde Lambda en LocalStack."

    # Crear el archivo en S3
    s3.put_object(Bucket=bucket, Key=key, Body=contenido)
    return {
        'statusCode': 200,
        'body': f'Archivo {key} creado en bucket {bucket}'
    }
