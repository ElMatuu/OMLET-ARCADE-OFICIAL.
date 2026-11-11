# Suscripciones y pagos a creadores — función futura, desactivada

PLAYVERSE no procesa pagos reales, no vende monedas y no paga ingresos a creadores en la etapa actual. La interfaz solo puede informar que la monetización está en desarrollo. No se debe mostrar checkout, precio pagable, estado de suscripción activa ni promesa de pago hasta que la integración real exista y haya sido verificada.

## Requisitos para habilitarla

1. Seleccionar un proveedor de pagos que opere legalmente en cada país de lanzamiento y soporte suscripciones recurrentes, impuestos, reembolsos, contracargos y pagos a creadores.
2. Obtener aprobación de la plataforma/proveedor y revisar sus términos, políticas de contenido y restricciones geográficas.
3. Mostrar precios localizados en la moneda del país, con frecuencia mensual/anual, impuestos y fecha de renovación claramente informados. El precio debe venir del proveedor/configuración validada, nunca de una conversión aproximada en el cliente.
4. Implementar OAuth/Connect o onboarding equivalente para que cada creador complete identidad, titularidad, verificación, datos fiscales y cuenta bancaria directamente con el proveedor. No recolectar contraseñas bancarias.
5. Mantener estados separados: pendiente, activa, impaga, cancelada, reembolsada, disputada y payout retenido.
6. Procesar webhooks firmados con idempotencia, protección anti-replay, almacenamiento de eventos y conciliación. El cliente no puede declarar una suscripción pagada.
7. Calcular comisiones, retenciones, impuestos y saldos pagables en el servidor con libro contable de doble entrada; no usar el saldo de monedas virtuales como dinero.
8. Crear procesos de KYC/AML cuando el proveedor o la legislación lo exijan, además de soporte, reembolsos, privacidad, conservación de registros y resolución de disputas.
9. Someter la función a revisión legal y de seguridad en cada jurisdicción antes de activar cobros.

## Responsabilidad y transparencia

Una cláusula de términos no elimina las obligaciones legales que correspondan a PLAYVERSE, al proveedor o al creador. Los roles, responsabilidades, comisiones, impuestos y soporte deben definirse claramente en contratos y políticas aplicables. No afirmar que la aplicación no tiene responsabilidad absoluta.

## Seguridad

- Secretos y claves privadas solo en el gestor de secretos del entorno, nunca en el repositorio, frontend, APK, logs o capturas.
- Cifrado en tránsito y en reposo, scopes mínimos, rotación de credenciales, MFA para administración, controles de acceso, auditoría y alertas.
- Separar el sistema de monedas virtuales de los pagos fiat y de los saldos de payout.
- Pruebas de idempotencia, concurrencia, fraude, reembolso, chargeback y conciliación antes del lanzamiento.
