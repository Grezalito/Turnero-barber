"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const express_1 = require("express");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const expressInstance = app.getHttpAdapter().getInstance();
    if (expressInstance && typeof expressInstance.disable === 'function') {
        expressInstance.disable('x-powered-by');
        expressInstance.set('trust proxy', 1);
    }
    app.use((0, express_1.json)({ limit: '64kb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '64kb' }));
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const configuredOrigins = (process.env.FRONTEND_URL ||
        process.env.PUBLIC_APP_URL ||
        '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }
            const normalizedOrigin = origin.replace(/\/+$/, '');
            if (configuredOrigins.includes(normalizedOrigin)) {
                callback(null, true);
                return;
            }
            if (!isProd &&
                (normalizedOrigin.startsWith('http://localhost:') ||
                    normalizedOrigin.startsWith('http://127.0.0.1:'))) {
                callback(null, true);
                return;
            }
            if (!isProd && configuredOrigins.length === 0) {
                callback(null, true);
                return;
            }
            logger.warn(`[SECURITY_AUDIT] event=CORS_ORIGIN_BLOCKED origin=${normalizedOrigin}`);
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
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.enableShutdownHooks();
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`🚀 Backend corriendo en http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map