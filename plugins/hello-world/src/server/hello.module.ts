import { Module } from '@nestjs/common';
import { HelloService } from './hello.service';

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
 * 
 * @example
 * // In manifest.json:
 * {
 *   "server": {
 *     "nestModule": "./dist/server/hello.module.js"
 *   }
 * }
 */
@Module({
    providers: [HelloService],
    exports: [HelloService],
})
export class HelloModule { }

// Default export for dynamic import
export default HelloModule;
