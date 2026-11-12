# Omlet Arcade — servidores propios y despliegue autogestionado

## Objetivo

La plataforma debe poder operar sobre infraestructura controlada por el proyecto, sin depender de un panel OBS para el flujo móvil. El repositorio ya contiene un stack Docker Compose autogestionado para API, MongoDB, LiveKit y Caddy. Esto es configuración reproducible, no significa que haya máquinas contratadas, DNS configurado o servicios públicos activos.

## Plano de control

El archivo raíz `docker-compose.yml` levanta:

- **API Omlet Arcade:** Node.js/Express y Socket.IO, autenticación, perfiles, chat, comunidades, sesiones de directo y catálogo de servidores de juego.
- **MongoDB 7:** datos persistentes y autenticación de base de datos.
- **LiveKit Server:** plano de medios WebRTC para publicación y visualización interactiva.
- **Caddy:** TLS automático y proxy HTTPS/WSS para API y LiveKit.

Los volúmenes persistentes de MongoDB y Caddy no deben eliminarse durante actualizaciones. Los secretos se guardan únicamente en `.env.selfhost`, que no se versiona.

## DNS y puertos

Configurar dos nombres DNS que apunten al host:

- `API_DOMAIN`: API HTTPS y Socket.IO seguro.
- `LIVE_DOMAIN`: señalización LiveKit por WSS.

Abrir en firewall del host:
- TCP 80 y 443 para Caddy y certificados.
- TCP 7881 para fallback ICE/TCP de LiveKit.
- UDP 3478 para TURN.
- UDP 50000–50100 para medios WebRTC.
- UDP 50101–50200 para relay TURN configurado.

El puerto 7880 queda interno a la red Docker y no se publica directamente. La IP pública y los rangos UDP deben verificarse desde fuera de la red antes de habilitar emisiones.

## Servidores dedicados de juegos

El stack incluye plantillas opcionales para instancias propias de **Minecraft Java (Paper)** y **Minecraft Bedrock**, bajo el perfil Docker Compose `game-servers`. No se inician con el despliegue principal; requieren aceptar EULA, revisar recursos/puertos y habilitarlas expresamente con `docker compose --env-file .env.selfhost --profile game-servers up -d`. Cada instancia conserva su mundo en un volumen independiente.

Los mundos de Minecraft u otros juegos no se alojan automáticamente dentro de la API ni de LiveKit. Cada nodo de juego necesita su proceso/imagen dedicada, puertos de juego, límites de CPU/RAM, almacenamiento persistente, backups, firewall y una identidad de agente independiente.

El agente existente `scripts/game-server-agent.js` informa latido autenticado y consulta protocolos Minecraft Java/Bedrock o TCP genérico. El servidor de Omlet Arcade guarda el listado; no crea mundos ni ejecuta procesos de juego remotos por sí solo.

Secuencia de expansión:
1. Provisionar nodos Linux dedicados en una red controlada por el proyecto.
2. Desplegar imágenes versionadas por juego y plantillas de configuración.
3. Generar un token distinto por instancia, guardar solo su hash en la API y rotarlo ante cualquier exposición.
4. Aplicar cuotas de CPU/RAM, límites de jugadores, firewall por puerto y política anti-abuso.
5. Configurar backups automáticos de mundos, retención, restauración de prueba y actualización con rollback.
6. Registrar métricas de disponibilidad, latencia, uso y fallas sin exponer secretos.

No se deben anunciar servidores exclusivos disponibles hasta que haya nodos reales provisionados y una prueba de conexión externa satisfactoria.

## Alta disponibilidad y escalado

La configuración actual es una instalación de un solo host y un solo escritor MongoDB. No es un clúster global ni alta disponibilidad. Para varias réplicas de API se requiere un adaptador Socket.IO compartido, coordinación de trabajos, rate limits distribuidos y drenaje de conexiones. Para escalar LiveKit hacen falta nodos SFU, TURN, balanceo, puertos UDP, capacidad de red y pruebas de carga.

La grabación, clips y VOD necesitan además almacenamiento de objetos, procesamiento/transcodificación y entrega CDN. No se debe guardar vídeo en el volumen del contenedor API.

## Variables requeridas

Tomar los nombres y validaciones de `.env.selfhost.example` y `docker-compose.yml`. En particular: credenciales MongoDB, `JWT_SECRET` de alta entropía, allowlist `CORS_ORIGIN`, `API_DOMAIN`, `LIVE_DOMAIN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET`.

## Procedimiento de despliegue controlado

1. Preparar una máquina Linux con Docker Engine y Docker Compose.
2. Configurar DNS y firewall antes de iniciar servicios.
3. Crear `.env.selfhost` local con secretos nuevos y únicos.
4. Revisar `docker compose config` sin publicar su salida si contiene secretos.
5. Iniciar MongoDB y esperar healthcheck.
6. Iniciar LiveKit y validar conectividad UDP/TCP desde una red externa.
7. Iniciar API y validar `/api/health/live` y `/api/health/ready`.
8. Iniciar Caddy y validar HTTPS/WSS, certificados y reconexión Socket.IO.
9. Probar dos cuentas y dos dispositivos: autenticación, chat, comunidad, emisión, reproducción, desconexión y cierre.
10. Probar backup y restauración antes de aceptar datos reales.

No se desplegó ningún servidor ni se consumió infraestructura en esta tarea. No activar servicios pagos ni modificar proveedores sin autorización explícita.
