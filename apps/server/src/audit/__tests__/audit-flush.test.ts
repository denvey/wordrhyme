/**
 * Audit Flush Service Tests
 *
 * Tests the critical audit flush logic, especially the fallback mechanism
 * when BullMQ enqueue fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleAuditFlush, setAuditQueueService } from '../audit-flush';
import {
  auditContextStorage,
  createAuditContextData,
  addPendingLog,
  getPendingLogs,
} from '../audit-context';

// Mock dependencies
vi.mock('../../db/client', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('../../db/schema/definitions', () => ({
  auditEvents: {},
}));

vi.mock('../audit-config', () => ({
  redactSensitiveFields: vi.fn((data) => data),
}));

describe('scheduleAuditFlush', () => {
  beforeEach(() => {
    // Clear any previous queue service
    setAuditQueueService(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing when there are no pending logs', () => {
    const mockEnqueue = vi.fn();
    setAuditQueueService({ enqueue: mockEnqueue });

    // Run in audit context with no logs
    auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      () => {
        scheduleAuditFlush();
      }
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should enqueue audit job when queue service is available', async () => {
    const mockEnqueue = vi.fn().mockResolvedValue('job-123');
    setAuditQueueService({ enqueue: mockEnqueue });

    await auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      async () => {
        // Add some pending logs
        addPendingLog({
          entityType: 'users',
          entityId: 'user-1',
          action: 'DB_INSERT',
          changes: { new: { name: 'John' } },
          layer: 1,
        });

        scheduleAuditFlush();

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockEnqueue).toHaveBeenCalledWith(
          'core_audit_flush',
          expect.objectContaining({
            organizationId: 'org123',
            actorId: 'user123',
            entries: expect.arrayContaining([
              expect.objectContaining({
                entityType: 'users',
                entityId: 'user-1',
                action: 'DB_INSERT',
              }),
            ]),
          })
        );

        // Logs should be cleared after successful enqueue
        expect(getPendingLogs()).toHaveLength(0);
      }
    );
  });

  it('should fallback to direct flush when enqueue fails', async () => {
    const mockEnqueue = vi.fn().mockRejectedValue(new Error('Redis connection failed'));
    setAuditQueueService({ enqueue: mockEnqueue });

    // Mock db.insert for direct flush
    const { db } = await import('../../db/client');
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    });
    (db.insert as any) = mockInsert;

    await auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      async () => {
        // Add pending logs
        addPendingLog({
          entityType: 'posts',
          entityId: 'post-1',
          action: 'DB_UPDATE',
          changes: { old: { title: 'Old' }, new: { title: 'New' } },
          layer: 1,
        });

        scheduleAuditFlush();

        // Wait for async fallback
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Enqueue should have been attempted
        expect(mockEnqueue).toHaveBeenCalled();

        // Direct flush should have been called as fallback
        expect(mockInsert).toHaveBeenCalled();

        // Logs should be cleared after successful direct flush
        expect(getPendingLogs()).toHaveLength(0);
      }
    );
  });

  it('should clear logs even when both enqueue and direct flush fail', async () => {
    const mockEnqueue = vi.fn().mockRejectedValue(new Error('Redis down'));
    setAuditQueueService({ enqueue: mockEnqueue });

    // Mock db.insert to also fail
    const { db } = await import('../../db/client');
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('Database down')),
    });
    (db.insert as any) = mockInsert;

    await auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      async () => {
        // Add pending logs
        addPendingLog({
          entityType: 'comments',
          entityId: 'comment-1',
          action: 'DB_DELETE',
          changes: { old: { text: 'Deleted' } },
          layer: 1,
        });

        scheduleAuditFlush();

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Both should have been attempted
        expect(mockEnqueue).toHaveBeenCalled();
        expect(mockInsert).toHaveBeenCalled();

        // Logs should still be cleared to prevent memory leak
        expect(getPendingLogs()).toHaveLength(0);
      }
    );
  });

  it('should use direct flush when queue service is not available', async () => {
    // No queue service set
    setAuditQueueService(null);

    // Mock db.insert for direct flush
    const { db } = await import('../../db/client');
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    });
    (db.insert as any) = mockInsert;

    await auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      async () => {
        // Add pending logs
        addPendingLog({
          entityType: 'settings',
          entityId: 'setting-1',
          action: 'DB_UPDATE',
          changes: { new: { value: 'enabled' } },
          layer: 1,
        });

        scheduleAuditFlush();

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Direct flush should have been called
        expect(mockInsert).toHaveBeenCalled();

        // Logs should be cleared
        expect(getPendingLogs()).toHaveLength(0);
      }
    );
  });

  it('should handle multiple pending logs in batch', async () => {
    const mockEnqueue = vi.fn().mockResolvedValue('job-456');
    setAuditQueueService({ enqueue: mockEnqueue });

    await auditContextStorage.run(
      createAuditContextData(undefined, 'user123', '127.0.0.1', 'org123'),
      async () => {
        // Add multiple logs
        for (let i = 0; i < 5; i++) {
          addPendingLog({
            entityType: 'items',
            entityId: `item-${i}`,
            action: 'DB_INSERT',
            changes: { new: { name: `Item ${i}` } },
            layer: 1,
          });
        }

        scheduleAuditFlush();

        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockEnqueue).toHaveBeenCalledWith(
          'core_audit_flush',
          expect.objectContaining({
            entries: expect.arrayContaining([
              expect.objectContaining({ entityId: 'item-0' }),
              expect.objectContaining({ entityId: 'item-1' }),
              expect.objectContaining({ entityId: 'item-2' }),
              expect.objectContaining({ entityId: 'item-3' }),
              expect.objectContaining({ entityId: 'item-4' }),
            ]),
          })
        );

        expect(getPendingLogs()).toHaveLength(0);
      }
    );
  });
});
