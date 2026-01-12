/**
 * Hook Module
 *
 * NestJS module for the Hook system.
 * Provides HookRegistry and HookExecutor as global singletons.
 */

import { Module, Global } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import { HookExecutor } from './hook-executor';

@Global()
@Module({
  providers: [HookRegistry, HookExecutor],
  exports: [HookRegistry, HookExecutor],
})
export class HookModule {}
