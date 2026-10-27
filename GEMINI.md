# Contexto Global del Proyecto: Turnero PWA para Barberías

## Modelo de Negocio
- Plataforma SaaS gratuita para barberos.
- Monetización 1 (Seña): El cliente final abona una seña fija de $2.000 ARS por turno mediante Mercado Pago. Ese dinero es 100% ganancia del dueño de la plataforma (entra directo a la cuenta central de Mercado Pago de la plataforma).
- Monetización 2 (Reminder IA - 3 USD): Módulo de recordatorios configurables. Lo activa o desactiva manualmente el SuperAdmin desde su panel (`reminder_addon_active: boolean`).

## Stack Tecnológico
- Backend: NestJS (TypeScript) + Prisma ORM + PostgreSQL (Supabase) + JWT Auth + `@nestjs/schedule`.
- Frontend: React (Vite PWA con `manifest.json` y Service Worker) + Tailwind CSS.
- Autenticación (DNI + Password):
  - Sin emails. Todos los usuarios (`SUPERADMIN`, `BARBER`, `CLIENT`) inician sesión con `dni` y `password`.
  - Los clientes se loguean tocando el botón con el ícono de una personita ubicado arriba a la derecha en el Header.

## Reglas de Oro para Gemini CLI
- Antes de escribir cualquier componente visual, consultá y aplicá obligatoriamente la skill `anti-generic-ui`.
- Antes de tocar lógica de agendas o turnos, aplicá la skill `booking-engine` (turnos estrictos de 30 minutos).
- Antes de tocar pagos, señas o permisos del módulo de 3 USD, aplicá la skill `payment-monetization`.
