/**
 * SchedulerService Unit Tests
 *
 * Tests for the scheduler service including:
 * - Task CRUD operations
 * - Task execution lifecycle
 * - Provider integration
 * - Execution history
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerService } from '../../scheduler/scheduler.service.js';

// Mock task data
const mockTask = {
  id: 'task-123',
  organizationId: 'org-456',
  name: 'Daily Report',
  description: 'Generate daily report',
  cronExpression: '0 9 * * *',
  timezone: 'UTC',
  handlerType: 'queue-job' as const,
  handlerConfig: { queueName: 'reports', jobName: 'generate-daily' },
  payload: { format: 'pdf' },
  enabled: true,
  providerId: 'builtin',
  providerMetadata: {},
  nextRunAt: new Date('2025-02-01T09:00:00Z'),
  lastRunAt: null,
  maxRetries: 3,
  createdBy: 'user-789',
  createdByType: 'user' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock execution data
const mockExecution = {
  id: 'exec-123',
  taskId: 'task-123',
  status: 'success' as const,
  startedAt: new Date(),
  completedAt: new Date(),
  result: { rowCount: 100 },
  error: null,
};

// Mock provider
const mockProvider = {
  id: 'builtin',
  name: 'Builtin Provider',
  createTask: vi.fn().mockResolvedValue({
    id: 'task-123',
    nextRunAt: new Date('2025-02-01T09:00:00Z'),
    metadata: {},
  }),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  triggerNow: vi.fn().mockResolvedValue({ executionId: 'exec-new' }),
  getExecutionHistory: vi.fn().mockResolvedValue({
    executions: [mockExecution],
    total: 1,
  }),
};

// Mock provider registry
const mockProviderRegistry = {
  getActiveProvider: vi.fn().mockResolvedValue(mockProvider),
  getProvider: vi.fn().mockReturnValue(mockProvider),
};

// Mock database - define individual mock functions to avoid hoisting issues
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('SchedulerService', () => {
  let schedulerService: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      }),
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockTask]),
        }),
      }),
    });

    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([mockTask]),
            }),
          }),
          limit: vi.fn().mockResolvedValue([mockTask]),
        }),
      }),
    });

    schedulerService = new SchedulerService(mockProviderRegistry as any);
  });

  describe('createTask()', () => {
    it('should create a scheduled task', async () => {
      const result = await schedulerService.createTask({
        organizationId: 'org-456',
        name: 'Daily Report',
        cronExpression: '0 9 * * *',
        handlerType: 'queue-job',
        handlerConfig: { queueName: 'reports', jobName: 'generate-daily' },
        createdBy: 'user-789',
        createdByType: 'user',
      });

      expect(result.name).toBe('Daily Report');
      expect(mockProviderRegistry.getActiveProvider).toHaveBeenCalledWith('org-456');
      expect(mockProvider.createTask).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should use default timezone UTC when not specified', async () => {
      await schedulerService.createTask({
        organizationId: 'org-456',
        name: 'Test Task',
        cronExpression: '0 0 * * *',
        handlerType: 'webhook',
        handlerConfig: { url: 'https://example.com/hook' },
        createdBy: 'user-789',
        createdByType: 'user',
      });

      const insertValues = mockInsert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.timezone).toBe('UTC');
    });

    it('should use default maxRetries of 3 when not specified', async () => {
      await schedulerService.createTask({
        organizationId: 'org-456',
        name: 'Test Task',
        cronExpression: '0 0 * * *',
        handlerType: 'queue-job',
        handlerConfig: { queueName: 'test' },
        createdBy: 'system',
        createdByType: 'system',
      });

      const insertValues = mockInsert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.maxRetries).toBe(3);
    });

    it('should support different handler types', async () => {
      // Webhook handler
      await schedulerService.createTask({
        organizationId: 'org-456',
        name: 'Webhook Task',
        cronExpression: '*/5 * * * *',
        handlerType: 'webhook',
        handlerConfig: { url: 'https://api.example.com/webhook' },
        createdBy: 'user-1',
        createdByType: 'user',
      });

      expect(mockProvider.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          handlerConfig: expect.objectContaining({
            type: 'webhook',
            url: 'https://api.example.com/webhook',
          }),
        })
      );
    });
  });

  describe('listTasks()', () => {
    it('should list tasks for organization', async () => {
      const result = await schedulerService.listTasks('org-456');

      expect(result).toHaveLength(1);
      expect(result[0].organizationId).toBe('org-456');
    });

    it('should filter by enabled status', async () => {
      await schedulerService.listTasks('org-456', { enabled: true });

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should support pagination', async () => {
      await schedulerService.listTasks('org-456', { limit: 10, offset: 5 });

      const selectChain = mockSelect.mock.results[0]!.value;
      const fromChain = selectChain.from.mock.results[0]!.value;
      const whereChain = fromChain.where.mock.results[0]!.value;
      const orderByChain = whereChain.orderBy.mock.results[0]!.value;
      expect(orderByChain.limit).toHaveBeenCalledWith(10);
      expect(orderByChain.limit.mock.results[0]!.value.offset).toHaveBeenCalledWith(5);
    });

    it('should use default limit of 20', async () => {
      await schedulerService.listTasks('org-456');

      const selectChain = mockSelect.mock.results[0]!.value;
      const fromChain = selectChain.from.mock.results[0]!.value;
      const whereChain = fromChain.where.mock.results[0]!.value;
      const orderByChain = whereChain.orderBy.mock.results[0]!.value;
      expect(orderByChain.limit).toHaveBeenCalledWith(20);
      expect(orderByChain.limit.mock.results[0]!.value.offset).toHaveBeenCalledWith(0);
    });
  });

  describe('getTask()', () => {
    it('should return task by ID', async () => {
      const result = await schedulerService.getTask('task-123');

      expect(result.id).toBe('task-123');
      expect(result.name).toBe('Daily Report');
    });

    it('should throw error for non-existent task', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(schedulerService.getTask('non-existent')).rejects.toThrow(
        'Task not found: non-existent'
      );
    });
  });

  describe('updateTask()', () => {
    it('should update task properties', async () => {
      const result = await schedulerService.updateTask('task-123', {
        name: 'Updated Report',
        cronExpression: '0 10 * * *',
      });

      expect(mockProvider.updateTask).toHaveBeenCalledWith('task-123', {
        name: 'Updated Report',
        cronExpression: '0 10 * * *',
      });
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('toggleTask()', () => {
    it('should enable a disabled task', async () => {
      await schedulerService.toggleTask('task-123', true);

      expect(mockProvider.updateTask).toHaveBeenCalledWith('task-123', { enabled: true });
    });

    it('should disable an enabled task', async () => {
      await schedulerService.toggleTask('task-123', false);

      expect(mockProvider.updateTask).toHaveBeenCalledWith('task-123', { enabled: false });
    });
  });

  describe('deleteTask()', () => {
    it('should delete task from provider and database', async () => {
      await schedulerService.deleteTask('task-123');

      expect(mockProvider.deleteTask).toHaveBeenCalledWith('task-123');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error for non-existent task', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(schedulerService.deleteTask('non-existent')).rejects.toThrow(
        'Task not found: non-existent'
      );
    });
  });

  describe('triggerImmediately()', () => {
    it('should trigger task execution immediately', async () => {
      const result = await schedulerService.triggerImmediately('task-123');

      expect(mockProvider.triggerNow).toHaveBeenCalledWith('task-123');
      expect(result.executionId).toBe('exec-new');
    });
  });

  describe('getExecutionHistory()', () => {
    it('should return execution history for task', async () => {
      const result = await schedulerService.getExecutionHistory('task-123');

      expect(result.executions).toHaveLength(1);
      expect(result.executions[0].status).toBe('success');
    });

    it('should support pagination options', async () => {
      await schedulerService.getExecutionHistory('task-123', { limit: 10, offset: 0 });

      expect(mockProvider.getExecutionHistory).toHaveBeenCalledWith('task-123', {
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('updateExecution()', () => {
    it('should update execution status to success', async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await schedulerService.updateExecution('exec-123', {
        status: 'success',
        result: { rowCount: 100 },
        completedAt: new Date(),
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should update execution status to failed with error', async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await schedulerService.updateExecution('exec-123', {
        status: 'failed',
        error: { code: 'TIMEOUT', message: 'Task timed out' },
        completedAt: new Date(),
      });

      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});

describe('Scheduler Tenant Isolation', () => {
  let schedulerService: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    schedulerService = new SchedulerService(mockProviderRegistry as any);
  });

  it('should use tenant-specific provider', async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTask]),
      }),
    });

    await schedulerService.createTask({
      organizationId: 'tenant-specific',
      name: 'Tenant Task',
      cronExpression: '0 0 * * *',
      handlerType: 'queue-job',
      handlerConfig: { queueName: 'tenant-queue' },
      createdBy: 'user-1',
      createdByType: 'user',
    });

    expect(mockProviderRegistry.getActiveProvider).toHaveBeenCalledWith('tenant-specific');
  });

  it('should filter tasks by organizationId', async () => {
    await schedulerService.listTasks('org-456');

    expect(mockSelect).toHaveBeenCalled();
  });
});
