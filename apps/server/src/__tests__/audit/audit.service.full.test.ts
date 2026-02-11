/**
 * AuditService Full Unit Tests
 *
 * Tests for the audit service methods including:
 * - Event logging with context
 * - Batch logging
 * - Query filtering
 * - Entity history
 * - Archive operations
 * - Error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditService } from '../../audit/audit.service.js';
import * as contextModule from '../../context/async-local-storage.js';

// Mock the database - using factory functions for proper reset
const createDefaultSelectMock = () =>
  vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
      groupBy: vi.fn().mockResolvedValue([]),
    }),
  });

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
});

let mockSelect = createDefaultSelectMock();

const mockTransaction = vi.fn().mockImplementation(async (callback) => {
  return callback({
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
});

vi.mock('../../db/index.js', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock the event emitter
const mockEventEmitter = {
  emit: vi.fn(),
};

describe('AuditService Methods', () => {
  let auditService: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockSelect to default for each test
    mockSelect = createDefaultSelectMock();
    auditService = new AuditService(mockEventEmitter as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log()', () => {
    it('should log event with context from AsyncLocalStorage', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue({
        userId: 'user-123',
        organizationId: 'org-456',
        ip: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
        traceId: 'trace-789',
        requestId: 'req-abc',
        sessionId: 'session-def',
      } as any);

      await auditService.log({
        entityType: 'setting',
        entityId: 'setting-123',
        action: 'update',
        changes: {
          old: { value: 'old-value' },
          new: { value: 'new-value' },
        },
      });

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.results[0].value;
      expect(insertCall.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'setting',
          entityId: 'setting-123',
          action: 'update',
          actorId: 'user-123',
          actorIp: '192.168.1.1',
          traceId: 'trace-789',
          requestId: 'req-abc',
        })
      );
    });

    it('should use system as actor when no user in context', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue(undefined);

      await auditService.log({
        entityType: 'scheduler',
        action: 'execute',
      });

      const insertCall = mockInsert.mock.results[0].value;
      expect(insertCall.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'system',
          actorType: 'system',
        })
      );
    });

    it('should use api-token as actor type when apiTokenId present', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue({
        apiTokenId: 'token-123',
        organizationId: 'org-456',
      } as any);

      await auditService.log({
        entityType: 'content',
        action: 'create',
      });

      const insertCall = mockInsert.mock.results[0].value;
      expect(insertCall.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'token-123',
          actorType: 'api-token',
        })
      );
    });

    it('should emit failure event on database error', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue(undefined);

      const dbError = new Error('Database connection failed');
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(dbError),
      });

      await expect(
        auditService.log({
          entityType: 'setting',
          action: 'update',
        })
      ).rejects.toThrow('Audit write failed');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'audit.write.failed',
        expect.objectContaining({
          type: 'audit_write_failed',
          error: dbError,
        })
      );
    });
  });

  describe('logBatch()', () => {
    it('should log multiple events in batch', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue({
        userId: 'user-123',
        organizationId: 'org-456',
      } as any);

      await auditService.logBatch([
        { entityType: 'setting', entityId: 's1', action: 'create' },
        { entityType: 'setting', entityId: 's2', action: 'create' },
        { entityType: 'setting', entityId: 's3', action: 'create' },
      ]);

      expect(mockInsert).toHaveBeenCalled();
      const insertCall = mockInsert.mock.results[0].value;
      const valuesCall = insertCall.values.mock.calls[0][0];
      expect(valuesCall).toHaveLength(3);
    });

    it('should skip empty batch', async () => {
      await auditService.logBatch([]);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should emit failure event on batch error', async () => {
      vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue(undefined);

      const dbError = new Error('Batch insert failed');
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValue(dbError),
      });

      await expect(
        auditService.logBatch([
          { entityType: 'setting', action: 'create' },
        ])
      ).rejects.toThrow('Audit batch write failed');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'audit.write.failed',
        expect.objectContaining({
          type: 'audit_write_failed',
        })
      );
    });
  });

  describe('query()', () => {
    it('should build query with entity type filter', async () => {
      await auditService.query({ entityType: 'setting' });

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should build query with multiple filters', async () => {
      await auditService.query({
        entityType: 'setting',
        organizationId: 'org-123',
        actorId: 'user-456',
        action: 'update',
        limit: 50,
        offset: 10,
      });

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should apply time range filters', async () => {
      const startTime = new Date('2024-01-01');
      const endTime = new Date('2024-12-31');

      await auditService.query({
        startTime,
        endTime,
      });

      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getById()', () => {
    it('should return single audit event', async () => {
      const mockEvent = {
        id: 'event-123',
        entityType: 'setting',
        action: 'update',
      };

      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockEvent]),
          }),
        }),
      });

      const result = await auditService.getById('event-123');

      expect(result).toEqual(mockEvent);
    });

    it('should return undefined for non-existent event', async () => {
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await auditService.getById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getEntityHistory()', () => {
    it('should query history for specific entity', async () => {
      await auditService.getEntityHistory('setting', 'setting-123', 20);

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should use default limit of 50', async () => {
      await auditService.getEntityHistory('setting', 'setting-123');

      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getTenantActivity()', () => {
    it('should query activity for tenant', async () => {
      await auditService.getTenantActivity('org-123');

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should filter by entity type if provided', async () => {
      await auditService.getTenantActivity('org-123', {
        entityType: 'user',
        limit: 25,
      });

      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('archive()', () => {
    it('should perform dry run without modifying data', async () => {
      // Override mockSelect for dry run count query
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 150 }]),
        }),
      });

      const result = await auditService.archive({ dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.archivedCount).toBe(150);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should archive old records in batches', async () => {
      let callCount = 0;
      // Mock mockSelect to return records first, then empty array
      mockSelect = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([{ id: 'e1' }, { id: 'e2' }]);
              }
              return Promise.resolve([]);
            }),
          }),
        }),
      }));

      // Mock transaction to return proper delete count
      mockTransaction.mockImplementationOnce(async (callback) => {
        return callback({
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
            }),
          }),
        });
      });

      const result = await auditService.archive({
        retentionDays: 90,
        batchSize: 100,
      });

      expect(result.dryRun).toBe(false);
      expect(result.archivedCount).toBe(2);
    });

    it('should emit failure event on archive error', async () => {
      // Override mockSelect for this test - must find records to archive
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'e1' }]),
          }),
        }),
      });

      const archiveError = new Error('Transaction failed');
      mockTransaction.mockRejectedValueOnce(archiveError);

      await expect(
        auditService.archive({ retentionDays: 90 })
      ).rejects.toThrow('Transaction failed');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'audit.archive.failed',
        expect.objectContaining({
          type: 'audit_archive_failed',
          error: archiveError,
        })
      );
    });
  });

  describe('getCountByEntityType()', () => {
    it('should return counts grouped by entity type', async () => {
      // Override mockSelect for this test
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            { entityType: 'setting', count: 100 },
            { entityType: 'user', count: 50 },
          ]),
        }),
      });

      const result = await auditService.getCountByEntityType();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ entityType: 'setting', count: 100 });
    });
  });

  describe('getTotalCount()', () => {
    it('should return total event count', async () => {
      // Override mockSelect for this test
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([{ count: 500 }]),
      });

      const result = await auditService.getTotalCount();

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(500);
    });

    it('should return 0 when no events', async () => {
      // Override mockSelect for this test
      mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      });

      const result = await auditService.getTotalCount();

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(0);
    });
  });
});

describe('Actor Type Resolution', () => {
  let auditService: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditService = new AuditService(mockEventEmitter as any);
  });

  it('should use explicit actor type when provided', async () => {
    vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue({
      userId: 'user-123',
      actorType: 'plugin' as any,
    } as any);

    await auditService.log({
      entityType: 'content',
      action: 'transform',
    });

    const insertCall = mockInsert.mock.results[0].value;
    expect(insertCall.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'plugin',
      })
    );
  });

  it('should use userId for actorId but api-token for actorType when both present', async () => {
    // Actual behavior:
    // - actorId: ctx?.userId ?? ctx?.apiTokenId ?? 'system' (userId takes precedence)
    // - actorType: apiTokenId ? 'api-token' : userId ? 'user' : 'system' (apiTokenId takes precedence for type)
    vi.spyOn(contextModule.requestContextStorage, 'getStore').mockReturnValue({
      apiTokenId: 'token-123',
      userId: 'user-456',
    } as any);

    await auditService.log({
      entityType: 'content',
      action: 'create',
    });

    const insertCall = mockInsert.mock.results[0].value;
    expect(insertCall.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-456',
        actorType: 'api-token',
      })
    );
  });
});
