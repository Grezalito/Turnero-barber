# 💈 Turnazo — Turnero PWA para barberías

Turnazo es una aplicación multi-barbería para publicar turnos de 30 minutos, tomarlos con una seña cobrada por Mercado Pago y enviar recordatorios por Web Push y email. Tiene tres roles: `SUPERADMIN`, `BARBER` y `CLIENT`, y todos inician sesión con **DNI + contraseña**.

> Este README solo describe lo que está implementado en el código de este repositorio. Cada afirmación remite al archivo donde se puede verificar.

---

## Funcionalidades

| Funcionalidad | Dónde está |
| :--- | :--- |
| Turnos de **30 minutos** (`SLOT_DURATION_MS`) | `backend/src/appointments/appointments.service.ts` |
| **Bloqueo temporal de 10 minutos** al reservar (`LOCK_DURATION_MS`), con token cuyo hash se guarda en `lock_token_hash` | `backend/src/appointments/appointments.service.ts` |
| Liberación de bloqueos vencidos por cron (cada 1 y cada 2 minutos) | `appointments-cleanup.cron.ts`, `security/privacy-retention.service.ts` |
| Seña por turno: `deposit_amount` con valor por defecto **2000** | `backend/prisma/schema.prisma` |
| Pago con **Mercado Pago** (preferencia + webhook con firma HMAC y tolerancia configurable) | `backend/src/payments/` |
| Pagos aprobados que no pueden asignarse a un turno → `OrphanPayment` (`REQUIRES_REFUND` / `REFUNDED` / `RESOLVED`) | `backend/prisma/schema.prisma` |
| **Recordatorios 24 h y 2 h** antes del turno, para **todos** los turnos `CONFIRMED` (cron cada 10 min, sin depender del add-on `reminder_addon_active`) | `backend/src/notifications/reminder-scheduler.service.ts` |
| Canales: **Web Push** (VAPID; se desactiva si faltan las claves) y **email SMTP**; archivo `.ics` y links de WhatsApp | `backend/src/notifications/`, `backend/src/mail/` |
| Liquidaciones semanales por barbero (`WeeklySettlement`: `bonus_tier`, `bonus_amount_ars`) | `backend/src/admin/` |
| Retención de datos personales: purga diaria (04:00) según `PII_RETENTION_DAYS` (por defecto 30) | `backend/src/security/privacy-retention.service.ts` |
| Rate limiting, cabeceras de seguridad (CSP, HSTS, X-Frame-Options), payload máximo de 64 KB y CORS restringido en producción | `backend/src/security/`, `backend/src/main.ts` |

---

## Stack

Las versiones son los rangos declarados en cada `package.json`.

### Backend (`backend/`)
| Área | Tecnología |
| :--- | :--- |
| Runtime | Node.js — imagen Docker `node:24-alpine`; tests verificados en Node 24.20 |
| Framework | NestJS 10 (`@nestjs/common` ^10.4.22, `@nestjs/core` ^10.3.0), TypeScript ^5.4 |
| Base de datos | PostgreSQL + Prisma 6 (`prisma` / `@prisma/client` 6.19.3 instalado) |
| Auth | `@nestjs/jwt` + `passport-jwt`, contraseñas con `bcrypt` ^5.1.1 |
| Pagos | `mercadopago` ^3.6.1 |
| Tareas programadas | `@nestjs/schedule` ^4.0.1 |
| Notificaciones | `web-push` ^3.6.7, `nodemailer` ^6.9.13 |
| Documentación API | `@nestjs/swagger` ^7.4.2 (Swagger UI en `/docs`) |
| Tests | Jest 29 + ts-jest; E2E contra PostgreSQL embebido con PGlite (`@electric-sql/pglite`) |

### Frontend (`frontend/`)
| Área | Tecnología |
| :--- | :--- |
| UI | React ^18.3.1 + TypeScript ^5.6.2 |
| Bundler | Vite ^5.4.10 |
| Estilos / íconos | Tailwind CSS ^4.0.0 (`@tailwindcss/vite`) + `lucide-react` |
| PWA | `public/manifest.json` + `public/sw.js` (Service Worker con Web Push) |
| Deploy | `vercel.json` (rewrite SPA a `index.html` y cabeceras para `sw.js` / `manifest.json`) |

---

## Estructura

