# PLAYVERSE — mapa de experiencia gamer y paridad funcional histórica

> Documento de producto e ingeniería para reconstruir, con tecnología y marca propias, las capacidades públicas históricas de Omlet Arcade y ampliarlas. No es una especificación de copia de código, identidad visual, recursos gráficos, API privada ni diseño protegido.

## 1. Referencia histórica y alcance

La última versión Android que se puede verificar en los archivos públicos consultados es **Omlet Arcade 1.111.9 (agosto de 2023)**. No se encontró evidencia verificable de una versión pública 2.0 posterior. Las capacidades de producto se documentaron a través de descripciones archivadas, notas de versiones y listados históricos; algunas funciones aparecieron en versiones anteriores y no necesariamente coexistieron en cada compilación. La plataforma original dejó de operar en 2023. PLAYVERSE no depende de sus servidores, cuentas, API ni infraestructura.

## 2. Mapa de experiencia de PLAYVERSE

La navegación se organiza por tareas del jugador y del creador, con acceso rápido desde el control flotante:
1. **Inicio / Feed:** publicaciones, clips, historias, directos recomendados, juegos seguidos y actividad de amigos.
2. **En vivo:** descubrir directos, reproducir, seguir creadores, chat de espectadores, compartir y reportar.
3. **Chat:** mensajes privados, grupos, solicitudes, voz y notificaciones.
4. **Salas / Escuadras:** crear, buscar y unirse a grupos por juego, invitaciones, miembros, chat y coordinación.
5. **Juegos y servidores:** directorio por juego/edición/región; conexión a servidores externos y, cuando exista infraestructura de hosting configurada, aprovisionamiento de servidores propios.
6. **Amigos:** perfiles, seguir, solicitudes, presencia y bloqueo.
7. **Clubs:** comunidades públicas/privadas con roles, moderación, publicaciones y chat.
8. **Torneos / eSports:** inscripción individual/equipo, check-in, códigos de invitación, cuadros, resultados y clasificación.
9. **Misiones y recompensas:** objetivos diarios, semanales, de onboarding y de creador; progreso verificable y reclamación idempotente.
10. **Tienda / Inventario:** cosméticos y herramientas visuales; previsualización, compra con monedas internas, equipamiento y devolución visual en los lugares compatibles.
11. **Billetera:** saldos separados de monedas internas, historial auditable, regalos/transferencias con límites y protección antifraude. No habilitar dinero real.
12. **Perfil / Canal:** avatar, biografía, juegos, insignias, marcos, fondos, estadísticas, publicaciones, clips y directos archivados.
13. **Centro de creador:** configuración previa al directo, escenas/HUD, cámara, micrófono, captura de pantalla, calidad adaptativa, métricas y moderación.
14. **Control flotante:** accesos compactos y movibles para chat, voz, directo, escuadra/sala, notificaciones y regreso a PLAYVERSE; permisos opcionales, accesibilidad, no bloquear controles del juego.
15. **Ajustes y seguridad:** privacidad, notificaciones, dispositivos, permisos de captura, accesibilidad, seguridad, soporte y reportes.

## 3. Capacidades históricas a recuperar

### Streaming y herramientas de creador
- Transmitir partidas móviles y contenido de pantalla con cámara y micrófono opcionales.
- Emitir a la comunidad propia y, cuando el usuario configure sus credenciales/RTMP y la integración esté autorizada, a destinos externos.
- Multistream, perfiles de calidad, bitrate, orientación vertical/horizontal, miniatura, marca de agua, imagen de protección, HUD/overlays y reportes de rendimiento.
- Chat en vivo, espectadores, moderadores, seguidores, regalos virtuales y controles de seguridad.
- Clips/highlights, grabación consentida, historial y publicaciones derivadas.
- Indicadores persistentes de emisión/captura, control claro para detener y recuperación tras interrupciones.

### Juego social
- Escuadras y emisión colaborativa con invitación y roles.
- Salas públicas/privadas, chat de texto y voz grupal en tiempo real.
- Comunidades por juego, clubes, amistades, perfiles por juego y descubrimiento de jugadores.
- Integración con títulos móviles populares sin asumir que PLAYVERSE puede controlar internamente el juego de terceros.
- Minecraft: directorio de mundos/servidores, datos Java/Bedrock, publicación de mapas/mods con revisión de seguridad y licencias, guías de conexión y hosting propio cuando exista un nodo aprovisionador.
- Otros juegos: adaptadores de invitación/enlace/deep-link específicos por juego; no prometer matchmaking o creación de servidores cuando el juego no exponga esa capacidad.

### eSports y aprendizaje
- Torneos por juego y formato: solo, dúo, escuadra/equipo.
- Códigos de invitación, check-in, aprobación de equipos, formación automática, bracket, chat de partida, carga de resultados, revisión de disputas y recompensas.
- Sesiones de entrenamiento 1:1 con agenda, consentimiento, reputación y herramientas de denuncia; no simular reservas si no existe disponibilidad real.

