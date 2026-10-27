---
name: deepseek-reminder-stub
description: Arquitecto de preparación para IA con DeepSeek (Fase 2). Usar únicamente para dejar lista la estructura de base de datos e interfaces de recordatorios sin implementar la lógica compleja hoy.
---

# Estructura Desacoplada para DeepSeek (Fase 2)

1. Alcance en Fase 1 (MVP):
   - Crear tabla `ReminderQueue` (`id`, `slot_id`, `barber_id`, `client_phone`, `scheduled_for`, `status`, `generated_message`).
   - Crear interfaz `IReminderProvider` en NestJS con un `MockDeepSeekReminderService` que registre en consola cuando un turno pasa a `CONFIRMED` si `reminder_addon_active == true`.
