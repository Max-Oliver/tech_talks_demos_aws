terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.36" # probada con LocalStack 3.x
    }
  }
}

variable "bucket_name" {
  default = "aws-demo-bucket"
}

# ---------- Provider apunta a LocalStack ----------
provider "aws" {
  alias                       = "local"
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true

  endpoints {
    s3       = "http://localhost:4566"
    dynamodb = "http://localhost:4566"
    lambda   = "http://localhost:4566"
    iam      = "http://localhost:4566"
  }
}

# ---------- Bucket ----------
resource "aws_s3_bucket" "demo_bucket" {
  provider = aws.local
  bucket   = var.bucket_name
}

# ---------- Lambda role (mock, LocalStack no lo valida) ---------- 
resource "aws_iam_role" "lambda_role" {
  provider = aws.local
  name     = "lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_dynamodb_table" "demo_table" {
  provider     = aws.local
  name         = "aws_terraform_table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "id"


  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "name"
    type = "S" # <- clave de un GSI
  }

  attribute {
    name = "age"
    type = "N" # <- clave de otro GSI
  }

  global_secondary_index {
    name            = "name-index"
    hash_key        = "name"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "age-index"
    hash_key        = "age"
    projection_type = "ALL"
  }

}

################################################################################
# Empaquetar lambda con archive_file
################################################################################
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/src/lambda/lambda_s3.py" # ruta al .py
  output_path = "${path.module}/function.zip"            # se crea aquí
}

resource "aws_lambda_function" "s3_writer" {
  provider      = aws.local
  function_name = "lambda-s3-writer"

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime = "python3.12"
  handler = "lambda_s3.handler"
  role    = aws_iam_role.lambda_role.arn
  timeout = 10


  environment {
    variables = {
      BUCKET_NAME = var.bucket_name
    }
  }
}

# ---------- Permiso para que la Lambda sea invocada manualmente ----------
resource "aws_lambda_permission" "allow_invoke_cli" {
  provider      = aws.local
  statement_id  = "AllowCLIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.s3_writer.function_name
  principal     = "*" # OK en entorno local
}

# ---------- (Opcional) Invocación automática post-deploy ----------
resource "null_resource" "invoke_lambda" {
  depends_on = [aws_lambda_function.s3_writer]

  provisioner "local-exec" {
    command = <<-EOF
      aws --endpoint-url=http://localhost:4566 lambda invoke \
        --function-name ${aws_lambda_function.s3_writer.function_name} \
        --payload '{}' \
        response.json
      echo "✅ Lambda invocada, revisa response.json y el objeto en S3"
    EOF
  }
}

