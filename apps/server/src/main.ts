import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { env } from './config/env';
import { GlobalExceptionFilter } from './core/global-exception.filter';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { auth } from './auth';

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({ logger: env.NODE_ENV === 'development' }),
    );

    // Global exception filter for standardized JSON errors
    app.useGlobalFilters(new GlobalExceptionFilter());

    const fastify = app.getHttpAdapter().getInstance();

    // Register Fastify plugins
    await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
    await fastify.register(fastifyStatic, {
        root: path.join(process.cwd(), env.PLUGIN_DIR),
        prefix: '/plugins/',
        decorateReply: false,
    });

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
                const req = new Request(url.toString(), {
                    method: request.method,
                    headers,
                    body: request.body ? JSON.stringify(request.body) : undefined,
                });

                // Process authentication request
                const response = await auth.handler(req);

                // Forward response to client
                reply.status(response.status);
                response.headers.forEach((value, key) => reply.header(key, value));
                reply.send(response.body ? await response.text() : null);
            } catch (error) {
                fastify.log.error('Authentication Error:', error);
                reply.status(500).send({
                    error: 'Internal authentication error',
                    code: 'AUTH_FAILURE',
                });
            }
        },
    });

    // Enable CORS
    app.enableCors({
        origin: env.NODE_ENV === 'development' ? true : (env.CORS_ORIGINS?.split(',') ?? true),
        credentials: true,
    });

    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`🔐 Auth API available at http://localhost:${env.PORT}/api/auth`);
}

bootstrap().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
