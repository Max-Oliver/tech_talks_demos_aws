# Template lambda-sns

## Contexto y motivación

Este template modela dos escenarios posibles:

1) publisher-internal: Hay dos funciones lambda, una que publica a un tópico SNS y otra que está suscrita a dicho tópico. Al tener ambos extremos de la comunicación SNS dentro del sistema, se tiene un esquema de publicación interna y de ahí el nombre.

2) publisher-external: Hay una sola función lambda, que publica a un tópico SNS. El mismo tiene asociadas dos colas a modo de ejemplo, pero no hay una lambda que lea de dichas colas. También se ejemplifica el uso de filtros para decidir a cuál cola enviar los eventos de la lambda. Como en este caso el suscriptor está fuera del sistema, se considera que el esquema de publicación es externo.

### publisher-external: Probando los filtros

Así como están definidos, un evento de prueba válido para la función lambda sería:


```
{
  "body": "{ \"subject\": \"test-subject\", \"content\": \"test content\", \"attributes\": { \"eventType\": { \"DataType\": \"String\", \"StringValue\": \"event_type_01_A\" } } }"
}
```

Nótese que en attributes va el objeto que define el campo eventType referenciado en los filtros de las suscripciones.
El evento ejemplo iría entonces a la cola 01, que acepta eventos de tipo `event_type_01_A` o `event_type_01_B`.

### Ejecutando pruebas unitarias

Para descargar requerimientos de los Tests desde la carpeta raiz del proyecto ejecutar
```
pip install -r tests/requirements.txt

```
Para ejecutar los Tests desde la carpeta raiz del proyecto ejecutar
```
pytest

```

Para desplegar manualmente a la cuenta de aws
> verificar que el archivo deploy_manual.sh sea "ejecutable"  
```
ls -l ./bin/deploy_manual.sh
```

> para hacerlo ejecutable
```
chmod +x ./bin/deploy_manual.sh
```

> incluir las credenciales en  ~/.aws/credentials

> ejecutar desde la carpeta raiz 
```
./bin/deploy_manual.sh
```

Nota: las versiones de las bibliotecas configuradas en los archivos requirements.txt soportan la version 3.10 de Python. Por ende, se recomienda realizar pruebas de compatibilidad si se desea cambiar las versiones de las mismas.
