# Template lambda-api-to-s3

## Contexto y motivación

Este template modela un escenario en el que una función Lambda es invocada mediante una solicitud HTTP a través de API Gateway. La función recibe un cuerpo JSON y lo guarda como archivo en un bucket S3. Este patrón simula una API de ingreso de datos que almacena eventos o formularios de forma duradera, sin necesidad de un backend tradicional.

## Estructura del escenario

API Gateway (HTTP)
↓
Lambda
↓
Bucket S3

### Diseño de Arquitectura

La arquitectura es simple pero poderosa, permitiendo demostrar:

- Cómo exponer Lambdas como endpoints HTTP con API Gateway.
- Cómo trabajar con `POST` y leer el `body`.
- Cómo guardar archivos directamente en un bucket S3 desde la función.

---

## 📥 Evento de prueba

El `body` de una solicitud válida sería:

````json
{
  "name": "Joe Doe",
  "action": "subida desde Postman",
  "timestamp": "2025-05-19T14:00:00Z"
}


📦 Despliegue local con LocalStack
Este escenario está pensado para ejecutarse en entorno local con LocalStack. El stack contiene:

1 bucket S3

1 función Lambda

1 endpoint API Gateway

Recursos de log (CloudWatch Logs)

Roles con permisos mínimos necesarios

🧪 Requisitos
Docker

LocalStack levantado (docker-compose)

AWS CLI configurado para LocalStack

SAM CLI

▶️ Ejecutar el entorno

````json
{
   "despertar los contenedores": "docker-compose up -d",
   "Desplegar el cloudformation": "bash setup.sh"
}
````


