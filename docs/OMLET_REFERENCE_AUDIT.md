# Auditoría de referencia histórica — Omlet Arcade

## Objetivo y límites

Esta auditoría reconstruye la experiencia de producto a partir de versiones archivadas, fichas históricas, capturas y tutoriales públicos. No es documentación interna de MobiSocial ni una especificación oficial de su backend.

**Referencia Android principal:** versión archivada **1.111.9**. Uptodown la identifica como la versión disponible más reciente en su archivo y muestra una fecha de publicación de 16 de agosto de 2023. Aptoide también identifica 1.111.9 como última versión, con metadatos de actualización del 19 de junio de 2023. Las fechas de los repositorios no coinciden; por eso se conserva el número de versión como referencia y no se afirma una fecha única de lanzamiento.

## Evidencia visual y audiovisual

- Galería de ocho capturas archivadas de Omlet Arcade 1.111.9: https://omlet-arcade.uptodown.com/android
- Descripción y notas archivadas de la versión 1.111.9: https://omlet-arcade.bd.aptoide.com/app
- Recorrido en video de la app, la comunidad y las transmisiones (YouTube, 2022): https://www.youtube.com/watch?v=7gvXXJ00k4Y
- Tutorial histórico de transmisión de partidas a plataformas externas: https://www.apowersoft.com/stream-game-omlet-arcade.html
- Descripción histórica de botón flotante, grabación, chat, voz grupal y Minecraft: https://www.androidblip.com/android-apps/mobisocial.arcade.html

Las capturas de Uptodown son la referencia visual principal para la composición móvil. Los tutoriales de terceros sirven para entender recorridos y permisos; no se consideran prueba de código, protocolos internos ni del diseño exacto de cada versión.

## Inventario de funciones documentadas

### Confirmadas en notas o fichas de la última versión archivada 1.111.9

- Inicio renovado y acceso más directo a conversaciones.
- Perfiles personalizables con fotos, enlaces sociales e historias.
- Llamadas de voz grupales con amigos gamers (función beta en las notas archivadas).
- Búsqueda de GIFs en chat de transmisiones y chat grupal.
- Publicación de videos, imágenes y enlaces desde otras aplicaciones.
- Omlet Lucky Draw y mejoras de detección facial de avatares, según el historial de versiones archivado.

### Funciones históricas documentadas en fichas y tutoriales anteriores

- Emisión en vivo de partidas y grabación de pantalla.
- Botón flotante/HUD para abrir controles y chat mientras se juega.
- Chat público y grupal asociado a juegos, perfiles y comunidades.
- Seguimiento de creadores, descubrimiento de directos y navegación de transmisiones por juego.
- Perfiles, clips, historias, comentarios y publicaciones multimedia.
- Voz en grupo para coordinar escuadrones.
- Emisión hacia destinos externos como YouTube, Facebook y Twitch; las opciones concretas dependían de versión, plataforma y plan.
- Comunidades/clubes, roles de coadministrador y moderación.
- Experiencias de Minecraft: juego multijugador, avisos de partidas y compartición de mapas/mundos.
- Avatares, artículos cosméticos, tienda y monedas virtuales; los nombres y reglas de cada economía deben verificarse por versión antes de reproducirlos.

Este inventario distingue funciones de la última ficha archivada de capacidades descritas en versiones anteriores. No debe interpretarse como prueba de que cada función estuviera habilitada simultáneamente en 1.111.9.

## Estado del servicio original

Las fuentes públicas consultadas sitúan el cierre del servicio original el **30 de junio de 2023** y describen un aviso de cierre publicado pocos días antes. El aviso original ya no está disponible en un canal oficial verificable durante esta auditoría; la fecha se conserva como dato histórico respaldado por archivos y referencias secundarias, no como un estado operativo actual.

La disponibilidad de un APK archivado no implica que las cuentas, directos, comunidades, compras, monedas o servicios remotos originales sigan funcionando. El proyecto nuevo debe tener infraestructura, datos, políticas y operaciones propias; no puede depender de servidores originales que ya no están disponibles.

## Base de datos y arquitectura: qué se sabe y qué no

**No se encontró una fuente pública fiable que identifique el motor de base de datos, el esquema, los proveedores cloud ni la topología interna que usó Omlet Arcade.** No se debe inventar que el original utilizaba MongoDB, Firebase, MySQL u otro producto.

La arquitectura actual de este repositorio es una decisión propia del proyecto y no una afirmación sobre Omlet original:

- MongoDB 7 como base de datos documental.
- Mongoose como ODM y modelos por dominio.
- API Node.js/Express y autenticación por JWT.
- Socket.IO para eventos y comunicación en tiempo real de la aplicación.
- LiveKit como SFU para medios en vivo, con credenciales del servidor separadas del cliente.
- Caddy como proxy TLS en el despliegue autoalojado.
- Docker Compose para API, MongoDB y LiveKit; los perfiles opcionales de Minecraft son plantillas y no servidores públicos ya provisionados.

Modelos actuales del proyecto incluyen cuentas, perfiles, publicaciones, historias, comentarios, amistades, seguidores, bloqueos, reportes, notificaciones, presencia, conversaciones, mensajes directos, salas, mensajes de sala, clubes, torneos, inventario, transacciones, misiones, logros, transmisiones y mensajes de transmisión, además de listados de servidores de juego.

## Brechas prioritarias contra la referencia

1. **Captura Android real:** MediaProjection nativa, servicio foreground de tipo mediaProjection, audio de juego cuando el sistema/dispositivo lo permita y publicación de pista de video a LiveKit. El compartir pantalla del navegador no reemplaza esto.
2. **HUD flotante completo:** controles reales de directo, micrófono, cámara, chat, estado de emisión y finalizar; no solo accesos de navegación.
3. **Experiencia de descubrimiento:** feed social, pestañas por juego, perfiles de juego, creadores seguidos, historias y directos con filtros.
4. **Directo y chat:** mensajes fijados, moderación, co-stream/squad cuando esté diseñado, estados de conexión, reconexión, contadores y clips.
5. **Social:** llamadas de voz grupales, clubs con roles/coadministradores, perfiles públicos, enlaces sociales y solicitudes de chat.
6. **Contenido y economía:** publicaciones multimedia, clips, catálogo de avatares/ítems, inventario y transacciones auditables. No mostrar saldo, recompensas o compras ficticias.
7. **Minecraft y juegos:** descubrimiento de servidores, invitaciones y mapas con permisos y almacenamiento reales. Las plantillas Docker actuales no equivalen a una red de servidores pública.
8. **Windows:** shell de escritorio específico, captura de ventana/pantalla, atajos, chat y reproductor acoplados.
9. **Operación:** notificaciones push, moderación, soporte, privacidad, borrado/exportación de datos, métricas, backups, escalado y respuesta ante abuso.

## Criterios de aceptación

- Comparar cada pantalla con las capturas archivadas de la galería, a resolución suficiente, antes de aprobar su diseño.
- No llamar «en vivo» a una transmisión hasta que el backend reciba confirmación de publicación de video de LiveKit.
- No declarar el HUD, voz, grabación, tienda, clips ni servidores completos hasta probar sus flujos reales.
- Verificar Android en dispositivo físico y Windows en una máquina real; un build de CI no demuestra funcionamiento de captura ni operación.
- Mantener este trabajo en la rama de desarrollo y PR en borrador hasta que el dueño revise los cambios. No hacer merge ni despliegue sin aprobación expresa.
