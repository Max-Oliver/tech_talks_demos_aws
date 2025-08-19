#!/bin/bash

.venv/bin/awslocal lambda create-function \
  --function-name hello-local \
  --runtime python3.9 \
  --handler lambda_function.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::000000000000:role/lambda-role