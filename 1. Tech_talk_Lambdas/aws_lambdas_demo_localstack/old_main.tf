/*terraform {
  required_providers { 
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67.0"  // "~> 5.0"
    }
  }
}

variable "bucket_name" {
  default = "aws-demo-bucket"
}

provider "aws" {
  alias                       = "localstack"
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
  }

  default_tags {
    tags = {
      Environment = "local"
    }
  }
}

resource "aws_s3_bucket" "demo_bucket" {
  provider = aws.localstack
  bucket = "aws-demo-bucket"
}

resource "aws_dynamodb_table" "demo_table" {
  provider = aws.localstack
  name         = "aws_demo_table_dynamo"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_lambda_function" "hello" {
  provider = aws.localstack
  function_name = "hello-terraform"

  filename         = "function.zip"
  handler          = "lambda_function.handler"
  runtime          = "python3.9"
  role             = "arn:aws:iam::000000000000:role/lambda-role" 

  source_code_hash = filebase64sha256("function.zip")

  environment {
    variables = {
      BUCKET_NAME  = var.bucket_name
      AWS_ENDPOINT = "http://localhost:4566"
    }
  }
}
*/