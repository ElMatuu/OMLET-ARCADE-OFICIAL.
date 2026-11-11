# Economía virtual PLAYVERSE

## Tres monedas separadas

- **Oro PLAYVERSE** (`gold`, campo heredado `walletTokens`): moneda habitual.
- **Violeta PLAYVERSE** (`purple`, campo `walletPurpleTokens`): moneda especial.
- **Diamante PLAYVERSE** (`diamond`, campo `walletDiamondTokens`): moneda de colección de mayor rareza.

Son unidades virtuales internas. No son oro, plata ni diamantes físicos, no representan depósitos, no tienen valor de cambio prometido y no pueden comprarse con dinero real, retirarse ni convertirse en dinero.

## Reglas de integridad

- El servidor decide precio y moneda; el cliente nunca determina el importe debitado.
- Cada compra usa una transacción de base de datos: débito, inventario y asiento contable se confirman juntos o se revierten juntos.
- Los saldos no pueden ser negativos; la operación exige saldo suficiente en la moneda exacta.
- Las misiones se verifican en el servidor, se pueden reclamar una sola vez y acreditan la moneda definida por el catálogo.
- Los movimientos guardan moneda, cantidad, saldo posterior, contraparte cuando existe y fecha.
- No se permite transferirse a uno mismo ni enviar monedas entre cuentas que se bloquearon mutuamente.
- Las transferencias entre usuarios debitan al emisor y acreditan al receptor en una sola transacción. La notificación se emite después de confirmar el movimiento.
- No existe conversión entre Oro, Violeta y Diamante ni un precio monetario implícito.

## Identidad visual

Las tres monedas comparten la marca tipográfica original **PV** y tienen acabados dorado, violeta y diamante/cian. Los efectos visuales son CSS y respetan `prefers-reduced-motion`.

## Estado de la implementación

La API y la interfaz implementan saldos separados, catálogo con moneda por artículo, compra, inventario, historial, recompensa de misión y transferencia de monedas. Antes de habilitar en producción hay que ejecutar la suite en CI y probar transacciones concurrentes contra MongoDB configurado como replica set, porque las transacciones multi-documento requieren soporte de replica set o clúster sharded.
