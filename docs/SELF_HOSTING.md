# PLAYVERSE — infraestructura autohospedada

Este stack ejecuta el backend, la base de datos, el servidor de medios y el proxy HTTPS en infraestructura administrada por el propietario. No usa los servidores de Omlet Arcade ni un backend de streaming administrado.

## Servicios

- **API PLAYVERSE:** Node.js + Express, empaquetada desde este repositorio.
- **MongoDB Community 7:** base persistente con autenticación, volumen Docker y replica set de un solo nodo (`rs0`) para habilitar transacciones multi-documento. El healthcheck inicializa el replica set y espera a que el nodo sea primary antes de habilitar la API.
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
3. Reemplazá todos los valores de ejemplo por secretos aleatorios únicos. La contraseña del administrador MongoDB debe ser alfanumérica. La cuenta de aplicación debe usar entre 24 y 128 caracteres alfanuméricos, guiones o guiones bajos; la API recibe únicamente permisos readWrite sobre la base playverse, no credenciales de administrador.
4. Configurá CORS_ORIGIN con el origen HTTPS exacto de la API y LIVEKIT_URL con wss:// más el dominio LiveKit.
5. Abrí y redirigí TCP 80/443, TCP 7881 y UDP 3478, 50000-50100 y 50101-50200 hacia el host. El rango UDP se usa para el transporte de medios WebRTC.
6. Ejecutá:

~~~bash
docker compose --env-file .env.selfhost up -d --build
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs -f api livekit caddy
~~~

Para generar Android o Windows contra tu servidor, cargá las variables del archivo .env.selfhost en la terminal y ejecutá el build con PLAYVERSE_API_URL=https://API_DOMAIN. Por ejemplo, en Linux: export PLAYVERSE_API_URL=https://api.example.com; npm run android:build. En Windows PowerShell: $env:PLAYVERSE_API_URL='https://api.example.com'; npm run build:win. La preparación web genera www/config.js con ese endpoint para el APK/instalador. La aplicación web alojada en el mismo origen utiliza automáticamente el dominio de la API. Para el cliente Electron de Windows, configurá la variable de entorno PLAYVERSE_API_URL con la URL HTTPS de tu API autohospedada antes de iniciar PLAYVERSE; el preload aislado la expone al renderer sin habilitar Node.js en la interfaz.\n\nLa API solo se considera lista cuando MongoDB responde. Caddy obtiene certificados para dominios públicos válidos; para pruebas de red local sin DNS público, usá un entorno local separado y no publiques los puertos en Internet.

## Operación

~~~bash
docker compose --env-file .env.selfhost pull
docker compose --env-file .env.selfhost up -d --build
docker compose --env-file .env.selfhost logs --tail=200 api livekit
docker compose --env-file .env.selfhost exec mongo mongosh -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin
~~~

En el primer arranque del volumen, el contenedor crea la cuenta de aplicación y el healthcheck inicializa `rs0`; la API espera a que el nodo sea primary antes de comenzar. El replica set es de un solo nodo y no proporciona alta disponibilidad. MongoDB crea una cuenta de aplicación separada con permisos readWrite únicamente sobre playverse; la API no utiliza el usuario administrador. La inicialización se ejecuta solo al crear por primera vez el volumen, así que cambiar credenciales luego requiere un procedimiento de rotación manual. MongoDB persiste en el volumen playverse_mongo_data; Caddy guarda estado y certificados en playverse_caddy_data y playverse_caddy_config. Hacé backups externos periódicos y probá su restauración antes de almacenar datos importantes.

## Límites que deben resolverse antes de una apertura pública

- Esta composición es un nodo propio único, no una malla mundial ni alta disponibilidad.
- El SFU incluye TURN/UDP autohospedado en el puerto 3478 y un rango de relé UDP 50101-50200. No incluye TURN/TLS para redes que bloqueen UDP, grabación/egress, transcodificación ni distribución HLS/CDN. Las grabaciones requieren desplegar y operar el servicio Egress y almacenamiento.
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
