# Publicar un servidor comunitario en PLAYVERSE

PLAYVERSE ofrece un directorio y una capa de descubrimiento. **No aloja ni administra los mundos anunciados** y no garantiza que un proveedor externo permanezca disponible. El indicador verde significa únicamente que el agente del propietario envió un heartbeat reciente; no es una comprobación independiente de conexión TCP/UDP ni una garantía de que cualquier jugador pueda entrar.

## Crear la publicación

1. Iniciá sesión y abrí **Juegos y Salas → Servidores de la comunidad → Publicar servidor**.
2. Publicá solamente un servidor que administrás o para el que tenés permiso explícito.
3. Guardá el token de heartbeat que se muestra una sola vez. Tratá ese token como una contraseña: no lo publiques ni lo incluyas en capturas.

## Enviar estado real

El servidor o un agente de monitoreo que administres debe enviar un heartbeat cada 30 segundos:

```bash
curl -X POST "https://TU-DOMINIO/api/game-servers/ID/heartbeat" \
  -H "Content-Type: application/json" \
  -H "X-Server-Token: TOKEN_PRIVADO" \
  -d '{"playerCount":12,"maxPlayers":80,"isOnline":true}'
```

Al apagar el servidor, el agente puede enviar `isOnline:false`. Si no llegan heartbeats durante 90 segundos, PLAYVERSE muestra el estado como desconectado y deja el recuento como desconocido; no inventa un cero.

## Minecraft

- Java: el jugador copia host y puerto y los pega en Multiplayer → Direct Connection o Add Server.
- Bedrock: en móvil/PC puede agregarse desde Play → Servers → Add Server. El puerto predeterminado suele ser 19132, pero el propietario debe publicar el puerto real.
- El botón de abrir Minecraft solo intenta abrir la aplicación. No promete conectarse automáticamente: los deep links internos de Minecraft pueden cambiar y Microsoft advierte que no deben ser una dependencia crítica.
- La instalación/compra se realiza en los canales oficiales de Minecraft; PLAYVERSE no distribuye copias del juego.

## Capacidad, costo y seguridad

- Cada cuenta puede publicar hasta cinco servidores; el directorio lista hasta cien resultados por consulta.
- El campo de capacidad describe el límite que informa el anfitrión, no una capacidad garantizada por PLAYVERSE.
- El contador es un dato declarado por el agente/plugin del propietario. Solo refleja la población real si ese agente consulta correctamente el proceso del juego; PLAYVERSE no lo verifica de forma independiente.
- No se deben anunciar servidores ajenos, falsos, comprometidos o que distribuyan contenido sin licencia.
- Nunca publiques tokens, contraseñas, direcciones privadas de tu red ni datos personales.
- Los límites de la plataforma de hosting del juego dependen del proveedor y del hardware contratado. PLAYVERSE no promete hosting gratuito ilimitado ni 100.000 jugadores por servidor.

## API

- `GET /api/game-servers?game=Minecraft` — listado para cuentas autenticadas.
- `POST /api/game-servers` — crea una publicación autenticada y devuelve el token una sola vez.
- `POST /api/game-servers/:serverId/heartbeat` — actualiza presencia y jugadores con `X-Server-Token`.
- `DELETE /api/game-servers/:serverId` — elimina la publicación; solo el propietario.

El token se almacena como SHA-256 y nunca se devuelve en listados. El estado mostrado es **heartbeat recibido**, no una prueba de que el puerto del juego acepte conexiones.
