import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { env } from './config/env';
import { GlobalExceptionFilter } from './core/global-exception.filter';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { auth } from './auth';
import { TraceService, MetricsServiceImpl, LoggerService } from './observability/index.js';
import { requestContextStorage, type RequestContext, runAsSystem } from './context/async-local-storage';
import { randomUUID } from 'node:crypto';
import { PaymentService } from './billing/services/payment.service';

async function bootstrap() {
    // Wrap entire bootstrap in system context so all startup code
    // (onModuleInit, better-auth callbacks, seeds) inherits ALS context.
    // Per-request context is overridden by Fastify onRequest hook below.
    await runAsSystem('app-bootstrap', async () => {

    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            logger: env.NODE_ENV === 'development',
            requestIdHeader: 'x-request-id',
            genReqId: () => randomUUID(),
            // tRPC HTTP batching encodes procedure names in one path segment.
            // Fastify default (100) can reject long batches as 404.
            maxParamLength: 5000,
        }),
    );

    // Global exception filter for standardized JSON errors
    app.useGlobalFilters(new GlobalExceptionFilter());

    const fastify = app.getHttpAdapter().getInstance();

    // Initialize observability services
    const traceService = new TraceService();
    const metricsService = new MetricsServiceImpl();
    const logger = new LoggerService();

    logger.info('Initializing observability middleware');

    // Trace context middleware - wraps all requests with AsyncLocalStorage context
    fastify.addHook('onRequest', async (request, _reply) => {
        // Extract or create trace context from W3C traceparent header
        const traceContext = traceService.extractOrCreate(request.headers as Record<string, string | undefined>);

        // Build request context for AsyncLocalStorage
        const requestContext: RequestContext = {
            requestId: request.id, // Use Fastify's generated request ID
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            parentSpanId: traceContext.parentSpanId,
            locale: 'en-US',
            currency: 'USD',
            timezone: 'UTC',
            ip: request.ip,
            userAgent: request.headers['user-agent'],
        };

        // Store context for async access throughout request lifecycle
        requestContextStorage.enterWith(requestContext);

        // Add traceparent and request ID to response headers
        _reply.header('traceparent', traceService.formatTraceparent(traceContext));
        _reply.header('x-request-id', request.id);
    });

    // Request timing middleware for metrics
    fastify.addHook('onRequest', async (request) => {
        (request as any).startTime = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
        const startTime = (request as any).startTime;
        if (startTime) {
            const duration = (Date.now() - startTime) / 1000;
            const route = request.routeOptions?.url || request.url;

            metricsService.observeHistogram('http_request_duration_seconds', duration, {
                method: request.method,
                route,
                status: String(reply.statusCode),
            });

            metricsService.incrementCounter('http_requests_total', {
                method: request.method,
                route,
                status: String(reply.statusCode),
            });
        }
    });

    // Register Fastify plugins
    await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
    await fastify.register(fastifyStatic, {
        root: path.join(process.cwd(), env.PLUGIN_DIR),
        prefix: '/plugins/',
        decorateReply: false,
    });

    // Allow binary uploads (image/*, video/*, audio/*, etc.)
    // Without this, Fastify returns 415 for non-JSON/text content types.
    fastify.addContentTypeParser(
        /^(image|video|audio)\/.+|^application\/(octet-stream|pdf)$/,
        { parseAs: 'buffer', bodyLimit: 50 * 1024 * 1024 },
        (_req: any, body: Buffer, done: (err: null, body: Buffer) => void) => {
            done(null, body);
        },
    );

    // Better Auth handler - official Fastify integration pattern
    fastify.route({
        method: ['GET', 'POST'],
        url: '/api/auth/*',
        async handler(request, reply) {
            try {
                // Construct request URL
                const url = new URL(request.url, `http://${request.headers.host}`);

                // Convert Fastify headers to standard Headers object
                const headers = new Headers();
                Object.entries(request.headers).forEach(([key, value]) => {
                    if (value) headers.append(key, Array.isArray(value) ? value.join(',') : value);
                });

                // Create Fetch API-compatible request
                const bodyContent = request.body ? JSON.stringify(request.body) : null;
                const req = new Request(url.toString(), {
                    method: request.method,
                    headers,
                    ...(bodyContent ? { body: bodyContent } : {}),
                });

                // Process authentication request
                const response = await auth.handler(req);

                // Forward response to client
                reply.status(response.status);
                response.headers.forEach((value: string, key: string) => reply.header(key, value));
                reply.send(response.body ? await response.text() : null);
            } catch (error) {
                fastify.log.error(error instanceof Error ? error : new Error(String(error)), 'Authentication Error');
                reply.status(500).send({
                    error: 'Internal authentication error',
                    code: 'AUTH_FAILURE',
                });
            }
        },
    });

    // Billing webhook route — encapsulated to override JSON parser with raw buffer
    // Stripe requires raw body (Buffer) for signature verification
    await fastify.register(async (instance) => {
      instance.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req: any, body: Buffer, done: (err: null, body: Buffer) => void) => {
          done(null, body);
        },
      );

      instance.post('/api/billing/webhook/:gateway', async (request, reply) => {
        const rawBody = request.body as Buffer;
        const gateway = (request.params as { gateway: string }).gateway;
        const sig = (request.headers['stripe-signature'] ?? request.headers['x-webhook-signature']) as string | undefined;

        try {
          const paymentService = app.get(PaymentService);
          const input: Parameters<typeof paymentService.handleWebhook>[0] = { gateway, payload: rawBody };
          if (sig) input.signature = sig;
          await paymentService.handleWebhook(input);
          reply.status(200).send({ received: true });
        } catch (error) {
          fastify.log.error(error instanceof Error ? error : new Error(String(error)), 'Webhook processing error');
          reply.status(400).send({ error: 'Webhook processing failed' });
        }
      });
    });

    // Enable CORS
    app.enableCors({
        origin: env.NODE_ENV === 'development' ? true : (env.CORS_ORIGINS?.split(',') ?? true),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    // Dev mode: auto-sync system menus to database on every startup
    if (env.NODE_ENV === 'development') {
        const { MenuService } = await import('./services/menu.service');
        const menuService = new MenuService();
        await menuService.ensureCoreMenus();
        console.log('🔄 Dev mode: system menus synced to database');
    }

    logger.info(`Server running on http://localhost:${env.PORT}`, {
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
    });
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`🔐 Auth API available at http://localhost:${env.PORT}/api/auth`);

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}, starting graceful shutdown`);

        try {
            // Stop accepting new connections
            await app.close();
            logger.info('Server closed, flushing final metrics');

            // Flush any pending metrics (give it a moment to complete)
            await new Promise(resolve => setTimeout(resolve, 500));

            logger.info('Graceful shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown', {}, error instanceof Error ? error.stack : String(error));
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    }); // end runAsSystem('app-bootstrap')
}

bootstrap().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
