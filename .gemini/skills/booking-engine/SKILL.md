---
name: booking-engine
description: Especialista en lógica de turnos de 30 minutos, concurrencia y disponibilidad de barberos. Usar al crear modelos Prisma, servicios de agenda o endpoints de reservas.
---

# Reglas del Motor de Turnos (Slots Fijos de 30 Minutos)

1. Duración Estricta de 30 Minutos:
   - Todo turno (`AppointmentSlot`) dura exactamente 30 minutos (`end_time = start_time + 30 min`).
2. Máquina de Estados y Bloqueo Temporal:
   - `AVAILABLE`: Libre para reservar.
   - `PENDING_PAYMENT`: Cliente logueado con DNI inició el pago de la seña ($2.000 ARS). Se setea `locked_until = NOW() + 10 minutes`.
   - `CONFIRMED`: Webhook de Mercado Pago confirmado.
   - Cron Job en NestJS (`@Cron('*/1 * * * *')`) libera a `AVAILABLE` cualquier turno en `PENDING_PAYMENT` vencido.
3. Transacción Atómica:
   - Usar transacciones en Prisma para evitar que dos clientes reserven el mismo bloque de 30 minutos simultáneamente.
