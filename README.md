# 💈 Turnazo — Turnero SaaS PWA para Barberías

**Turnazo** es una plataforma SaaS multi-tenant en formato **Progressive Web App (PWA)** diseñada para la gestión de agendas, reservas con seña integrada y recordatorios automáticos para barberías.

---

## 🚀 Modelo de Negocio y Características Clave

- **SaaS Gratuito para Barberos:** Gestión integral de bloques horarios de **30 minutos**, métricas semanales y panel de control sin costo fijo obligatorio.
- **Seña Integrada con Mercado Pago ($2.000 ARS):** Para confirmar un turno, el cliente abona una seña fija mediante Mercado Pago. El cobro ingresa de forma centralizada a la cuenta de la plataforma.
- **Módulo Reminder IA (Add-on 3 USD):** Sistema de recordatorios automáticos (24 h y 2 h antes del turno) vía **Web Push (PWA)** y **Email (SMTP)**, activable manualmente por el SuperAdmin (`reminder_addon_active`) o bonificado por metas semanales.
- **Gamificación y Liquidaciones Semanales (`WeeklySettlement`):** Sistema de premios y bonificaciones para barberos según el volumen de turnos confirmados en la semana.
- **Autenticación Unificada por DNI + Contraseña:** Sin fricción de correos electrónicos obligatorios. Todos los roles (`SUPERADMIN`, `BARBER`, `CLIENT`) inician sesión con su DNI.
- **Motor Anti-Colisión de Turnos:** Bloqueo temporal atómico de 10 minutos con tokens firmados (`SHA-256`), liberación automática por cron y registro de pagos huérfanos (`OrphanPayment`) para auditoría o reembolso sin pisar la agenda.

---

## 🛠️ Stack Tecnológico

### Backend (`/backend`)
| Categoría | Tecnología |
| :--- | :--- |
| **Framework & Runtime** | Node.js + **NestJS 10** (TypeScript 5.4) |
| **Base de Datos & ORM** | **PostgreSQL** (Supabase / PgBouncer) + **Prisma ORM 6** |
| **Autenticación** | **Passport JWT** (`@nestjs/jwt`, `passport-jwt`) + **bcrypt** (DNI + Password) |
| **Pagos** | **Mercado Pago SDK v3** (`mercadopago`) + Validación HMAC de Webhooks |
| **Cron Jobs & Tareas** | `@nestjs/schedule` (limpieza de bloqueos, recordatorios y retención PII) |
| **Notificaciones** | **Web Push** (`web-push` con VAPID), **Nodemailer** (SMTP), Calendario `.ics` y links a WhatsApp |
| **Seguridad** | Rate Limiting, cabeceras HTTP de seguridad, sanitización de PII en logs, validación estricta con `class-validator` y payload máximo de 64 KB |
| **Testing** | **Jest 29** + **PGlite** (`@electric-sql/pglite`) para tests E2E de concurrencia y seguridad 100% en memoria |

### Frontend (`/frontend`)
| Categoría | Tecnología |
| :--- | :--- |
| **Librería UI** | **React 18.3** + **TypeScript 5.6** |
| **Bundler** | **Vite 5.4** |
| **Estilos & Iconos** | **Tailwind CSS v4** (`@tailwindcss/vite`) + **Lucide React** |
| **PWA** | `manifest.json` instalable + **Service Worker (`sw.js`)** con soporte nativo para Web Push |

---

## 📂 Estructura del Proyecto

```text
Turnazo/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Modelo de datos (User, BarberProfile, AppointmentSlot, etc.)
│   │   ├── migrations/            # Migraciones SQL versionadas
│   │   └── seed.ts                # Datos iniciales (SuperAdmin, Barbería demo y turnos)
│   ├── src/
│   │   ├── admin/                 # Alta de barberos, toggle Reminder IA y liquidaciones semanales
│   │   ├── appointments/          # Motor de agendas (30 min), locks SHA-256, .ics y cron de limpieza
│   │   ├── auth/                  # Login/Registro por DNI + Password, Guards JWT y Roles
│   │   ├── mail/                  # Envío de correos transaccionales (confirmaciones y alertas)
│   │   ├── notifications/         # Web Push (VAPID), scheduler de recordatorios 24h/2h y links firmados
│   │   ├── payments/              # Preferencias de Mercado Pago, Webhook Guard y pagos huérfanos
│   │   ├── prisma/                # Servicio global de conexión a PostgreSQL
│   │   └── security/              # RateLimitGuard, SecurityHeadersMiddleware, PII Sanitizer y retención
│   └── test/                      # Suite E2E con PostgreSQL embebido (PGlite)
└── frontend/
    ├── public/
    │   ├── manifest.json          # Configuración PWA
    │   └── sw.js                  # Service Worker para notificaciones Push
    └── src/
        ├── components/            # Vistas (PublicBooking, BarberDashboard, SuperAdmin, BookingStatus, etc.)
        ├── context/               # Estado global de autenticación (AuthContext)
        ├── services/              # Cliente HTTP API y gestión de suscripciones Web Push
        ├── types/                 # Contratos TypeScript compartidos con el backend
        └── utils/                 # Formateo de turnos, generación local de .ics y gamificación
```

