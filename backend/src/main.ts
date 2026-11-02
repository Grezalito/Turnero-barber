import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const expressInstance = app.getHttpAdapter().getInstance();
  if (expressInstance && typeof expressInstance.disable === 'function') {
    expressInstance.disable('x-powered-by');
    expressInstance.set('trust proxy', 1);
  }

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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Backend corriendo en http://localhost:${port}`);
}
bootstrap();
