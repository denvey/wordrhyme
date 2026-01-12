import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { getAppRouter } from './router';
import { createContext } from './context';
import { SettingsModule, SettingsService, FeatureFlagService } from '../settings';
import { CacheModule } from '../cache/cache.module';
import { CacheManager } from '../cache/cache-manager';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerProviderRegistry } from '../scheduler/providers/provider.registry';
import { setSettingsService } from './routers/settings';
import { setFeatureFlagService } from './routers/feature-flags';
import { setCacheManager } from './routers/cache';
import { setSchedulerService, setSchedulerProviderRegistry } from './routers/scheduler';

/**
 * tRPC Module
 *
 * Registers tRPC router with Fastify.
 */
@Module({
    imports: [SettingsModule, CacheModule, SchedulerModule],
})
export class TrpcModule implements OnModuleInit {
    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private readonly settingsService: SettingsService,
        private readonly featureFlagService: FeatureFlagService,
        private readonly cacheManager: CacheManager,
        private readonly schedulerService: SchedulerService,
        private readonly schedulerProviderRegistry: SchedulerProviderRegistry,
    ) { }

    async onModuleInit() {
        // Inject NestJS services into tRPC routers
        setSettingsService(this.settingsService);
        setFeatureFlagService(this.featureFlagService);
        setCacheManager(this.cacheManager);
        setSchedulerService(this.schedulerService);
        setSchedulerProviderRegistry(this.schedulerProviderRegistry);

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