---

## 🗄️ Modelo de Datos Principal (Prisma)

- **`User`**: Usuarios identificados por `dni` único, contraseña hasheada y rol (`SUPERADMIN`, `BARBER`, `CLIENT`).
- **`BarberProfile`**: Perfil de cada barbería (`slug` público único, `shop_name`, `address`, `reminder_addon_active`, `reminder_config`).
- **`AppointmentSlot`**: Turnos estrictos de 30 minutos (`AVAILABLE`, `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`), control de bloqueo (`locked_until`, `lock_token_hash`), referencia de pago (`mp_payment_id`) y marcas de tiempo anti-duplicados de notificaciones.
- **`WeeklySettlement`**: Liquidaciones semanales por barbero, cálculo de tier de bono (`bonus_tier`, `bonus_amount_ars`) y estado de transferencia.
- **`OrphanPayment`**: Pagos aprobados por Mercado Pago que llegaron fuera de ventana o en colisión, registrados con estado `REQUIRES_REFUND` para no alterar turnos ajenos.
- **`PushSubscription`**: Suscripciones Web Push de dispositivos vinculadas a cada turno confirmado.

---

## ⚙️ Configuración e Instalación Local

### 1. Prerrequisitos
- **Node.js** >= 20.x
- **npm** >= 10.x
- Instancia de **PostgreSQL** (local o Supabase)

### 2. Variables de Entorno

#### Backend (`backend/.env`)
Copiá el archivo de ejemplo y completá los valores:
```bash
cp backend/.env.example backend/.env
```

Variables principales:
```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/turnazo?schema=public"

# Obligatorio (>= 32 caracteres). Generar con:
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET="tu_jwt_secret_seguro_de_al_menos_32_caracteres"
JWT_EXPIRES_IN="7d"

# Mercado Pago
MP_ACCESS_TOKEN="APP_USR-..."
MP_WEBHOOK_SECRET="tu_webhook_secret"
MP_WEBHOOK_TOLERANCE_SECONDS=300

# SuperAdmin inicial (para el seed)
SUPERADMIN_DNI="00000000"
SUPERADMIN_PASSWORD="adminPassword123!"

# Servidor y CORS
PORT=3000
FRONTEND_URL="http://localhost:5173"

# Email (SMTP)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="no-reply@turnero-barber.com"

# Web Push (PWA) - Generar con: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:soporte@turnazo.app"
```

#### Frontend (`frontend/.env`)
Opcionalmente podés configurar la URL del backend (por defecto apunta a `http://localhost:3000`):
```env
VITE_API_URL="http://localhost:3000"
```

---

### 3. Instalación y Puesta en Marcha

#### Levantar el Backend
```bash
cd backend
npm install

# Generar el cliente de Prisma y aplicar migraciones
npm run prisma:generate
npm run prisma:migrate

# (Opcional) Poblar la base de datos con SuperAdmin, barbería demo y turnos
npm run prisma:seed

# Iniciar en modo desarrollo (http://localhost:3000)
npm run start:dev
```

#### Levantar el Frontend
```bash
cd frontend
npm install

# Iniciar servidor de desarrollo Vite (http://localhost:5173)
npm run dev
```

---

## 🧪 Credenciales de Prueba (Seed)

Al ejecutar `npm run prisma:seed` en `/backend`, se crean los siguientes accesos de prueba:

| Rol | DNI | Contraseña | Detalle |
| :--- | :--- | :--- | :--- |
| **SUPERADMIN** | `00000000` | `adminPassword123!` | Panel global de barberías y liquidaciones |
| **BARBER** | `34888999` | `barber1234` | Barbería: **OBSIDIAN & RAW BRASS STUDIO** (`slug`: `obsidian-studio`) |

---

## ✅ Testing

El backend cuenta con tests unitarios y una suite E2E de concurrencia y seguridad que levanta automáticamente una instancia efímera de PostgreSQL en memoria mediante **PGlite** (no requiere ni modifica tu base de datos local):

```bash
cd backend

# Ejecutar tests unitarios
npm test

# Ejecutar tests E2E de seguridad y concurrencia (PGlite en memoria)
npm run test:e2e
```
