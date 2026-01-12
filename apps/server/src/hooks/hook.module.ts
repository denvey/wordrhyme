/**
 * Hook Module
 *
 * NestJS module for the Hook system.
 * Provides HookRegistry and HookExecutor as global singletons.
 * Automatically registers all core hooks on startup.
 */

import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import { HookExecutor } from './hook-executor';
import { ALL_HOOKS, getHookStats } from './definitions';

@Global()
@Module({
  providers: [HookRegistry, HookExecutor],
  exports: [HookRegistry, HookExecutor],
})
export class HookModule implements OnModuleInit {
  private readonly logger = new Logger(HookModule.name);

  constructor(private readonly registry: HookRegistry) {}

  onModuleInit() {
    // Register all core hooks
    for (const hook of ALL_HOOKS) {
      this.registry.defineHook(hook);
    }

    const stats = getHookStats();
    this.logger.log(
      `🪝 Registered ${stats.total} core hooks ` +
      `(Content: ${stats.content}, User: ${stats.user}, ` +
      `E-commerce: ${stats.ecommerce}, Media: ${stats.media}, System: ${stats.system})`
    );
  }
}
