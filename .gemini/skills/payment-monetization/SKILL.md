---
name: payment-monetization
description: Especialista en cobro de señas de $2.000 ARS a cuenta central y control manual del add-on Reminder de 3 USD. Usar en flujos de pago, webhooks y panel SuperAdmin.
---

# Reglas de Monetización, Seña y SuperAdmin

1. Cobro de Seña ($2.000 ARS -> 100% Cuenta de la Plataforma):
   - El checkout genera una preferencia de pago por $2.000 ARS con las credenciales centrales de Mercado Pago (`MP_ACCESS_TOKEN`).
   - El turno solo pasa a `CONFIRMED` mediante `POST /payments/webhook` verificando estado `approved` e idempotencia con `mp_payment_id` (`@unique`).
2. Control Manual del Reminder Configurable (3 USD):
   - `BarberProfile` incluye `reminder_addon_active: Boolean @default(false)` y `reminder_config: Json?`.
   - Solo el `SUPERADMIN` ejecuta `PATCH /admin/barbers/:id/toggle-reminder` para encender o apagar el módulo.
