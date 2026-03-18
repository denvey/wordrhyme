import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronExpressionParser } from 'cron-parser';
import { eq, and, lte, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { scheduledTasks, taskExecutions, type ScheduledTask } from '@wordrhyme/db';
import { QueueService } from '../../queue/queue.service.js';
import {
  SchedulerProvider,
  ProviderCapabilities,
  ProviderConfig,
  CreateTaskParams,
  CreateTaskResult,
  UpdateTaskParams,
  TriggerResult,
  TaskExecution,
  PaginationOptions,
  ProviderHealthStatus,
} from './provider.interface';

/**
 * Built-in Scheduler Provider
 *
 * 内置的调度器实现，提供完整的定时任务功能。
 */
@Injectable()
export class BuiltinSchedulerProvider implements SchedulerProvider {
  private readonly logger = new Logger(BuiltinSchedulerProvider.name);

  readonly id = 'builtin';
  readonly name = 'Built-in Scheduler';
  readonly version = '1.0.0';

  readonly capabilities: ProviderCapabilities = {
    supportsSeconds: true,
    supportsTimezone: true,
    supportsPauseResume: true,
    minInterval: 1000, // 1 秒
    maxTasks: 0, // 无限制
    requiresWebhook: false,
  };

  constructor(
    private readonly queueService: QueueService,
  ) {}

  async initialize(config: ProviderConfig): Promise<void> {
    this.logger.log('Built-in Scheduler Provider initialized');
  }

  async createTask(params: CreateTaskParams): Promise<CreateTaskResult> {
    // 验证 Cron 表达式并计算下次执行时间
    const nextRunAt = this.calculateNextRun(
      params.cronExpression,
      params.timezone
    );

    return {
      taskId: params.id,
      nextRunAt,
    };
  }

  async deleteTask(taskId: string): Promise<void> {
    // 任务删除由 Scheduler Service 处理
    this.logger.log(`Task ${taskId} deleted`);
  }

  async updateTask(taskId: string, updates: UpdateTaskParams): Promise<void> {
    // 任务更新由 Scheduler Service 处理
    this.logger.log(`Task ${taskId} updated`);
  }

  async triggerNow(taskId: string): Promise<TriggerResult> {
    const [task] = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .limit(1);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const executionId = await this.triggerTask(task);

    if (!executionId) {
      throw new Error(`Failed to trigger task: ${taskId}`);
    }

    return {
      executionId,
      triggeredAt: new Date(),
    };
  }

  async getExecutionHistory(
    taskId: string,
    options: PaginationOptions
  ): Promise<TaskExecution[]> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const executions = await db
      .select()
      .from(taskExecutions)
      .where(eq(taskExecutions.taskId, taskId))
      .orderBy(desc(taskExecutions.startedAt))
      .limit(limit)
      .offset(offset);

    return executions as TaskExecution[];
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    try {
      const start = Date.now();
      await db.select().from(scheduledTasks).limit(1);
      return {
        healthy: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
      };
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Built-in Scheduler Provider shutting down');
  }

  /**
   * Cron 扫描器 - 每分钟执行一次
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanAndTrigger() {
    const now = new Date();

    try {
      // 查找需要执行的任务
      const tasks = await db
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.enabled, true),
            eq(scheduledTasks.providerId, this.id),
            lte(scheduledTasks.nextRunAt, now),
          )
        )
        .limit(100);

      this.logger.debug(`Found ${tasks.length} tasks to trigger`);

      for (const task of tasks) {
        await this.triggerTask(task);
      }
    } catch (error) {
      this.logger.error('Error in scanAndTrigger', error);
    }
  }

  /**
   * 触发单个任务
   */
  private async triggerTask(task: ScheduledTask): Promise<string | null> {
    const lockKey = `scheduler:lock:${task.id}`;
    const workerId = process.env['PM2_INSTANCE_ID'] || 'standalone';

    try {
      // 创建执行记录（使用数据库作为分布式锁）
      const [execution] = await db
        .insert(taskExecutions)
        .values({
          taskId: task.id,
          organizationId: task.organizationId,
          scheduledAt: task.nextRunAt,
          startedAt: new Date(),
          status: 'pending',
          attempt: 1,
          lockKey,
          workerId,
        })
        .returning();
      if (!execution) {
        throw new Error(`Failed to create execution record for task: ${task.id}`);
      }

      // 根据 handler 类型分发
      if (task.handlerType === 'queue-job') {
        await this.queueService.enqueue(
          `${task.handlerConfig.queueName}_${task.handlerConfig.jobName}`,
          {
            organizationId: task.organizationId,
            ...((task.payload as Record<string, unknown> | null) ?? {}),
            _schedulerContext: {
              taskId: task.id,
              executionId: execution.id,
              organizationId: task.organizationId,
            },
          }
        );
      }

      // 计算下次执行时间
      const nextRun = this.calculateNextRun(task.cronExpression, task.timezone);

      // 更新任务
      await db
        .update(scheduledTasks)
        .set({
          lastRunAt: new Date(),
          nextRunAt: nextRun,
          lastStatus: 'success',
          consecutiveFailures: 0,
        })
        .where(eq(scheduledTasks.id, task.id));

      this.logger.debug(`Task ${task.id} triggered successfully`);

      return execution.id;
    } catch (error) {
      this.logger.error(`Failed to trigger task ${task.id}`, error);
      await this.handleTaskFailure(task, error as Error);
      return null;
    }
  }

  /**
   * 处理任务失败
   */
  private async handleTaskFailure(task: ScheduledTask, error: Error) {
    const newFailureCount = (task.consecutiveFailures || 0) + 1;

    // 超过阈值自动禁用
    if (newFailureCount >= 5) {
      await db
        .update(scheduledTasks)
        .set({
          enabled: false,
          consecutiveFailures: newFailureCount,
          lastStatus: 'failed',
        })
        .where(eq(scheduledTasks.id, task.id));

      this.logger.warn(
        `Task ${task.id} disabled after ${newFailureCount} consecutive failures`
      );
    } else {
      await db
        .update(scheduledTasks)
        .set({
          consecutiveFailures: newFailureCount,
          lastStatus: 'failed',
        })
        .where(eq(scheduledTasks.id, task.id));
    }
  }

  /**
   * 计算下次执行时间
   */
  private calculateNextRun(cron: string, timezone: string): Date {
    const interval = CronExpressionParser.parse(cron, {
      tz: timezone,
      currentDate: new Date(),
    });
    return interval.next().toDate();
  }
}
