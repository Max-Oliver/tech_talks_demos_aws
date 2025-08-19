# Escenario 1 – Guardado de registros en DynamoDB desde Lambda URL

Este escenario simula un caso de uso real donde una aplicación cliente (por ejemplo, Postman, frontend o script) envía datos a una **URL HTTP** de una función **Lambda**, y esta los guarda como registros en **DynamoDB**.

No se utiliza API Gateway, sino que se emplea **Lambda Function URLs**, soportadas por LocalStack.

---

## 🧩 Componentes involucrados

- ✅ Lambda Function (`LambdaToDynamoFunction`)
- ✅ URL pública (sin API Gateway)
- ✅ DynamoDB Table
- ✅ IAM Role con permisos
- ✅ CloudWatch Logs

---

## 🔁 Flujo del escenario

```mermaid
sequenceDiagram
  participant Cliente as Usuario (Postman / script)
  participant Lambda as LambdaToDynamo
  participant Dynamo as DynamoDB

  Cliente->>Lambda: POST con JSON (HTTP Lambda URL)
  Lambda->>Lambda: Parsea y valida el body
  Lambda->>Dynamo: Guarda registro (PutItem)
  Dynamo-->>Lambda: Confirmación de escritura
  Lambda-->>Cliente: Respuesta con ID + correlation_id
