#!/bin/bash

set -e

APP_NAME="lambda-to-dynamo"
ACCOUNT="000000000000"
ENVIRONMENT="dev"
LAMBDA_NAME="internal"
BUCKET_NAME="sam-local-artifacts"
STACK_NAME="aws-demo-scenario-1"
TABLE_NAME="${ACCOUNT}-${ENVIRONMENT}-${APP_NAME}-events-table"

echo "📘 Escenario 1: Lambda URL → DynamoDB"
echo "📦 1. Compilando funciones Lambda con SAM..."
sam build --use-container

echo "🪣 2. Verificando bucket de artefactos..."
if ! aws --endpoint-url=http://localhost:4566 s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "📦 Bucket no existe. Creándolo..."
  aws --endpoint-url=http://localhost:4566 s3 mb s3://$BUCKET_NAME
else
  echo "✅ Bucket ya existe."
fi

echo "📤 3. Empaquetando funciones con SAM..."
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_S3_ENDPOINT=http://localhost:4566
export AWS_S3_USE_PATH_STYLE=true

sam package \
  --s3-bucket "$BUCKET_NAME" \
  --output-template-file packaged.yaml \
  --region us-east-1

# Validación de stack
echo "🔍 4. Verificando estado actual del stack y tabla..."
stack_exists=false
table_exists=false

if aws --endpoint-url=http://localhost:4566 cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; then
  stack_exists=true
fi

if aws --endpoint-url=http://localhost:4566 dynamodb describe-table --table-name "$TABLE_NAME" >/dev/null 2>&1; then
  table_exists=true
fi

# Si el stack existe pero está en estado FAILED o hay conflictos → limpiamos todo
if [ "$stack_exists" = true ]; then
  stack_status=$(aws --endpoint-url=http://localhost:4566 cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].StackStatus' \
    --output text)

  if [[ "$stack_status" == *"ROLLBACK"* || "$stack_status" == *"FAILED"* ]]; then
    echo "⚠️ Stack en estado fallido ($stack_status). Limpiando..."
    aws --endpoint-url=http://localhost:4566 cloudformation delete-stack --stack-name "$STACK_NAME"
    aws --endpoint-url=http://localhost:4566 cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
    stack_exists=false
  fi
fi

# Si la tabla existe y vamos a forzar despliegue desde 0
if [ "$stack_exists" = false ] && [ "$table_exists" = true ]; then
  echo "🧹 Tabla '$TABLE_NAME' existe. Eliminándola para evitar errores..."
  aws --endpoint-url=http://localhost:4566 dynamodb delete-table --table-name "$TABLE_NAME"
  echo "✅ Tabla eliminada."
fi

echo "🚀 5. Desplegando stack CloudFormation..."
aws --endpoint-url=http://localhost:4566 cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AppName=$APP_NAME \
    Account=$ACCOUNT \
    Environment=$ENVIRONMENT \
    LambdaName=$LAMBDA_NAME

echo "✅ Despliegue exitoso: stack '$STACK_NAME'"
