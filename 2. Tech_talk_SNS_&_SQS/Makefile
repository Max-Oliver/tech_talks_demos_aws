.RECIPEPREFIX := >
SHELL := /bin/bash

awslocal := awslocal
CF_BUCKET := cf-code
DATA_BUCKET := demo-data

.PHONY: up down ensure-bucket build-zips deploy-fanout deploy-thr seed-fanout seed-thr logs-fulfillment logs-analytics logs-thr ui-server ui-web clean

up:
> docker compose up -d
> sleep 1
> $(awslocal) s3 mb s3://$(CF_BUCKET) || true
> $(awslocal) s3 mb s3://$(DATA_BUCKET) || true

down:
> docker compose down -v

ensure-bucket:
> # Crea el bucket si no existe
> $(awslocal) s3api head-bucket --bucket "$(CF_BUCKET)" >/dev/null 2>&1 || \
> $(awslocal) s3 mb "s3://$(CF_BUCKET)"

build-zips: ensure-bucket
> mkdir -p .dist
> cd ./Dashboard/src/workers/fanout && zip -q -r ../../../../.dist/fanout_fulfillment.zip fulfillment_worker.py ../../utils/log.py
> cd ./Dashboard/src/workers/fanout && zip -q -r ../../../../.dist/fanout_analytics.zip   analytics_worker.py   ../../utils/log.py
> cd ./Dashboard/src/workers/fanout && zip -q -r ../../../../.dist/fanout_shipping.zip       shipping_worker.py ../../utils/log.py
> cd ./Dashboard/src/workers/throttling-dlq && zip -q -r ../../../../.dist/throttling_worker.zip stressed_worker.py ../../utils/log.py
> $(awslocal) s3 cp .dist/fanout_shipping.zip    s3://$(CF_BUCKET)/
> $(awslocal) s3 cp .dist/fanout_fulfillment.zip s3://$(CF_BUCKET)/
> $(awslocal) s3 cp .dist/fanout_analytics.zip   s3://$(CF_BUCKET)/
> $(awslocal) s3 cp .dist/throttling_worker.zip  s3://$(CF_BUCKET)/

# CFN deploy robusto (update si existe, sino create) + espera
define cfn_deploy
if $(awslocal) cloudformation describe-stacks --stack-name $(1) >/dev/null 2>&1; then \
  $(awslocal) cloudformation update-stack --stack-name $(1) --template-body file://$(2) --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM; \
else \
  $(awslocal) cloudformation create-stack --stack-name $(1) --template-body file://$(2) --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM; \
fi; \
for i in $$(seq 1 60); do \
  s=$$($(awslocal) cloudformation describe-stacks --stack-name $(1) --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NOSTACK); \
  echo "[$(1)] $$s"; \
  case "$$s" in (CREATE_COMPLETE|UPDATE_COMPLETE) exit 0;; ROLLBACK_*|*_FAILED) exit 1;; esac; \
  sleep 1; \
done; \
echo "[ $(1) ] timeout"; exit 1
endef

deploy-fanout:
> $(call cfn_deploy,demo-fanout,infra/fanout.yml)
> # asegura envs correctas (endpoint dentro del contenedor)
> $(awslocal) lambda update-function-configuration --function-name demo-fanout-fulfillment --environment "Variables={APP_NAME=fanout,DATA_BUCKET=$(DATA_BUCKET),AWS_ENDPOINT_URL=http://localstack:4566}" >/dev/null
> $(awslocal) lambda update-function-configuration --function-name demo-fanout-analytics   --environment "Variables={APP_NAME=fanout,DATA_BUCKET=$(DATA_BUCKET),AWS_ENDPOINT_URL=http://localstack:4566}" >/dev/null
>	$(awslocal) lambda update-function-configuration --function-name demo-fanout-shipping    --environment "Variables={APP_NAME=fanout,DATA_BUCKET=$(DATA_BUCKET),AWS_ENDPOINT_URL=http://localstack:4566}" >/dev/null


deploy-thr:
> $(call cfn_deploy,demo-thr,infra/throttling.yml)


seed-fanout:
> bash Dashboard/scripts/seed_fanout.sh

seed-thr:
> bash Dashboard/scripts/seed_throttling.sh

logs-fulfillment:
> $(awslocal) logs tail /aws/lambda/demo-fanout-fulfillment --follow

logs-analytics:
> $(awslocal) logs tail /aws/lambda/demo-fanout-analytics --follow

logs-shipping:
> $(awslocal) logs tail /aws/lambda/demo-fanout-shipping --follow

logs-thr:
> $(awslocal) logs tail /aws/lambda/demo-thr-proc --follow

ui-server:
> node Dashboard/server/index.mjs

ui-web:
> npx http-server ui/web -p 5173 -c-1 --silent || python3 -m http.server 5173 -d ui/web

clean:
> rm -rf .dist