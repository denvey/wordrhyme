import { Module } from '@nestjs/common';
import { KernelModule } from './kernel';
import { DatabaseModule } from './db/database.module';
import { ContextModule } from './context/context.module';
import { PermissionModule } from './permission';
import { PluginModule } from './plugins/plugin.module';
import { TrpcModule } from './trpc/trpc.module';
import { CoreRoutesModule } from './core/core-routes.module';

/**
 * Root NestJS Module
 *
 * Module initialization order (per CORE_BOOTSTRAP_FLOW.md):
 * 1. KernelModule - Core state machine and config
 * 2. DatabaseModule - Drizzle connection pool
 * 3. ContextModule - AsyncLocalStorage middleware
 * 4. PermissionModule - Permission kernel and service
 * 5. PluginModule - Plugin lifecycle management
 * 6. CoreRoutesModule - Health check and status APIs
 * 7. TrpcModule - tRPC route registration (last)
 * 
 * Note: Better-Auth is mounted directly in main.ts via Fastify handler
 */
@Module({
    imports: [
        KernelModule,
        DatabaseModule,
        ContextModule,
        PermissionModule,
        PluginModule,
        CoreRoutesModule,
        TrpcModule,
    ],
})
export class AppModule { }
