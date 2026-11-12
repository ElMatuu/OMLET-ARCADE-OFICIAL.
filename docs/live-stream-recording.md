# Grabación de transmisiones PLAYVERSE

La grabación se ejecuta en el servidor mediante LiveKit Egress. Las claves de almacenamiento permanecen en el backend y nunca se entregan a la aplicación cliente.

## Requisitos de infraestructura

1. LiveKit debe estar configurado con `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET`.
2. El servicio LiveKit Egress debe estar habilitado y operativo para el mismo despliegue de LiveKit.
3. Debe existir un bucket S3 privado (o compatible) y credenciales limitadas al prefijo de grabaciones de PLAYVERSE.
4. Configurar en el servidor:
   - `LIVEKIT_RECORDING_S3_BUCKET`
   - `LIVEKIT_RECORDING_S3_ACCESS_KEY`
   - `LIVEKIT_RECORDING_S3_SECRET`
   - `LIVEKIT_RECORDING_S3_REGION` (si el proveedor lo requiere)
   - `LIVEKIT_RECORDING_S3_ENDPOINT` (solo para proveedores compatibles con endpoint HTTPS propio)
   - `LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE` (usar `true` cuando el proveedor lo requiera)

Sin las credenciales de LiveKit o del bucket, la función permanece deshabilitada y la API devuelve un error explícito de configuración; no simula una grabación.

## API del propietario

- `GET /api/me/streams/:streamId/recording`: consulta el estado y si el almacenamiento está configurado.
- `POST /api/me/streams/:streamId/recording/start`: inicia una grabación MP4 compuesta de la sala activa.
- `POST /api/me/streams/:streamId/recording/stop`: solicita detener la grabación activa.
- Al finalizar una transmisión propia, el backend intenta detener primero la grabación y después cerrar la sala.

Todas las operaciones requieren sesión autenticada y que la transmisión pertenezca al usuario. Los identificadores de Egress y las claves de objeto se almacenan como campos no seleccionados por defecto y no se devuelven al cliente.

## Estado y almacenamiento

Los estados persistidos son `not_started`, `starting`, `active`, `stopping`, `ended` y `failed`. El webhook firmado de LiveKit procesa `egress_ended` para cerrar el ciclo de vida. Los objetos se guardan bajo `playverse/{ownerId}/{streamId}/{timestamp}.mp4`.

La biblioteca VOD, los enlaces temporales de reproducción y la eliminación de grabaciones son una fase posterior; esta implementación no expone objetos del bucket ni afirma que exista reproducción hasta que esa integración esté construida y verificada.

## Biblioteca privada de grabaciones

Cada intento de grabación genera un registro independiente para conservar el historial de una misma transmisión. La biblioteca solo lista grabaciones finalizadas del propietario:

- `GET /api/me/recordings`: devuelve las últimas 100 grabaciones finalizadas del usuario.
- `GET /api/me/recordings/:recordingId/playback`: devuelve una URL S3 firmada por 5 minutos, únicamente para el propietario.

Las URLs de reproducción se firman con AWS Signature Version 4 y requieren HTTPS. La API no expone las claves de almacenamiento ni la ruta del objeto. La URL temporal no debe guardarse como enlace permanente ni compartirse públicamente.
