import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { BuiltinSchedulerProvider } from './providers/builtin.provider';
import { SchedulerProviderRegistry } from './providers/provider.registry';
import { PluginSchedulerAdapter } from './plugin-adapter.service';
import { DatabaseModule } from '../db/database.module';
import { QueueModule } from '../queue/queue.module';

/**
 * Scheduler Module
 *
 * 提供定时任务调度功能
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // 启用 @nestjs/schedule
    DatabaseModule,
    QueueModule,
  ],
  providers: [
    SchedulerService,
    BuiltinSchedulerProvider,
    SchedulerProviderRegistry,
    PluginSchedulerAdapter,
  ],
  exports: [
    SchedulerService,
    SchedulerProviderRegistry,
    PluginSchedulerAdapter,
  ],
})
export class SchedulerModule {}
