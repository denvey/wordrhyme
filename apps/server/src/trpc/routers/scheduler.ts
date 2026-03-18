import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { SchedulerService } from '../../scheduler/scheduler.service.js';
import { SchedulerProviderRegistry } from '../../scheduler/providers/provider.registry.js';

// Global service instances (set by TrpcModule)
let schedulerService: SchedulerService;
let providerRegistry: SchedulerProviderRegistry;

/**
 * Setter functions called by TrpcModule to inject NestJS services
 */
export function setSchedulerService(service: SchedulerService) {
  schedulerService = service;
}

export function setSchedulerProviderRegistry(registry: SchedulerProviderRegistry) {
  providerRegistry = registry;
}

/**
 * Scheduler tRPC Router
 */
export const schedulerRouter = router({
  /**
   * 创建定时任务
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        cronExpression: z.string(),
        timezone: z.string().default('UTC'),
        handlerType: z.enum(['queue-job', 'webhook', 'plugin-callback']),
        handlerConfig: z.object({
          queueName: z.string().optional(),
          jobName: z.string().optional(),
          url: z.string().optional(),
          pluginId: z.string().optional(),
          methodName: z.string().optional(),
        }),
        payload: z.record(z.unknown()).optional(),
        maxRetries: z.number().min(0).max(10).default(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context required',
        });
      }

      return await schedulerService.createTask({
        organizationId: ctx.organizationId,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        cronExpression: input.cronExpression,
        timezone: input.timezone,
        handlerType: input.handlerType,
        handlerConfig: {
          ...(input.handlerConfig.queueName !== undefined ? { queueName: input.handlerConfig.queueName } : {}),
          ...(input.handlerConfig.jobName !== undefined ? { jobName: input.handlerConfig.jobName } : {}),
          ...(input.handlerConfig.url !== undefined ? { url: input.handlerConfig.url } : {}),
          ...(input.handlerConfig.pluginId !== undefined ? { pluginId: input.handlerConfig.pluginId } : {}),
          ...(input.handlerConfig.methodName !== undefined ? { methodName: input.handlerConfig.methodName } : {}),
        },
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        maxRetries: input.maxRetries,
        createdBy: ctx.userId || 'system',
        createdByType: 'user',
      });
    }),

  /**
   * 列出任务
   */
  list: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context required',
        });
      }

      return await schedulerService.listTasks(ctx.organizationId, {
        limit: input.limit,
        offset: input.offset,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      });
    }),

  /**
   * 获取单个任务
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await schedulerService.getTask(input.id);
    }),

  /**
   * 启用/禁用任务
   */
  toggle: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await schedulerService.toggleTask(input.id, input.enabled);
    }),

  /**
   * 删除任务
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await schedulerService.deleteTask(input.id);
      return { success: true };
    }),

  /**
   * 立即执行任务
   */
  runNow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await schedulerService.triggerImmediately(input.id);
    }),

  /**
   * 获取执行历史
   */
  history: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return await schedulerService.getExecutionHistory(input.taskId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * 列出可用的 Provider
   */
  listProviders: protectedProcedure.query(async ({ ctx }) => {
    return providerRegistry.listProviders().map(provider => ({
      id: provider.id,
      name: provider.name,
      version: provider.version,
      capabilities: provider.capabilities,
    }));
  }),

  /**
   * 获取当前 Provider
   */
  getActiveProvider: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Tenant context required',
      });
    }

    const provider = await providerRegistry.getActiveProvider(ctx.organizationId);
    const health = await provider.healthCheck();

    return {
      id: provider.id,
      name: provider.name,
      version: provider.version,
      capabilities: provider.capabilities,
      healthy: health.healthy,
      latency: health.latency,
    };
  }),

  /**
   * 切换 Provider
   */
  switchProvider: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context required',
        });
      }

      await providerRegistry.setActiveProvider(ctx.organizationId, input.providerId);

      return { success: true };
    }),
});
