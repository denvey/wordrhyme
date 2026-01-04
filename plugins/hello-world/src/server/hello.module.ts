import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { HelloService, PLUGIN_DATABASE } from './hello.service';
import { createPluginDataCapability } from '@wordrhyme/server/plugins/capabilities/data';

const PLUGIN_ID = 'com.wordrhyme.hello-world';

/**
 * Hello World NestJS Module
 * 
 * Demonstrates the "Advanced Plugin" mode where plugins can provide
 * a NestJS module for:
 * - Dependency Injection (DI)
 * - Service encapsulation
 * - Modular architecture
 * 
 * This module is loaded dynamically by the PluginManager using
 * NestJS LazyModuleLoader when the plugin starts.
 */
@Module({})
export class HelloModule {
    /**
     * Create module with database capability
     * 
     * @param tenantId - Tenant ID for scoped database access
     */
    static forTenant(tenantId: string = 'default'): DynamicModule {
        return {
            module: HelloModule,
            providers: [
                {
                    provide: PLUGIN_DATABASE,
                    useFactory: () => createPluginDataCapability(PLUGIN_ID, tenantId),
                },
                HelloService,
            ],
            exports: [HelloService],
        };
    }
}

// Default export for dynamic import
export default HelloModule;
