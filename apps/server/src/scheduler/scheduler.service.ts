import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduledTasks, taskExecutions } from '../db/schema/scheduled-tasks.js';
import { SchedulerProviderRegistry } from './providers/provider.registry.js';
import {
  CreateTaskParams,
  UpdateTaskParams,
  PaginationOptions,
} from './providers/provider.interface.js';

export interface CreateScheduledTaskParams {
  tenantId: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  handlerType: 'queue-job' | 'webhook' | 'plugin-callback';
  handlerConfig: {
    queueName?: string;
    jobName?: string;
    url?: string;
    pluginId?: string;
    methodName?: string;
  };
  payload?: Record<string, unknown>;
  maxRetries?: number;
  createdBy: string;
  createdByType: 'user' | 'plugin' | 'system';
}

/**
 * Scheduler Service
 *
 * 对外提供定时任务管理的主要服务
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly providerRegistry: SchedulerProviderRegistry,
  ) {}

  /**
   * 创建定时任务
   */
  async createTask(params: CreateScheduledTaskParams) {
    // 获取租户的 Provider
    const provider = await this.providerRegistry.getActiveProvider(params.tenantId);

    // 生成任务 ID
    const taskId = crypto.randomUUID();

    // 调用 Provider 创建任务
    const result = await provider.createTask({
      id: taskId,
      tenantId: params.tenantId,
      name: params.name,
      cronExpression: params.cronExpression,
      timezone: params.timezone || 'UTC',
      handlerConfig: {
        type: params.handlerType,
        ...params.handlerConfig,
      },
      payload: params.payload,
      retryPolicy: {
        maxRetries: params.maxRetries || 3,
        backoffMultiplier: 2,
      },
    });

    // 保存到数据库
    const [task] = await db
      .insert(scheduledTasks)
      .values({
        id: taskId,
        tenantId: params.tenantId,
        name: params.name,
        description: params.description,
        cronExpression: params.cronExpression,
        timezone: params.timezone || 'UTC',
        handlerType: params.handlerType,
        handlerConfig: params.handlerConfig,
        payload: params.payload,
        nextRunAt: result.nextRunAt,
        enabled: true,
        providerId: provider.id,
        providerMetadata: result.metadata,
        maxRetries: params.maxRetries || 3,
        createdBy: params.createdBy,
        createdByType: params.createdByType,
      })
      .returning();

    this.logger.log(`Task created: ${task.id} (${task.name})`);

    return task;
  }

  /**
   * 列出任务
   */
  async listTasks(
    tenantId: string,
    options: {
      enabled?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const conditions = [eq(scheduledTasks.tenantId, tenantId)];

    if (options.enabled !== undefined) {
      conditions.push(eq(scheduledTasks.enabled, options.enabled));
    }

    const tasks = await db.query.scheduledTasks.findMany({
      where: and(...conditions),
      limit: options.limit || 20,
      offset: options.offset || 0,
      orderBy: [desc(scheduledTasks.createdAt)],
    });

    return tasks;
  }

  /**
   * 获取单个任务
   */
  async getTask(taskId: string) {
    const task = await db.query.scheduledTasks.findFirst({
      where: eq(scheduledTasks.id, taskId),
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return task;
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, updates: UpdateTaskParams) {
    const task = await this.getTask(taskId);
    const provider = this.providerRegistry.getProvider(task.providerId);

    // 调用 Provider 更新
    await provider.updateTask(taskId, updates);

    // 更新数据库
    const [updatedTask] = await db
      .update(scheduledTasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, taskId))
      .returning();

    this.logger.log(`Task updated: ${taskId}`);

    return updatedTask;
  }

  /**
   * 启用/禁用任务
   */
  async toggleTask(taskId: string, enabled: boolean) {
    return await this.updateTask(taskId, { enabled });
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string) {
    const task = await this.getTask(taskId);
    const provider = this.providerRegistry.getProvider(task.providerId);

    // 调用 Provider 删除
    await provider.deleteTask(taskId);

    // 从数据库删除
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId));

    this.logger.log(`Task deleted: ${taskId}`);
  }

  /**
   * 立即触发任务
   */
  async triggerImmediately(taskId: string) {
    const task = await this.getTask(taskId);
    const provider = this.providerRegistry.getProvider(task.providerId);

    const result = await provider.triggerNow(taskId);

    this.logger.log(`Task triggered immediately: ${taskId}`);

    return result;
  }

  /**
   * 获取执行历史
   */
  async getExecutionHistory(taskId: string, options: PaginationOptions = {}) {
    const provider = this.providerRegistry.getProvider('builtin');
    return await provider.getExecutionHistory(taskId, options);
  }

  /**
   * 更新执行记录
   */
  async updateExecution(
    executionId: string,
    updates: {
      status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
      result?: Record<string, unknown>;
      error?: { code: string; message: string; stack?: string };
      completedAt?: Date;
    }
  ) {
    await db
      .update(taskExecutions)
      .set(updates)
      .where(eq(taskExecutions.id, executionId));
  }
}