```text
Turnazo/
├── backend/
│   ├── Dockerfile                 # Build multi-stage, node:24-alpine, HEALTHCHECK a /health
│   ├── prisma/                    # schema.prisma, migraciones y seed.ts
│   ├── src/
│   │   ├── admin/                 # Barberos, toggle de recordatorios y liquidaciones (SUPERADMIN)
│   │   ├── appointments/          # Turnos, locks, .ics y cron de limpieza
│   │   ├── auth/                  # Login/registro por DNI, guards JWT y roles
│   │   ├── docs/                  # Configuración de Swagger (DOCS_ENABLED y CSP de /docs)
│   │   ├── health/                # GET /health
│   │   ├── mail/                  # Envío SMTP
│   │   ├── notifications/         # Web Push, recordatorios y links firmados de reserva
│   │   ├── payments/              # Mercado Pago, webhook y pagos huérfanos
│   │   ├── prisma/                # PrismaService
│   │   └── security/              # Rate limit, cabeceras, filtro de excepciones, retención de datos
│   └── test/                      # Suite E2E (PGlite efímero)
└── frontend/
    ├── public/                    # manifest.json, sw.js, íconos
    └── src/                       # components, context, services, types, utils
```

---

## Cómo levantarlo (local)

### Requisitos
- Node.js 24 (la versión de la imagen Docker y la usada para verificar los tests).
- Un PostgreSQL accesible desde `DATABASE_URL`.

### 1. Variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

Completá `backend/.env`. Todos los valores de `.env.example` son falsos. Algunas reglas que aplica el código:

| Variable | Regla |
| :--- | :--- |
| `JWT_SECRET` | **Obligatoria, ≥ 32 caracteres.** Sin ella la API no arranca (`src/auth/jwt-secret.util.ts`). |
| `SUPERADMIN_DNI`, `SUPERADMIN_PASSWORD` | **Obligatorias en cualquier entorno.** La API y el seed fallan si faltan o si la contraseña sigue siendo el placeholder `CAMBIAR_…`. No hay valores por defecto (`src/auth/superadmin-credentials.util.ts`). |
| `FRONTEND_URL` | Orígenes permitidos por CORS (separados por coma). El primero se usa para armar links. En producción, si no se define, se bloquea cualquier origen de navegador. |
| `DOCS_ENABLED` | Vacía: `/docs` está encendido fuera de producción y apagado con `NODE_ENV=production`. `true`/`false` lo fuerzan. Cualquier otro valor aborta el arranque. |
| `METRICS_ENABLED` | Vacía: `GET /metrics` (formato Prometheus) está encendido fuera de producción y apagado con `NODE_ENV=production`. `true`/`false` lo fuerzan. Cualquier otro valor aborta el arranque. No tiene autenticación: en producción dejalo apagado salvo que el puerto no sea público. |
| `MP_ACCESS_TOKEN` | El valor de ejemplo `…CENTRAL-PLATFORM-TOKEN` activa el modo simulado de pagos. |
| `MP_WEBHOOK_SECRET` | Vacía: todos los webhooks se rechazan por firma inválida. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Vacías: el canal push queda deshabilitado. Generar con `npx web-push generate-vapid-keys`. |

`backend/.env.example` documenta el resto (SMTP, `PII_RETENTION_DAYS`, `MP_WEBHOOK_URL`, etc.).

### 2. Backend

```bash
cd backend
npm ci
npx prisma migrate deploy   # aplica las migraciones de prisma/migrations
npm run prisma:seed         # opcional, ver advertencia abajo
npm run start:dev           # http://localhost:3000
```

> **npm 12 bloquea los install scripts por defecto.** Si `npm ci` muestra `install scripts blocked`, `bcrypt` queda sin su binario nativo y el cliente de Prisma sin generar. Para completar la instalación:
> ```bash
> (cd node_modules/bcrypt && ../.bin/node-pre-gyp install --fallback-to-build)
> npx prisma generate
> node -e "console.log(require('bcrypt').hashSync('x', 4).slice(0, 4))"   # debe imprimir $2b$
> ```
> npm también sugiere `npm install-scripts approve <paquete>`.

> ⚠️ **Seed:** `prisma/seed.ts` crea el SuperAdmin (con `SUPERADMIN_DNI` / `SUPERADMIN_PASSWORD`), una barbería de demostración con un usuario barbero de **credenciales fijas definidas en el propio archivo** y turnos de prueba. No lo corras contra una base de producción.

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev                 # Vite, http://localhost:5173
```

La URL del backend sale de `VITE_API_URL`. Si no está definida, el frontend usa `http://localhost:3000` (`src/services/api.ts`). Para producción hay un ejemplo en `frontend/.env.production.example`.

---

## Docker (backend)

