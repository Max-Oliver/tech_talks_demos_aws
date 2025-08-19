#!/usr/bin/env bash
set -e

cd src
zip -q ../function.zip ~/src/lambda/lambda_s3.py     # crea function.zip en /terraform
cd ..
echo "✅ Paquete Lambda listo"