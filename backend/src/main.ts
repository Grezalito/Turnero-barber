import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response, json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { resolveJwtSecret } from './auth/jwt-secret.util';
import { resolveSuperAdminCredentials } from './auth/superadmin-credentials.util';
import { DOCS_PATH, isDocsEnabled, isDocsPath } from './docs/docs.config';
import { SecurityHeadersMiddleware } from './security/security-headers.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fail-fast: sin JWT_SECRET robusto, sin credenciales de SuperAdmin o con DOCS_ENABLED
  // inválido la API no arranca (no existen valores por defecto).
  let docsEnabled = false;
  try {
    resolveJwtSecret(process.env.JWT_SECRET);
    resolveSuperAdminCredentials(process.env);
    docsEnabled = isDocsEnabled(process.env);
  } catch (err) {
    logger.error(`[SECURITY_AUDIT] event=STARTUP_ABORTED reason=${(err as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.disable('x-powered-by');
  // Un único proxy reverso de confianza (Render / Nginx): req.ip toma la IP que agrega ese proxy
  // y descarta los valores de X-Forwarded-For enviados por el cliente.
  app.set('trust proxy', 1);

  // Límite estricto de tamaño de payload (64 KB) contra ataques de agotamiento de memoria (SOC 2 A1.1 / ISO 27001 A.8.6)
  app.use(json({ limit: '64kb' }));
  app.use(urlencoded({ extended: true, limit: '64kb' }));

  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const configuredOrigins = (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    ''
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir llamadas server-to-server (ej. Webhooks de Mercado Pago o healthchecks sin header Origin)
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (configuredOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (
        !isProd &&
        (normalizedOrigin.startsWith('http://localhost:') ||
          normalizedOrigin.startsWith('http://127.0.0.1:'))
      ) {
        callback(null, true);
        return;
      }

      if (!isProd && configuredOrigins.length === 0) {
        callback(null, true);
        return;
      }

      logger.warn(
        `[SECURITY_AUDIT] event=CORS_ORIGIN_BLOCKED origin=${normalizedOrigin}`,
      );
      callback(new Error('Origen no autorizado por política CORS'), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Signature',
    ],
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    credentials: true,
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  // Documentación OpenAPI en /docs (DOCS_ENABLED; apagada por defecto en producción).
  if (docsEnabled) {
    // SwaggerModule registra sus rutas directo en Express, antes que el middleware de Nest
    // (que se monta en app.init), así que las cabeceras de seguridad (incluida la CSP
    // relajada solo para /docs*) se aplican explícitamente a esas rutas antes del setup.
    const docsSecurityHeaders = new SecurityHeadersMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      isDocsPath(req.originalUrl || req.url)
        ? docsSecurityHeaders.use(req, res, next)
        : next(),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Turnazo API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      DOCS_PATH,
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
    logger.log(`📚 Documentación OpenAPI habilitada en /${DOCS_PATH}`);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Backend corriendo en http://localhost:${port}`);
}
bootstrap();
