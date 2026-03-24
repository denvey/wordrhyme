/**
 * Hello World Plugin - Server Entry
 *
 * Example plugin demonstrating:
 * - tRPC router with database access
 * - Lifecycle hooks (onEnable, onDisable)
 * - Permission checks
 * - Scoped database queries with auto tenant filtering
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { type PluginContext, checkPermission, requirePermission } from '@wordrhyme/plugin';
import { z } from 'zod';

const GREETING_GROUP_KEY = 'greeting';
const GREETING_ADVANCED_GROUP_KEY = 'greeting.advanced';

// Database operation types (imported at runtime from server)
// Note: In production plugin, this would be from @wordrhyme/server package
// For MVP, we use the direct import path during development

/**
 * Plugin tRPC Router
 *
 * Demonstrates:
 * 1. Simple queries (no database)
 * 2. Permission-protected endpoints
 * 3. Database operations (to be enabled with proper package export)
 */
export const router = pluginRouter({
    /**
     * Say hello - simple endpoint without database
     * Demonstrates: Basic tRPC procedure with context
     */
    sayHello: pluginProcedure
        .input(z.object({ name: z.string().optional() }))
        .query(({ input, ctx }) => {
            ctx.logger.info('sayHello called', { name: input.name });
            return {
                message: `Hello, ${input.name ?? 'World'}!`,
                timestamp: new Date().toISOString(),
                tenant: ctx.organizationId ?? 'unknown',
            };
        }),

    /**
     * Get plugin info - protected endpoint
     * Demonstrates: Permission checking
     */
    getInfo: pluginProcedure.query(async ({ ctx }) => {
        const hasPermission = await checkPermission(ctx, 'hello-world.plugin:read:*');

        return {
            pluginId: ctx.pluginId,
            tenant: ctx.organizationId ?? 'unknown',
            permissionGranted: hasPermission,
            features: {
                tRPCRouter: true,
                lifecycleHooks: true,
                adminUI: true,
                settingsTab: true,
                databaseAccess: true,
            },
        };
    }),

    /**
     * Admin action - requires admin permission
     * Demonstrates: Requiring permission (throws if denied)
     */
    adminAction: pluginProcedure
        .input(z.object({ action: z.string() }))
        .mutation(async ({ input, ctx }) => {
            await requirePermission(ctx, 'hello-world.plugin:admin:*');

            ctx.logger.info('Admin action executed', { action: input.action });

            return {
                success: true,
                action: input.action,
                executedAt: new Date().toISOString(),
            };
        }),

    // =================================================================
    // DATABASE OPERATIONS - Using ctx.db capability
    // =================================================================

    /**
     * Create greeting - database INSERT
     * Demonstrates: Database insertion with tenant isolation via ctx.db
     * Billing note: this key is used as a UI grouping hint in the plan matrix.
     */
    createGreeting: pluginProcedure
        .meta({ billing: { subject: GREETING_GROUP_KEY } })
        .input(z.object({
            name: z.string(),
            message: z.string(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            ctx.logger.info('Creating greeting', { name: input.name, message: input.message });

            // Use ctx.db capability for database operations
            if (!ctx.db) {
                ctx.logger.warn('Database capability not available, returning mock data');
                return {
                    success: true,
                    id: crypto.randomUUID(),
                    name: input.name,
                    message: input.message,
                    createdAt: new Date().toISOString(),
                };
            }

            const id = crypto.randomUUID();
            const createdAt = new Date().toISOString();

            try {
                await ctx.db.insert({
                    table: 'greetings',
                    data: {
                        id,
                        name: input.name,
                        message: input.message,
                        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                        created_at: createdAt,
                    },
                });

                ctx.logger.info('Greeting created successfully', { id });

                return {
                    success: true,
                    id,
                    name: input.name,
                    message: input.message,
                    createdAt,
                };
            } catch (error) {
                ctx.logger.error('Failed to create greeting', { error: String(error) });
                throw error;
            }
        }),

    /**
     * List greetings - database SELECT
     * Demonstrates: Query with automatic tenant filtering via ctx.db
     * Billing note: grouped with other greeting procedures in Admin UI.
     */
    listGreetings: pluginProcedure
        .meta({ billing: { subject: GREETING_GROUP_KEY } })
        .input(z.object({
            limit: z.number().default(10),
        }))
        .query(async ({ input, ctx }) => {
            ctx.logger.info('Listing greetings', { limit: input.limit, tenant: ctx.organizationId });

            // Use ctx.db capability for database operations
            if (!ctx.db) {
                ctx.logger.warn('Database capability not available, returning mock data');
                return [
                    {
                        id: '1',
                        name: 'Alice',
                        message: 'Hello from Alice!',
                        tenantId: ctx.organizationId ?? 'demo',
                        createdAt: new Date().toISOString(),
                    },
                    {
                        id: '2',
                        name: 'Bob',
                        message: 'Greetings from Bob!',
                        tenantId: ctx.organizationId ?? 'demo',
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                    },
                ];
            }

            try {
                type GreetingRow = {
                    id: string;
                    name: string;
                    message: string;
                    tenant_id: string;
                    created_at: string;
                };
                const results = await ctx.db.query({
                    table: 'greetings',
                    limit: input.limit,
                }) as GreetingRow[];

                return results.map((row: GreetingRow) => ({
                    id: row.id,
                    name: row.name,
                    message: row.message,
                    tenantId: row.tenant_id,
                    createdAt: row.created_at,
                }));
            } catch (error) {
                ctx.logger.error('Failed to list greetings', { error: String(error) });
                // Return empty array on error
                return [];
            }
        }),

    /**
     * Delete greeting - database DELETE
     * Demonstrates: Delete with automatic tenant isolation via ctx.db
     * Billing note: shares the same grouping key for quick-select UX.
     */
    deleteGreeting: pluginProcedure
        .meta({ billing: { subject: GREETING_GROUP_KEY } })
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            ctx.logger.info('Deleting greeting', { id: input.id, tenant: ctx.organizationId });

            // Use ctx.db capability for database operations
            if (!ctx.db) {
                ctx.logger.warn('Database capability not available');
                return {
                    success: true,
                    id: input.id,
                    deletedAt: new Date().toISOString(),
                };
            }

            try {
                await ctx.db.delete({
                    table: 'greetings',
                    where: { id: input.id },
                });

                ctx.logger.info('Greeting deleted successfully', { id: input.id });

                return {
                    success: true,
                    id: input.id,
                    deletedAt: new Date().toISOString(),
                };
            } catch (error) {
                ctx.logger.error('Failed to delete greeting', { error: String(error) });
                throw error;
            }
        }),

    // =================================================================
    // ADVANCED MODE ENDPOINTS - Using NestJS HelloService
    // =================================================================

    /**
     * Create greeting via NestJS Service (Advanced Mode)
     * Demonstrates: NestJS DI with @Injectable service
     * Billing note: advanced procedures use a separate UI grouping key.
     */
    createGreetingAdvanced: pluginProcedure
        .meta({ billing: { subject: GREETING_ADVANCED_GROUP_KEY } })
        .input(z.object({
            name: z.string(),
            message: z.string(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            ctx.logger.info('[Advanced] Creating greeting via HelloService', { name: input.name });

            try {
                // Dynamic import HelloService
                const { HelloService } = await import('./hello.service');
                const service = new HelloService();  // Note: No DI in this demo

                const result = await service.createGreeting(
                    input.name,
                    input.message,
                    input.metadata
                );

                ctx.logger.info('[Advanced] Greeting created via HelloService', { id: result.id });

                return {
                    success: true,
                    mode: 'advanced',
                    id: result.id,
                    name: result.name,
                    message: result.message,
                    createdAt: result.createdAt.toISOString(),
                };
            } catch (error) {
                ctx.logger.error('[Advanced] Failed to create greeting', { error: String(error) });
                throw error;
            }
        }),

    /**
     * List greetings via NestJS Service (Advanced Mode)
     */
    listGreetingsAdvanced: pluginProcedure
        .meta({ billing: { subject: GREETING_ADVANCED_GROUP_KEY } })
        .input(z.object({ limit: z.number().default(10) }))
        .query(async ({ input, ctx }) => {
            ctx.logger.info('[Advanced] Listing greetings via HelloService', { limit: input.limit });

            try {
                const { HelloService } = await import('./hello.service');
                const service = new HelloService();

                const results = await service.listGreetings(input.limit);

                return results.map(g => ({
                    id: g.id,
                    name: g.name,
                    message: g.message,
                    tenantId: ctx.organizationId ?? 'unknown',
                    createdAt: g.createdAt.toISOString(),
                    mode: 'advanced' as const,
                }));
            } catch (error) {
                ctx.logger.error('[Advanced] Failed to list greetings', { error: String(error) });
                throw error;
            }
        }),

    /**
     * Delete greeting via NestJS Service (Advanced Mode)
     */
    deleteGreetingAdvanced: pluginProcedure
        .meta({ billing: { subject: GREETING_ADVANCED_GROUP_KEY } })
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            ctx.logger.info('[Advanced] Deleting greeting via HelloService', { id: input.id });

            try {
                const { HelloService } = await import('./hello.service');
                const service = new HelloService();

                await service.deleteGreeting(input.id);

                return {
                    success: true,
                    mode: 'advanced',
                    id: input.id,
                    deletedAt: new Date().toISOString(),
                };
            } catch (error) {
                ctx.logger.error('[Advanced] Failed to delete greeting', { error: String(error) });
                throw error;
            }
        }),
});

/**
 * Router type export for client type inference
 */
export type HelloWorldRouter = typeof router;

/**
 * Lifecycle: onEnable
 */
export async function onEnable(ctx: PluginContext) {
    ctx.logger.info('Hello World plugin enabled!');
    ctx.logger.info('Plugin features:', {
        tRPC: 'Available at /trpc/plugin.hello-world.*',
        adminUI: 'Available at /p/com.wordrhyme.hello-world',
        database: 'plugin_hello_world_greetings table ready',
    });
}

/**
 * Lifecycle: onDisable
 */
export async function onDisable(ctx: PluginContext) {
    ctx.logger.info('Hello World plugin disabled!');
}
