# PLAYVERSE — infraestructura autohospedada

Este stack ejecuta el backend, la base de datos, el servidor de medios y el proxy HTTPS en infraestructura administrada por el propietario. No usa los servidores de Omlet Arcade ni un backend de streaming administrado.

## Servicios

- **API PLAYVERSE:** Node.js + Express, empaquetada desde este repositorio.
- **MongoDB Community 7:** base persistente con autenticación y volumen Docker.
- **LiveKit Server:** SFU WebRTC autohospedado para audio/video en tiempo real.
- **Caddy:** proxy inverso y certificados HTTPS automáticos para los dominios configurados.

Todo el software de esta composición puede ejecutarse sin licencias de servicio pagas. Eso no vuelve gratuito el hardware, electricidad, conexión a Internet, dominio o ancho de banda del servidor.

## Requisitos de la máquina anfitriona

- Linux x86-64 recomendado para una instalación pública continua.
- Docker Engine y Docker Compose plugin.
- IP pública alcanzable y router/firewall bajo control del propietario.
- Para una prueba local, una computadora puede alojar los contenedores; para usuarios externos debe permanecer encendida y conectada.
- El rendimiento de video depende del CPU, ancho de banda de subida, latencia, puertos UDP disponibles y cantidad de participantes. No se promete capacidad de concurrencia sin pruebas de carga.

## Preparación

1. Configurá registros DNS A/AAAA de API_DOMAIN y LIVE_DOMAIN hacia la IP pública de tu servidor.
2. Copiá .env.selfhost.example a .env.selfhost.
3. Reemplazá todos los valores de ejemplo por secretos aleatorios únicos. La contraseña MongoDB debe ser alfanumérica para evitar problemas de codificación en la URI.
4. Configurá CORS_ORIGIN con el origen HTTPS exacto de la API y LIVEKIT_URL con wss:// más el dominio LiveKit.
5. Abrí y redirigí TCP 80/443, TCP 7881 y UDP 50000-50100 hacia el host. El rango UDP se usa para el transporte de medios WebRTC.
6. Ejecutá:

~~~bash
docker compose --env-file .env.selfhost up -d --build
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs -f api livekit caddy
~~~

La API solo se considera lista cuando MongoDB responde. Caddy obtiene certificados para dominios públicos válidos; para pruebas de red local sin DNS público, usá un entorno local separado y no publiques los puertos en Internet.

## Operación

~~~bash
docker compose --env-file .env.selfhost pull
docker compose --env-file .env.selfhost up -d --build
docker compose --env-file .env.selfhost logs --tail=200 api livekit
docker compose --env-file .env.selfhost exec mongo mongosh -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin
~~~

MongoDB persiste en el volumen playverse_mongo_data; Caddy guarda estado y certificados en playverse_caddy_data y playverse_caddy_config. Hacé backups externos periódicos y probá su restauración antes de almacenar datos importantes.

## Límites que deben resolverse antes de una apertura pública

- Esta composición es un nodo propio único, no una malla mundial ni alta disponibilidad.
- El SFU autohospedado no incluye todavía un servicio TURN/TLS dedicado, grabación/egress, transcodificación ni distribución HLS/CDN. Algunas redes restrictivas pueden necesitar TURN; las grabaciones requieren desplegar y operar el servicio Egress y almacenamiento.
- use_external_ip requiere que el host tenga IP pública correctamente detectable y que el rango UDP esté abierto.
- No se incluye escalado horizontal, replicación multi-región, orquestación, alertas externas ni recuperación automática ante pérdida física del host.
- No guardes secretos reales en Git. .env.selfhost está excluido por .gitignore/.dockerignore; verificá que no se haya agregado por accidente.

## Seguridad

- No uses credenciales de ejemplo ni el modo --dev en Internet.
- Restringí MongoDB a la red Docker privada; no publiques el puerto 27017.
- Permití solo los puertos necesarios en el firewall.
- Usá secretos largos, únicos y rotalos si se exponen.
- Configurá backups cifrados y probá restauraciones.
- Medí CPU, memoria, pérdida de paquetes, bitrate, latencia y conexiones simultáneas antes de anunciar capacidad.

Documentación primaria: https://docs.livekit.io/transport/self-hosting/deployment/ y https://docs.livekit.io/transport/self-hosting/.
