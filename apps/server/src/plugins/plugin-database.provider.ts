/**
 * Plugin Database Provider
 * 
 * Provides database capability for NestJS plugin services.
 * This allows advanced mode plugins to use the same ctx.db API
 * with automatic table prefixing and tenant isolation.
 * 
 * Usage in plugin service:
 * @Injectable()
 * export class MyService {
 *     constructor(
 *         @Inject(PLUGIN_DB) private readonly db: PluginDatabaseCapability
 *     ) {}
 * }
 */
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { createPluginDataCapability } from './capabilities/data.capability';
import type { PluginDatabaseCapability } from '@wordrhyme/plugin';

// Request type for NestJS injection
interface PluginRequest {
    url: string;
    tenantId?: string;
}

/**
 * Token for plugin database injection
 */
export const PLUGIN_DB = Symbol('PLUGIN_DB');

/**
 * Extract plugin ID from request path
 * e.g., /trpc/pluginApis.hello-world.sayHello -> com.wordrhyme.hello-world
 */
function extractPluginIdFromPath(url: string): string | undefined {
    const match = url.match(/\/trpc\/pluginApis\.([^.]+)\./);
    if (match && match[1]) {
        return `com.wordrhyme.${match[1]}`;
    }
    return undefined;
}

/**
 * Plugin Database Factory
 * 
 * Creates a request-scoped database capability for plugin services.
 * Automatically extracts pluginId and tenantId from request.
 */
@Injectable({ scope: Scope.REQUEST })
export class PluginDatabaseFactory {
    private readonly capability: PluginDatabaseCapability | null;

    constructor(@Inject(REQUEST) private readonly request: PluginRequest) {
        const pluginId = extractPluginIdFromPath(request.url);
        // Get tenantId from auth context
        const tenantId = request.tenantId ?? 'default';

        if (pluginId) {
            this.capability = createPluginDataCapability(pluginId, tenantId);
        } else {
            this.capability = null;
        }
    }

    getCapability(): PluginDatabaseCapability | null {
        return this.capability;
    }
}

/**
 * Provider configuration for plugin database
 */
export const PluginDatabaseProvider = {
    provide: PLUGIN_DB,
    useFactory: (factory: PluginDatabaseFactory) => factory.getCapability(),
    inject: [PluginDatabaseFactory],
    scope: Scope.REQUEST,
};
