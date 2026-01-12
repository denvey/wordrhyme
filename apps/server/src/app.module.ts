import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KernelModule } from './kernel';
import { DatabaseModule } from './db/database.module';
import { CacheModule } from './cache/cache.module';
import { ContextModule } from './context/context.module';
import { PermissionModule } from './permission';
import { PluginModule } from './plugins/plugin.module';
import { TrpcModule } from './trpc/trpc.module';
import { CoreRoutesModule } from './core/core-routes.module';
import { AuthModule } from './auth';
import { QueueModule } from './queue';
import { NotificationModule } from './notifications';
import { AuditModule } from './audit';
import { SettingsModule } from './settings';
import { ObservabilityModule } from './observability';
import { WebhookModule } from './webhooks/webhook.module.js';
import { SchedulerModule } from './scheduler/scheduler.module';

/**
 * Root NestJS Module
 *
 * Module initialization order (per CORE_BOOTSTRAP_FLOW.md):
 * 1. KernelModule - Core state machine and config
 * 2. ObservabilityModule - Structured logging, tracing, metrics (early for logging)
 * 3. DatabaseModule - Drizzle connection pool
 * 4. CacheModule - Universal cache system (L1/L2, global)
 * 5. ContextModule - AsyncLocalStorage middleware
 * 6. PermissionModule - Permission kernel and service
 * 7. AuthModule - Authentication (AuthGuard, RolesGuard, decorators, Admin Guard Chain)
 * 8. QueueModule - BullMQ queue system (in-process worker by default)
 * 9. AuditModule - Generic audit logging system
 * 10. SettingsModule - Settings and feature flags
 * 11. NotificationModule - Notification system
 * 12. WebhookModule - Webhook system
 * 13. PluginModule - Plugin lifecycle management
 * 14. CoreRoutesModule - Health check and status APIs
 * 15. TrpcModule - tRPC route registration (last)
 *
 * Note: Better-Auth is mounted directly in main.ts via Fastify handler
 */
@Module({
    imports: [
        ScheduleModule.forRoot(),
        KernelModule,
        ObservabilityModule.forRoot(),
        DatabaseModule,
        CacheModule,
        ContextModule,
        PermissionModule,
        AuthModule,
        QueueModule,
        AuditModule,
        SettingsModule,
        NotificationModule,
        WebhookModule,
        SchedulerModule,
        PluginModule,
        CoreRoutesModule,
        TrpcModule,
    ],
})
export class AppModule { }
