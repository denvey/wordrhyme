/**
 * Scheduler Provider Interface Tests
 *
 * Tests for provider capabilities and interface definitions.
 */
import { describe, it, expect } from 'vitest';
import type {
  SchedulerProvider,
  ProviderCapabilities,
  CreateTaskParams,
  HandlerConfig,
  RetryPolicy,
  TaskExecution,
} from '../../scheduler/providers/provider.interface.js';

describe('SchedulerProvider Interface', () => {
  describe('ProviderCapabilities', () => {
    it('should define all required capability fields', () => {
      const capabilities: ProviderCapabilities = {
        supportsSeconds: true,
        supportsTimezone: true,
        supportsPauseResume: true,
        minInterval: 1000,
        maxTasks: 0,
        requiresWebhook: false,
      };

      expect(capabilities.supportsSeconds).toBe(true);
      expect(capabilities.supportsTimezone).toBe(true);
      expect(capabilities.supportsPauseResume).toBe(true);
      expect(capabilities.minInterval).toBe(1000);
      expect(capabilities.maxTasks).toBe(0);
      expect(capabilities.requiresWebhook).toBe(false);
    });

    it('should support limited capabilities provider', () => {
      const limitedCapabilities: ProviderCapabilities = {
        supportsSeconds: false,
        supportsTimezone: false,
        supportsPauseResume: false,
        minInterval: 60000, // 1 minute minimum
        maxTasks: 100,
        requiresWebhook: true,
      };

      expect(limitedCapabilities.supportsSeconds).toBe(false);
      expect(limitedCapabilities.minInterval).toBe(60000);
      expect(limitedCapabilities.maxTasks).toBe(100);
      expect(limitedCapabilities.requiresWebhook).toBe(true);
    });
  });

  describe('CreateTaskParams', () => {
    it('should create valid queue-job handler config', () => {
      const handlerConfig: HandlerConfig = {
        type: 'queue-job',
        queueName: 'notifications',
        jobName: 'send-digest',
      };

      expect(handlerConfig.type).toBe('queue-job');
      expect(handlerConfig.queueName).toBe('notifications');
      expect(handlerConfig.jobName).toBe('send-digest');
    });

    it('should create valid webhook handler config', () => {
      const handlerConfig: HandlerConfig = {
        type: 'webhook',
        url: 'https://example.com/webhook',
      };

      expect(handlerConfig.type).toBe('webhook');
      expect(handlerConfig.url).toBe('https://example.com/webhook');
    });

    it('should create valid plugin-callback handler config', () => {
      const handlerConfig: HandlerConfig = {
        type: 'plugin-callback',
        pluginId: 'my-plugin',
        methodName: 'onScheduledTask',
      };

      expect(handlerConfig.type).toBe('plugin-callback');
      expect(handlerConfig.pluginId).toBe('my-plugin');
      expect(handlerConfig.methodName).toBe('onScheduledTask');
    });

    it('should create complete task params', () => {
      const retryPolicy: RetryPolicy = {
        maxRetries: 3,
        backoffMultiplier: 2,
      };

      const params: CreateTaskParams = {
        id: 'task-123',
        organizationId: 'org-456',
        name: 'Daily Report',
        cronExpression: '0 9 * * *',
        timezone: 'Asia/Shanghai',
        handlerConfig: {
          type: 'queue-job',
          queueName: 'reports',
          jobName: 'generate-daily',
        },
        payload: { reportType: 'sales' },
        retryPolicy,
      };

      expect(params.id).toBe('task-123');
      expect(params.cronExpression).toBe('0 9 * * *');
      expect(params.timezone).toBe('Asia/Shanghai');
      expect(params.retryPolicy.maxRetries).toBe(3);
    });
  });

  describe('RetryPolicy', () => {
    it('should define retry parameters', () => {
      const policy: RetryPolicy = {
        maxRetries: 5,
        backoffMultiplier: 1.5,
      };

      expect(policy.maxRetries).toBe(5);
      expect(policy.backoffMultiplier).toBe(1.5);
    });

    it('should support no-retry policy', () => {
      const noRetryPolicy: RetryPolicy = {
        maxRetries: 0,
        backoffMultiplier: 1,
      };

      expect(noRetryPolicy.maxRetries).toBe(0);
    });
  });

  describe('TaskExecution', () => {
    it('should represent pending execution', () => {
      const execution: TaskExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        scheduledAt: new Date('2024-01-01T09:00:00Z'),
        startedAt: new Date('2024-01-01T09:00:01Z'),
        status: 'pending',
        attempt: 1,
      };

      expect(execution.status).toBe('pending');
      expect(execution.completedAt).toBeUndefined();
    });

    it('should represent running execution', () => {
      const execution: TaskExecution = {
        id: 'exec-2',
        taskId: 'task-1',
        scheduledAt: new Date('2024-01-01T09:00:00Z'),
        startedAt: new Date('2024-01-01T09:00:01Z'),
        status: 'running',
        attempt: 1,
      };

      expect(execution.status).toBe('running');
    });

    it('should represent successful execution', () => {
      const execution: TaskExecution = {
        id: 'exec-3',
        taskId: 'task-1',
        scheduledAt: new Date('2024-01-01T09:00:00Z'),
        startedAt: new Date('2024-01-01T09:00:01Z'),
        completedAt: new Date('2024-01-01T09:00:05Z'),
        status: 'success',
        attempt: 1,
        result: { processed: 100 },
      };

      expect(execution.status).toBe('success');
      expect(execution.completedAt).toBeDefined();
      expect(execution.result).toEqual({ processed: 100 });
    });

    it('should represent failed execution with error', () => {
      const execution: TaskExecution = {
        id: 'exec-4',
        taskId: 'task-1',
        scheduledAt: new Date('2024-01-01T09:00:00Z'),
        startedAt: new Date('2024-01-01T09:00:01Z'),
        completedAt: new Date('2024-01-01T09:00:02Z'),
        status: 'failed',
        attempt: 3,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Connection refused',
          stack: 'Error: Connection refused\n    at ...',
        },
      };

      expect(execution.status).toBe('failed');
      expect(execution.attempt).toBe(3);
      expect(execution.error?.code).toBe('NETWORK_ERROR');
      expect(execution.error?.message).toBe('Connection refused');
    });

    it('should represent timeout execution', () => {
      const execution: TaskExecution = {
        id: 'exec-5',
        taskId: 'task-1',
        scheduledAt: new Date('2024-01-01T09:00:00Z'),
        startedAt: new Date('2024-01-01T09:00:01Z'),
        completedAt: new Date('2024-01-01T09:05:01Z'),
        status: 'timeout',
        attempt: 1,
        error: {
          code: 'TIMEOUT',
          message: 'Task execution exceeded 5 minute limit',
        },
      };

      expect(execution.status).toBe('timeout');
    });
  });
});