### Economía y personalización
- Monedas internas obtenidas por misiones, participación, logros y campañas verificables.
- Tienda con marcos de avatar, overlays, HUD, stickers/efectos de chat, efectos de entrada, insignias, fondos, reacciones y regalos virtuales.
- Inventario permanente, vista previa, equipar/desequipar y renderizado real en perfil, chat, salas y stream.
- Transferencias y regalos con límites, ledger inmutable, operaciones atómicas, idempotencia, controles de fraude y auditoría.
- No introducir compra de monedas con dinero real, suscripciones de pago, cash-out, apuestas ni promesas de valor monetario.

### Comunidad y descubrimiento
- Feed de publicaciones, fotos y clips; comentarios, reacciones, guardados, hashtags y reportes.
- Historias temporales con expiración, visualizaciones y controles de privacidad.
- Búsqueda por juego, idioma, región, creador, club y directo.
- Rankings con criterios transparentes y protección contra spam/farming.
- Notificaciones dentro de la app y push solo cuando el proveedor esté configurado y el usuario haya dado permiso.

## 4. Auditoría del repositorio en el momento de escribir este documento

La auditoría está basada en los archivos de `main` inspeccionados. La existencia de un modelo o ruta no demuestra que la experiencia esté completa ni que el servicio externo esté desplegado.

| Área | Base que ya existe en el repositorio | Brecha que impide declararla completa |
|---|---|---|
| Feed y social | modelos/rutas para posts, comentarios, likes, guardados, stories y perfiles | almacenamiento seguro de medios, procesamiento de imágenes/video, moderación y pruebas de flujo integral |
| Directos | rutas de sesiones LiveKit, tokens de publicador/espectador, webhook y preferencias | LiveKit real configurado, captura Android/Windows, reproducción probada, escalado, grabación y CDN |
| Chat | conversaciones, mensajes y salas con persistencia | voz grupal LiveKit, llamadas, presencia robusta, push y reconexión multi-instancia |
| Salas/escuadras | salas, membresía, solicitudes, mensajes y sockets | invitaciones profundas, voz, estados de escuadra y prueba multiusuario en dispositivos |
| Servidores de juegos | publicaciones, heartbeat seguro y directorio | no aprovisiona máquinas ni instala/actualiza procesos de juego; hace falta un agente/proveedor de hosting propio |
| Minecraft | datos de publicación Java/Bedrock y guía de conexión | plugin/agente de estado, aprovisionamiento y gestión de mundos/mods con revisión |
| Torneos | modelos, inscripción, equipos, check-in, bracket y resultados | validación de partidas, disputas, automatización específica por juego y pruebas con equipos reales |
| Clubs | modelo con miembros/roles y rutas de creación/unión/transferencia/archivo | feed/chat/roles completos, invitaciones y moderación granular |
| Tienda/billetera | catálogo, inventario, tres saldos internos, transferencias, compras y ledger | efectos equipados renderizados de punta a punta, controles antifraude y pruebas de concurrencia |
| Misiones | catálogo, progreso y reclamación de recompensas | motor de eventos confiable, límites antifarming, campañas y panel operativo |
| Overlay | servicio nativo Android y acciones rápidas existentes | interacción completa con sesión, estado, chat/voz, permisos, accesibilidad y pruebas en teléfono real |
| Windows | empaquetado Electron | validación de permisos, captura, actualización y firma en equipo real |

## 5. Reglas de arquitectura para completar la experiencia

### Media plane
- REST/Socket.IO administra identidad, metadatos y señalización; nunca transporta el video de la emisión.
- LiveKit autohospedado es el SFU para audio/video interactivo. Para distribución masiva de espectadores se debe evaluar HLS/LL-HLS y CDN.
- La captura Android debe usar MediaProjection con consentimiento del sistema y servicio en primer plano cuando corresponda.
- La captura Windows debe mostrar selector de pantalla/ventana y estado visible.
- La calidad se negocia según códec, encoder, memoria, temperatura, batería y red. No mostrar opciones no soportadas.
- Grabaciones y clips requieren almacenamiento de objetos, trabajos de transcodificación, miniaturas, URLs firmadas, retención y moderación.

### Hosting de juegos
- Separar el directorio de servidores comunitarios del producto de aprovisionamiento.
- El aprovisionador solo crea servidores en nodos PLAYVERSE controlados, usando colas de trabajo, cuotas, límites por cuenta, aislamiento de contenedores, límites CPU/RAM/disco/red, firewall, backups y apagado seguro.
- Cada juego necesita una plantilla versionada, aceptación de EULA/licencia, validación de puertos, health check, logs y ciclo de vida.
- No ofrecer servidores gratuitos ilimitados ni indicar que Free Fire u otros juegos propietarios permiten hosting propio si no existe API/servidor dedicado oficial.
- No guardar tokens de proveedores en el cliente ni en repositorio.

