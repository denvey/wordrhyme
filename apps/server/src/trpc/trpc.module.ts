import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { getAppRouter } from './router';
import { createContext } from './context';

/**
 * tRPC Module
 *
 * Registers tRPC router with Fastify.
 */
@Module({})
export class TrpcModule implements OnModuleInit {
    constructor(private readonly httpAdapterHost: HttpAdapterHost) { }

    async onModuleInit() {
        const fastify = this.httpAdapterHost.httpAdapter.getInstance() as FastifyInstance;

        await fastify.register(fastifyTRPCPlugin, {
            prefix: '/trpc',
            trpcOptions: {
                router: getAppRouter(),
                createContext,
                onError: ({ error, path }) => {
                    console.error(`[tRPC] Error in ${path}:`, error);
                },
            },
        });

        console.log('[tRPC] Router registered at /trpc');
    }
}
