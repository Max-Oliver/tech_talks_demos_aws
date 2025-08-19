# tech_talks_demos_aws

Alojare los recuros creados y utilizados para las demos de las Charlas Techs que eh brindado.

# Demos SNS/SQS con LocalStack — Fanout y Throttling+DLQ

## Prerrequisitos

- Docker y docker compose
- GNU Make (`gmake` en macOS si `make` no es GNU)
- Node 18+ (para el server UI)
- `awslocal` instalado (`pip install awscli-local`)

## Setup

````bash
gmake up                 # levanta LocalStack
gmake build-zips         # empaqueta lambdas -> zips
gmake deploy-fanout      # crea topic/queues/lambdas + mapea SQS->Lambda
gmake deploy-thr         # crea demo de throttling
gmake ui-server          # inicia API UI (http://localhost:4000)
gmake ui-web             # sirve la UI estática (http://localhost:5173)

Fanout (SNS -> SQSx3 -> Lambdas)

gmake seed-fanout        # publica 3 eventos de ejemplo
gmake logs-fulfillment   # logs lambda fulfillment
gmake logs-analytics     # logs lambda analytics
gmake logs-thr           # logs lambda throttling
gmake down               # baja LocalStack (borra volúmenes)

Limpiar:
make fan-clean


````

## requirements.txt (root)
````txt
boto3
botocore
````
