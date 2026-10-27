# ==============================================================================
# STAGE 1: Builder (Dependencias + Prisma Client + NestJS Build)
# ==============================================================================
FROM node:20-alpine AS builder

# OpenSSL requerido por el motor de Prisma en Alpine Linux
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar manifiestos y esquema de Prisma para aprovechar caché de capas Docker y postinstall
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias (dispara automáticamente "postinstall": "prisma generate")
RUN npm ci

# Copiar el código fuente y configuración de compilación
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compilar aplicación NestJS a /app/dist/main.js
RUN npm run build

# Podar dependencias de desarrollo dejando únicamente las de producción + Prisma Client generado
RUN npm prune --omit=dev

# ==============================================================================
# STAGE 2: Production Runner (Imagen liviana y segura para Railway / Render / VPS)
# ==============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar artefactos compilados, node_modules de producción y esquema Prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Ejecutar con usuario sin privilegios root por seguridad en producción
USER node

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