### Economía
- El saldo se modifica exclusivamente en el backend dentro de transacciones atómicas.
- Cada movimiento tiene identificador idempotente, actor, contraparte, moneda, cantidad, motivo y saldo resultante.
- El cliente nunca envía el saldo final que desea establecer.
- Recompensas y compras se prueban con concurrencia, repetición de requests, saldo insuficiente y cuentas bloqueadas.
- Mantener la economía como puntos virtuales no convertibles ni canjeables por dinero.

### Seguridad y confianza
- Reportar, bloquear, silenciar y moderar usuarios, mensajes, salas, publicaciones y directos.
- Controles de privacidad por edad/país cuando corresponda, consentimiento de cámara/micrófono/captura, minimización de datos y borrado/exportación.
- Límites de tasa, validación de contenido, escaneo de archivos y URLs, protección de credenciales y registro de acciones administrativas.
- No incluir IDs de SDK, secretos, claves, certificados o identificadores de terceros copiados de APKs ajenos.

## 6. Orden de implementación y aceptación

1. **Estabilidad de build y release:** Android y Windows compilan; instalar y abrir en dispositivos reales; login, sesión, permisos, actualizaciones y recuperación de red.
2. **Social end-to-end:** feed, imágenes seguras, historias, perfiles, follows, amigos, mensajes, notificaciones, clubs y moderación.
3. **Gaming social:** salas, escuadras, invitaciones y voz grupal; probar dos o más cuentas y teléfonos simultáneos.
4. **Directos reales:** configurar el SFU propio, captura móvil/Windows, publicación, espectadores, chat, desconexión/reconexión y cierre; validar con dos dispositivos.
5. **Creador y cosméticos:** renderizar HUD/frames/efectos comprados en las vistas correspondientes, no solo marcar inventario como equipado.
6. **Misiones/economía:** progresión con eventos del servidor, ledger, antifraude, regalos y tienda íntegramente interna.
7. **Torneos y servidores:** torneos con resultados verificables; aprovisionador de servidores únicamente después de disponer de un nodo propio, cuotas y aislamiento.
8. **Escala y lanzamiento:** pruebas de carga, seguridad, backup/restore, moderación, métricas, alertas, política de privacidad, términos y despliegue gradual.

## 7. Criterio de terminado

Un botón solo se considera funcional cuando completa una acción real y visible, maneja fallos, persiste el resultado y tiene prueba automatizada o manual reproducible. Una ruta API no significa que el servicio externo esté operativo; un APK compilado no significa que esté probado en hardware; un servidor publicado en el directorio no significa que PLAYVERSE lo esté alojando.

Cada módulo debe mantener una ficha de estado: `implemented`, `integrated`, `configured`, `tested` y `production-ready`. No se permite convertir un estado en otro por suposición.

## 8. Identidad de marca

PLAYVERSE conserva nombre, logotipo de joystick, iconografía, paleta, tipografía, animaciones y lenguaje visual propios. Se puede recuperar la amplitud funcional y los patrones generales de interacción de una plataforma gamer social, pero no se deben reutilizar sin licencia los logotipos, ilustraciones, iconos exclusivos, textos, código, recursos ni la composición visual protegida de Omlet Arcade. Si el titular aporta una licencia verificable para algún activo concreto, se revisa ese activo por separado.


## 9. Verificación de versiones históricas solicitadas

La referencia escrita como **1.44.2** no pudo confirmarse en los archivos públicos consultados. Sí hay registros verificables de **1.44.1 (build 691)**, publicada en marzo de 2019. Su registro histórico menciona Hotness Boosts para destacar directos, salto automático al siguiente directo cuando termina el actual, eliminación de notificaciones de solicitudes de chat grupal y destacados de amigos que comienzan a transmitir. No se debe atribuir ese changelog a una supuesta 1.44.2 sin evidencia.

Para la etapa final del producto Android, los archivos públicos consultados registran **1.111.9**, fechada el 16 de agosto de 2023. Esa es una referencia histórica posterior y más completa para el alcance global del producto; no implica que todas las funciones históricas estuvieran presentes simultáneamente ni que los servicios originales sigan activos.

Fuentes públicas de referencia:
- APKMirror, Omlet Arcade 1.44.1 (build 691), metadatos y ficha de versión: https://www.apkmirror.com/apk/omlet-inc/omlet-arcade-stream-meet-and-play/omlet-arcade-stream-meet-and-play-1-44-1-release/omlet-arcade-stream-meet-play-1-44-1-android-apk-download/
- APKPure/APK listings, changelog histórico de 1.44.1: https://omlet-arcade.apkcafe.es/
- Uptodown, archivo de versiones y registro de 1.111.9 (16 de agosto de 2023): https://omlet-arcade.uptodown.com/android/versions

Estas fuentes se usan únicamente para identificar capacidades públicas e historia de versiones. No se extrae ni incorpora código, claves, endpoints privados, SDKs propietarios ni recursos de APKs de terceros.