El `Dockerfile` usa `node:24-alpine`. Al arrancar corre `prisma migrate deploy` y después `node dist/main`. Trae un `HEALTHCHECK` contra `GET /health`, y el build falla si el binario nativo de bcrypt no quedó instalado.

> **`docker run --env-file` no quita las comillas.** Con `JWT_SECRET="abc"`, la variable dentro del contenedor vale `"abc"` con comillas incluidas, y lo mismo pasa con `DATABASE_URL`, etc. Docker necesita un archivo de variables **sin comillas**. Podés generarlo a partir de tu `.env`:
>
> ```bash
> cd backend
> sed -E 's/^([A-Za-z0-9_]+)="(.*)"$/\1=\2/' .env > .env.docker
> ```
>
> `backend/.gitignore` ignora `.env.docker` (regla `.env.*`).

```bash
cd backend
docker build -t turnazo-backend:local .
docker run --rm -d --name turnazo-api -p 3000:3000 \
  --env-file .env.docker -e NODE_ENV=production turnazo-backend:local
docker inspect --format '{{.State.Health.Status}}' turnazo-api   # healthy después del start-period (60 s)
curl -si http://localhost:3000/health
docker stop turnazo-api
```

`DATABASE_URL` tiene que apuntar a una base accesible desde el contenedor; `localhost` es el propio contenedor.

---

## API

- **Documentación interactiva:** [`http://localhost:3000/docs`](http://localhost:3000/docs) (Swagger UI) y `/docs-json` (OpenAPI 3.0). Se controla con `DOCS_ENABLED` y está apagada por defecto en producción. Tiene una CSP propia, relajada solo para esas rutas.
- **Health check:** `GET /health` → `200 {"status":"ok"}`. No consulta la base de datos ni ejecuta lógica de negocio. Lo usa el `HEALTHCHECK` de Docker.

### Endpoints principales

Autenticación: `Authorization: Bearer <JWT>`, obtenido en `POST /auth/login`.

| Método | Ruta | Acceso |
| :--- | :--- | :--- |
| `POST` | `/auth/login` | Público |
| `POST` | `/auth/register` | Público |
| `GET` | `/auth/me`, `/barbers/me` | JWT |
| `GET` | `/appointments/public/:slug` | Público (agenda de una barbería) |
| `POST` | `/appointments/:slotId/lock` | Público (bloqueo de 10 min) |
| `POST` | `/appointments/:slotId/release-lock` | Público (requiere el token del bloqueo) |
| `GET` | `/appointments/:slotId/summary`, `/appointments/:slotId/ics` | Público |
| `POST` | `/appointments/:slotId/cancel` | JWT |
| `GET` | `/appointments/client/my-slots` | JWT |
| `GET` / `POST` | `/appointments/barber/slots` | JWT, rol `BARBER` |
| `POST` | `/payments/create-preference` | Público |
| `POST` | `/payments/confirm-return` | Público |
| `POST` | `/payments/webhook` | Firma de Mercado Pago (`MercadoPagoWebhookGuard`) |
| `POST` | `/payments/simulate-webhook` | Público; responde 404 con `NODE_ENV=production` |
| `GET` | `/notifications/vapid-public-key` | Público |
| `POST` | `/notifications/subscribe` | Público; requiere el token firmado del turno |
| `GET` / `POST` | `/admin/barbers` | JWT, rol `SUPERADMIN` |
| `PATCH` | `/admin/barbers/:id/toggle-reminder` | JWT, rol `SUPERADMIN` |
| `GET` | `/admin/settlements` | JWT, rol `SUPERADMIN` |
| `PATCH` | `/admin/settlements/:barberId/transfer` | JWT, rol `SUPERADMIN` |
| `GET` | `/health` | Público |

Las rutas de `admin` también responden sin el prefijo (`/barbers`, `/settlements`, …), porque el controlador se declara como `@Controller(['admin', ''])`.

---

## Tests

```bash
cd backend
npm test            # unitarios
npm run test:e2e    # E2E: levanta un PostgreSQL embebido (PGlite) en memoria; no usa tu base
```

Último resultado verificado (Node 24.20, instalación limpia con `npm ci` y bcrypt nativo):

| Suite | Resultado |
| :--- | :--- |
| Unitarios | **126 tests en 13 suites — todos pasan** |
| E2E (seguridad y concurrencia) | **50 tests en 1 suite — todos pasan**. Matriz interna: 63 PASS, 1 WARN, 0 FAIL |

El único WARN es esperado: el replay idéntico de un webhook dentro de la ventana de 300 s se acepta por diseño y queda mitigado por idempotencia.
