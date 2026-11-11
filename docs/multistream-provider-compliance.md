# Diseño de multistream de PLAYVERSE

## Objetivo

Permitir que un creador emita desde PLAYVERSE/LiveKit hacia destinos autorizados como YouTube Live, Twitch, Kick y otros proveedores compatibles con RTMP, siempre que el creador tenga cuenta y permiso para retransmitir.

## Reglas por proveedor

- Twitch permite simulcast sujeto a sus reglas: la experiencia en Twitch no puede ser peor que en otros destinos; no se debe dirigir activamente a la audiencia de Twitch hacia otras plataformas; y no se deben combinar actividades de otras plataformas en el stream de Twitch cuando sus reglas lo prohíben.
- YouTube Live requiere gestionar eventos/streams mediante sus APIs y cumplir sus políticas de contenido, API, autenticación y cuotas.
- Kick publica reglas particulares para multistreaming; los requisitos pueden variar por tipo de cuenta y programa de partners. Verificar los términos vigentes antes de habilitar un destino.
- Un proveedor RTMP genérico no implica que todos los servicios permitan retransmisión simultánea.

## Arquitectura objetivo

1. OAuth oficial por proveedor cuando exista una API adecuada; nunca pedir contraseñas.
2. Para RTMP manual, aceptar URL de ingest y stream key en un formulario privado, con confirmación del usuario y cifrado en reposo. Mostrar la clave enmascarada y permitir rotación/eliminación.
3. Mantener una salida independiente por destino y su estado (validando, listo, transmitiendo, error, desconectado).
4. Un motor de egress/restream recibe una sola fuente y crea las salidas necesarias. Reintentos con backoff, límites de concurrencia y alertas de ancho de banda.
5. No mezclar chats ni datos entre plataformas cuando sus reglas lo impidan. El chat de PLAYVERSE puede permanecer independiente.
6. Registrar consentimientos, destino elegido, hora de inicio/fin y errores técnicos; nunca registrar claves.
7. Ofrecer al creador un modo de prueba y verificación de permisos antes de salir en vivo.

## Requisitos de infraestructura no disponibles por defecto

- Un servicio de egress/restream en producción con capacidad medida.
- Almacenamiento seguro de secretos, rotación y auditoría.
- OAuth apps aprobadas, scopes mínimos, revisión de políticas y cuotas de API.
- Ancho de banda de salida, transcodificación, observabilidad, límites por región y plan de contingencia.

## Estado

La integración de LiveKit en PLAYVERSE permite salas de emisión propias y un overlay de navegador. Eso no equivale todavía a multistream de producción. No mostrar un destino como conectado ni simular estado de transmisión hasta que una salida real haya sido aceptada por el proveedor y esté entregando video.
