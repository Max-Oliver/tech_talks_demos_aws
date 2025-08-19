#!/bin/bash

set -e

# 🧾 Parámetros requeridos por el template
APP_NAME="api-to-s3"
ACCOUNT="000000000000"
ENVIRONMENT="dev"
LAMBDA_NAME="internal"
BUCKET_NAME="sam-local-artifacts"
STACK_NAME="aws-demo-scenario-2"

echo "🌐 Escenario 2: API Gateway → Lambda → S3 ☁️"
echo "📦 Paso 1: Compilando funciones Lambda con SAM..."
sam build --use-container

echo "🪣 Paso 2: Verificando bucket de artefactos '$BUCKET_NAME' en LocalStack..."
if ! aws --endpoint-url=http://localhost:4566 s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "📦 Bucket no existe. Creándolo..."
  aws --endpoint-url=http://localhost:4566 s3 mb s3://$BUCKET_NAME
else
  echo "✅ Bucket ya existe."
fi

echo "📤 Paso 3: Empaquetando funciones con SAM..."
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_S3_ENDPOINT=http://localhost:4566
export AWS_S3_USE_PATH_STYLE=true

sam package \
  --s3-bucket $BUCKET_NAME \
  --output-template-file packaged.yaml \
  --region us-east-1

echo "🚀 Paso 4: Desplegando stack CloudFormation en LocalStack..."
aws --endpoint-url=http://localhost:4566 cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name $STACK_NAME \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AppName=$APP_NAME \
    Account=$ACCOUNT \
    Environment=$ENVIRONMENT \
    LambdaName=$LAMBDA_NAME

echo "✅ Escenario API-to-S3 desplegado correctamente en LocalStack con stack '$STACK_NAME'"
