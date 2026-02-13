/**
 * Scoped Database Security & Performance Tests
 *
 * Tests for P0-P3 fixes:
 * - P0: Security fixes (permission bypass, tenant isolation, $nopolicy)
 * - P1: Architecture refactoring (unified ABAC strategy)
 * - P2: Performance optimizations (caching)
 * - P3: DX improvements (ABAC denial logging)
 *
 * @see apps/server/src/db/scoped-db.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock context store
let mockContext: Record<string, any> = {};
let mockContextAvailable = true;

vi.mock('../../context/async-local-storage', () => ({
    getContext: vi.fn(() => {
        if (!mockContextAvailable) {
            throw new Error('No context available');
        }
        return mockContext;
    }),
}));

// Mock permission kernel
const mockPermissionKernel = {
    can: vi.fn().mockResolvedValue(true),
    permittedFields: vi.fn().mockResolvedValue(null),
    abilityCache: new Map(),
    getCachedRulesForRequest: vi.fn().mockImplementation((requestId: string) => {
        const cached = mockPermissionKernel.abilityCache.get(requestId);
        return cached?.value?.rules;
    }),
};

class MockPermissionKernel {
    can = mockPermissionKernel.can;
    permittedFields = mockPermissionKernel.permittedFields;
    abilityCache = mockPermissionKernel.abilityCache;
    getCachedRulesForRequest = mockPermissionKernel.getCachedRulesForRequest;
}

vi.mock('../../permission/permission-kernel', () => ({
    PermissionKernel: MockPermissionKernel,
    PermissionDeniedError: class PermissionDeniedError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'PermissionDeniedError';
        }
    },
}));

// Mock key builder
const mockKeyBuilder = {
    build: vi.fn().mockResolvedValue(['user:test-user', 'org:test-org']),
};

vi.mock('../../lbac/key-builder', () => ({
    keyBuilder: mockKeyBuilder,
}));

// Mock audit context
vi.mock('../../audit/audit-context', () => ({
    addPendingLog: vi.fn(),
    getAuditLayer: vi.fn().mockReturnValue(1),
    getBusinessAuditAction: vi.fn().mockReturnValue(null),
    getBusinessAuditLevel: vi.fn().mockReturnValue(undefined),
    getBusinessAuditMetadata: vi.fn().mockReturnValue(undefined),
    hasBusinessAudit: vi.fn().mockReturnValue(false),
}));

// Mock audit config
vi.mock('../../audit/audit-config', () => ({
    shouldSkipAudit: vi.fn().mockReturnValue(false),
    getTableName: vi.fn().mockReturnValue('test_table'),
    INFRASTRUCTURE_ACTIONS: {
        INSERT: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
    },
}));

// Mock conditionsToSQL
vi.mock('../../permission/casl-to-sql', () => ({
    conditionsToSQL: vi.fn().mockReturnValue({ success: false, error: 'Not supported' }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function setMockContext(ctx: Record<string, any>) {
    mockContext = ctx;
    mockContextAvailable = true;
}

function clearMockContext() {
    mockContext = {};
    mockContextAvailable = false;
}

function createTestContext(overrides: Record<string, any> = {}) {
    return {
        requestId: 'test-request-id',
        organizationId: 'test-org-id',
        userId: 'test-user-id',
        teamIds: ['team-1'],
        userRoles: ['user'],
        permissionMeta: { action: 'read', subject: 'Article' },
        isSystemContext: false,
        ...overrides,
    };
}

// =============================================================================
// P0: Security Tests
// =============================================================================

describe('ScopedDb Security (P0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearMockContext();
    });

    describe('P0-1: Permission Failure - Deny by Default', () => {
        it('should throw PermissionDeniedError when field filtering fails', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockRejectedValueOnce(
                new Error('Permission system error')
            );

            const { __test__ } = await import('../../db/scoped-db');

            await expect(
                __test__.autoFilterFields({ id: '1', secret: 'value' }, 'read', 'Article')
            ).rejects.toThrow('Access denied for security');
        });

        it('should throw PermissionDeniedError when UPDATE field filtering fails', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockRejectedValueOnce(
                new Error('Permission system error')
            );

            const { __test__ } = await import('../../db/scoped-db');

            await expect(
                __test__.filterUpdateValues({ title: 'new' }, 'update', 'Article')
            ).rejects.toThrow('Access denied for security');
        });

        it('should filter fields correctly when permission check succeeds', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockResolvedValueOnce(['id', 'title']);

            const { __test__ } = await import('../../db/scoped-db');

            const result = await __test__.autoFilterFields(
                { id: '1', title: 'Test', secret: 'hidden' },
                'read',
                'Article'
            );

            expect(result).toEqual({ id: '1', title: 'Test' });
        });
    });

    describe('P0-4: $nopolicy Restriction', () => {
        it('should return false for non-system context', async () => {
            setMockContext(createTestContext({ isSystemContext: false }));

            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.isSystemContext()).toBe(false);
        });

        it('should return true for system context', async () => {
            setMockContext(createTestContext({ isSystemContext: true }));

            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.isSystemContext()).toBe(true);
        });

        it('should return false when no context available', async () => {
            clearMockContext();

            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.isSystemContext()).toBe(false);
        });
    });
});

// =============================================================================
// P2: Performance Tests - Log Sanitization
// =============================================================================

describe('ScopedDb Log Sanitization (P2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setMockContext(createTestContext());
    });

    describe('P2-3: Sensitive Field Redaction', () => {
        it('should redact password fields', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const data = {
                id: '1',
                username: 'john',
                password: 'secret123',
            };

            const sanitized = __test__.sanitizeForLog(data) as Record<string, unknown>;

            expect(sanitized['id']).toBe('1');
            expect(sanitized['username']).toBe('john');
            expect(sanitized['password']).toBe('[REDACTED]');
        });

        it('should redact email fields', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const data = {
                id: '1',
                email: 'john@example.com',
                name: 'John',
            };

            const sanitized = __test__.sanitizeForLog(data) as Record<string, unknown>;

            expect(sanitized['email']).toBe('[REDACTED]');
            expect(sanitized['name']).toBe('John');
        });

        it('should redact token and apiKey fields', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const data = {
                id: '1',
                token: 'jwt-token-here',
                apiKey: 'sk-123456',
                name: 'Service',
            };

            const sanitized = __test__.sanitizeForLog(data) as Record<string, unknown>;

            expect(sanitized['token']).toBe('[REDACTED]');
            expect(sanitized['apiKey']).toBe('[REDACTED]');
            expect(sanitized['name']).toBe('Service');
        });

        it('should redact nested sensitive fields', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const data = {
                id: '1',
                user: {
                    name: 'John',
                    password: 'secret',
                    profile: {
                        email: 'john@example.com',
                        avatar: 'url',
                    },
                },
            };

            const sanitized = __test__.sanitizeForLog(data) as any;

            expect(sanitized.user.name).toBe('John');
            expect(sanitized.user.password).toBe('[REDACTED]');
            expect(sanitized.user.profile.email).toBe('[REDACTED]');
            expect(sanitized.user.profile.avatar).toBe('url');
        });

        it('should summarize large arrays', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const data = Array.from({ length: 100 }, (_, i) => ({
                id: `item-${i}`,
                title: `Title ${i}`,
            }));

            const sanitized = __test__.sanitizeForLog(data) as Record<string, unknown>;

            expect(sanitized['_type']).toBe('array');
            expect(sanitized['_count']).toBe(100);
            expect(sanitized['_sampleIds']).toHaveLength(3);
            expect(sanitized['_sampleIds']).toContain('item-0');
        });

        it('should handle null and undefined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.sanitizeForLog(null)).toBeNull();
            expect(__test__.sanitizeForLog(undefined)).toBeUndefined();
        });

        it('should handle primitive values', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.sanitizeForLog('string')).toBe('string');
            expect(__test__.sanitizeForLog(123)).toBe(123);
            expect(__test__.sanitizeForLog(true)).toBe(true);
        });
    });
});

// =============================================================================
// P3: ABAC Denial Reason Tests
// =============================================================================

describe('ScopedDb ABAC Denial Logging (P3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setMockContext(createTestContext());
    });

    describe('P3-1: Denial Reason Collection', () => {
        it('should collect denial reasons for each denied instance', async () => {
            setMockContext(createTestContext());

            // Mock permission check to deny some instances
            mockPermissionKernel.can
                .mockResolvedValueOnce(true)  // First instance allowed
                .mockResolvedValueOnce(false) // Second instance denied
                .mockResolvedValueOnce(false); // Third instance denied

            const { __test__ } = await import('../../db/scoped-db');

            const instances = [
                { id: '1', status: 'draft' },
                { id: '2', status: 'published' },
                { id: '3', status: 'published' },
            ];

            const result = await __test__.checkAbacForInstances(
                instances,
                'update',
                'Article'
            );

            expect(result.allowed).toHaveLength(1);
            expect(result.denied).toHaveLength(2);
            expect(result.denialReasons).toBeInstanceOf(Map);
            expect(result.denialReasons.size).toBe(2);
        });

        it('should deny all instances on ABAC check failure', async () => {
            setMockContext(createTestContext());

            // Mock permission check to throw error
            mockPermissionKernel.can.mockRejectedValueOnce(new Error('ABAC system error'));

            const { __test__ } = await import('../../db/scoped-db');

            const instances = [
                { id: '1', status: 'draft' },
                { id: '2', status: 'published' },
            ];

            const result = await __test__.checkAbacForInstances(
                instances,
                'update',
                'Article'
            );

            expect(result.allowed).toHaveLength(0);
            expect(result.denied).toHaveLength(2);
            expect(result.denialReasons.get('_all')).toBe('ABAC check failed with error');
        });
    });

    describe('P3-2: Denial Reason Detection', () => {
        it('should detect missing rules', async () => {
            setMockContext(createTestContext());

            // No rules in cache
            mockPermissionKernel.abilityCache.clear();

            const { __test__ } = await import('../../db/scoped-db');

            const reason = await __test__.getAbacDenialReason(
                'delete',
                'Comment',
                { id: '1' },
                { requestId: 'test-request-id' }
            );

            expect(reason).toContain('No permission rules');
        });

        it('should detect no matching rules for action/subject', async () => {
            setMockContext(createTestContext());

            // Rules exist but for different action/subject
            mockPermissionKernel.abilityCache.set('test-request-id', {
                value: {
                    rules: [
                        { action: 'read', subject: 'Article', inverted: false },
                    ],
                },
            });

            const { __test__ } = await import('../../db/scoped-db');

            const reason = await __test__.getAbacDenialReason(
                'delete',
                'Article',
                { id: '1' },
                { requestId: 'test-request-id' }
            );

            expect(reason).toContain('No rules defined');
        });

        it('should detect condition mismatch', async () => {
            setMockContext(createTestContext());

            // Rule with conditions that don't match
            mockPermissionKernel.abilityCache.set('test-request-id', {
                value: {
                    rules: [
                        {
                            action: 'update',
                            subject: 'Article',
                            conditions: { status: 'draft' },
                            inverted: false,
                        },
                    ],
                },
            });

            const { __test__ } = await import('../../db/scoped-db');

            const reason = await __test__.getAbacDenialReason(
                'update',
                'Article',
                { id: '1', status: 'published' },
                { requestId: 'test-request-id' }
            );

            expect(reason).toContain('Condition mismatch');
            expect(reason).toContain('status');
        });

        it('should detect "cannot" rules', async () => {
            setMockContext(createTestContext());

            // Inverted rule (cannot)
            mockPermissionKernel.abilityCache.set('test-request-id', {
                value: {
                    rules: [
                        {
                            action: 'delete',
                            subject: 'Article',
                            conditions: { isProtected: true },
                            inverted: true,
                        },
                    ],
                },
            });

            const { __test__ } = await import('../../db/scoped-db');

            const reason = await __test__.getAbacDenialReason(
                'delete',
                'Article',
                { id: '1', isProtected: true },
                { requestId: 'test-request-id' }
            );

            expect(reason).toContain('cannot');
        });
    });
});

// =============================================================================
// P1: Architecture Tests
// =============================================================================

describe('ScopedDb Architecture (P1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setMockContext(createTestContext());
    });

    describe('P1-2: Context Strict Mode', () => {
        it('should throw in strict mode when context is missing', async () => {
            const originalEnv = process.env['STRICT_CONTEXT'];
            process.env['STRICT_CONTEXT'] = 'true';

            clearMockContext();

            try {
                const { __test__ } = await import('../../db/scoped-db');

                expect(() => __test__.getCurrentContext()).toThrow('Request context required');
            } finally {
                process.env['STRICT_CONTEXT'] = originalEnv;
            }
        });

        it('should return empty context in permissive mode when context is missing', async () => {
            const originalEnv = process.env['STRICT_CONTEXT'];
            process.env['STRICT_CONTEXT'] = 'false';

            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            clearMockContext();

            try {
                const { __test__ } = await import('../../db/scoped-db');

                const ctx = __test__.getCurrentContext();

                expect(ctx.organizationId).toBeUndefined();
                expect(ctx.userId).toBeUndefined();
            } finally {
                process.env['STRICT_CONTEXT'] = originalEnv;
                consoleSpy.mockRestore();
            }
        });
    });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('ScopedDb Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setMockContext(createTestContext());
    });

    describe('Field Filtering Flow', () => {
        it('should filter fields based on permitted fields list', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockResolvedValueOnce([
                'id',
                'title',
                'status',
            ]);

            const { __test__ } = await import('../../db/scoped-db');

            const result = await __test__.autoFilterFields(
                { id: '1', title: 'Test', secret: 'hidden', status: 'draft' },
                'read',
                'Article'
            );

            expect(result).toHaveProperty('id', '1');
            expect(result).toHaveProperty('title', 'Test');
            expect(result).toHaveProperty('status', 'draft');
            expect(result).not.toHaveProperty('secret');
        });

        it('should filter UPDATE values based on permitted fields', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockResolvedValueOnce([
                'title',
                'status',
            ]);

            const { __test__ } = await import('../../db/scoped-db');

            const result = await __test__.filterUpdateValues(
                { title: 'New Title', salary: 100000, status: 'published' },
                'update',
                'Article'
            );

            expect(result).toHaveProperty('title', 'New Title');
            expect(result).toHaveProperty('status', 'published');
            expect(result).not.toHaveProperty('salary');
        });

        it('should return all fields when permittedFields returns null', async () => {
            setMockContext(createTestContext());
            mockPermissionKernel.permittedFields.mockResolvedValueOnce(null);

            const { __test__ } = await import('../../db/scoped-db');

            const original = { id: '1', title: 'Test', secret: 'value' };
            const result = await __test__.autoFilterFields(original, 'read', 'Article');

            expect(result).toEqual(original);
        });
    });

    describe('filterObject utility', () => {
        it('should filter object based on allowed fields', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const obj = { id: '1', name: 'Test', secret: 'hidden' };
            const result = __test__.filterObject(obj, ['id', 'name']);

            expect(result).toEqual({ id: '1', name: 'Test' });
        });

        it('should return full object when allowedFields is undefined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const obj = { id: '1', name: 'Test', secret: 'hidden' };
            const result = __test__.filterObject(obj, undefined);

            expect(result).toEqual(obj);
        });
    });
});

// =============================================================================
// Critical Fixes Tests
// =============================================================================

describe('ScopedDb Critical Fixes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setMockContext(createTestContext());
    });

    describe('Critical-1: Parallel ABAC Execution', () => {
        it('should have concurrency limit constant defined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.ABAC_CONCURRENCY_LIMIT).toBeDefined();
            expect(__test__.ABAC_CONCURRENCY_LIMIT).toBeGreaterThan(0);
            expect(__test__.ABAC_CONCURRENCY_LIMIT).toBeLessThanOrEqual(50);
        });

        it('should chunk array correctly', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const chunks = __test__.chunkArray(array, 3);

            expect(chunks).toHaveLength(4);
            expect(chunks[0]).toEqual([1, 2, 3]);
            expect(chunks[1]).toEqual([4, 5, 6]);
            expect(chunks[2]).toEqual([7, 8, 9]);
            expect(chunks[3]).toEqual([10]);
        });

        it('should handle empty array', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const chunks = __test__.chunkArray([], 3);
            expect(chunks).toHaveLength(0);
        });

        it('should handle array smaller than chunk size', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const chunks = __test__.chunkArray([1, 2], 10);
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toEqual([1, 2]);
        });
    });

    describe('Critical-2: Batch Processing Safety Limits', () => {
        it('should have batch size constant defined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.DOUBLE_QUERY_BATCH_SIZE).toBeDefined();
            expect(__test__.DOUBLE_QUERY_BATCH_SIZE).toBeGreaterThan(0);
        });

        it('should have max instances constant defined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.DOUBLE_QUERY_MAX_INSTANCES).toBeDefined();
            expect(__test__.DOUBLE_QUERY_MAX_INSTANCES).toBeGreaterThan(0);
        });

        it('should have reasonable limits (batch <= max)', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.DOUBLE_QUERY_BATCH_SIZE).toBeLessThanOrEqual(
                __test__.DOUBLE_QUERY_MAX_INSTANCES
            );
        });
    });

    describe('Major-3: Request-Level Cache', () => {
        it('should have TTL constant defined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.USER_KEYS_CACHE_TTL_MS).toBeDefined();
            expect(__test__.USER_KEYS_CACHE_TTL_MS).toBeGreaterThan(0);
        });

        it('should have max size constant defined', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            expect(__test__.USER_KEYS_CACHE_MAX_SIZE).toBeDefined();
            expect(__test__.USER_KEYS_CACHE_MAX_SIZE).toBeGreaterThan(0);
        });

        it('should generate cache key hash including teamIds and roles', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const ctx1 = {
                userId: 'user-1',
                organizationId: 'org-1',
                teamIds: ['team-a', 'team-b'],
                roles: ['admin', 'editor'],
            };

            const ctx2 = {
                userId: 'user-1',
                organizationId: 'org-1',
                teamIds: ['team-a'], // Different teams
                roles: ['admin', 'editor'],
            };

            const hash1 = __test__.generateUserKeysCacheHash(ctx1);
            const hash2 = __test__.generateUserKeysCacheHash(ctx2);

            expect(hash1).not.toBe(hash2);
        });

        it('should generate same hash for same context regardless of array order', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const ctx1 = {
                userId: 'user-1',
                organizationId: 'org-1',
                teamIds: ['team-b', 'team-a'],
                roles: ['editor', 'admin'],
            };

            const ctx2 = {
                userId: 'user-1',
                organizationId: 'org-1',
                teamIds: ['team-a', 'team-b'],
                roles: ['admin', 'editor'],
            };

            const hash1 = __test__.generateUserKeysCacheHash(ctx1);
            const hash2 = __test__.generateUserKeysCacheHash(ctx2);

            // Should be equal because arrays are sorted before hashing
            expect(hash1).toBe(hash2);
        });
    });

    describe('Major-4: Multi-Rule SQL Pushdown', () => {
        // Mock table for testing
        const mockTable = {
            // Simulated Drizzle PgTable structure
            _: { name: 'test_items' },
        } as any;

        const mockUserContext = {
            userId: 'user-1',
            organizationId: 'org-1',
            roles: ['admin'],
            teamIds: ['team-1'],
        };

        it('should return success:false when no rules provided', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const result = __test__.buildCombinedAbacSQL(
                undefined,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('No rules');
        });

        it('should return success:false for empty rules array', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const result = __test__.buildCombinedAbacSQL(
                [],
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('No rules');
        });

        it('should return success:false when no matching rules for action/subject', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const rules = [
                { action: 'write', subject: 'OtherItem', conditions: { status: 'draft' } },
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('No rules for read on TestItem');
        });

        it('should return allowAll for unconditional can rule without cannot rules', async () => {
            const { __test__ } = await import('../../db/scoped-db');

            const rules = [
                { action: 'read', subject: 'TestItem', inverted: false }, // No conditions = allow all
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(true);
            expect(result.allowAll).toBe(true);
            expect(result.ruleCount).toBe(1);
        });

        it('should return success:false for unconditional cannot rule', async () => {
            const { __test__ } = await import('../../db/scoped-db');
            const { conditionsToSQL } = await import('../../permission/casl-to-sql');

            // Mock conditionsToSQL to succeed for the "can" rule
            vi.mocked(conditionsToSQL).mockReturnValueOnce({
                success: true,
                sql: { _: 'status = published' } as any,
            });

            const rules = [
                { action: 'read', subject: 'TestItem', inverted: false, conditions: { status: 'published' } },
                { action: 'read', subject: 'TestItem', inverted: true }, // Unconditional cannot = deny all
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unconditional cannot rule');
        });

        it('should handle multiple can rules separated by cannot rules', async () => {
            const { __test__ } = await import('../../db/scoped-db');
            const { conditionsToSQL } = await import('../../permission/casl-to-sql');

            // Mock conditionsToSQL to return success for this test
            vi.mocked(conditionsToSQL)
                .mockReturnValueOnce({ success: true, sql: { _: 'status = published' } as any })
                .mockReturnValueOnce({ success: true, sql: { _: 'ownerId = user-1' } as any })
                .mockReturnValueOnce({ success: true, sql: { _: 'isDeleted = true' } as any });

            const rules = [
                { action: 'read', subject: 'TestItem', inverted: false, conditions: { status: 'published' } },
                { action: 'read', subject: 'TestItem', inverted: false, conditions: { ownerId: 'user-1' } },
                { action: 'read', subject: 'TestItem', inverted: true, conditions: { isDeleted: true } },
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(true);
            expect(result.sql).toBeDefined();
            expect(result.ruleCount).toBe(3); // 2 can + 1 cannot
        });

        it('should return success:false when conditionsToSQL fails for can rule', async () => {
            const { __test__ } = await import('../../db/scoped-db');
            const { conditionsToSQL } = await import('../../permission/casl-to-sql');

            // Mock conditionsToSQL to fail
            vi.mocked(conditionsToSQL).mockReturnValue({
                success: false,
                error: 'Unsupported operator: $regex',
            });

            const rules = [
                { action: 'read', subject: 'TestItem', inverted: false, conditions: { name: { $regex: '.*test.*' } } },
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot convert condition');
        });

        it('should return success:false when conditionsToSQL fails for cannot rule', async () => {
            const { __test__ } = await import('../../db/scoped-db');
            const { conditionsToSQL } = await import('../../permission/casl-to-sql');

            // First call succeeds (for can rule), second fails (for cannot rule)
            vi.mocked(conditionsToSQL)
                .mockReturnValueOnce({ success: true, sql: { _: 'status = published' } as any })
                .mockReturnValueOnce({ success: false, error: 'Unsupported operator' });

            const rules = [
                { action: 'read', subject: 'TestItem', inverted: false, conditions: { status: 'published' } },
                { action: 'read', subject: 'TestItem', inverted: true, conditions: { secret: { $exists: true } } },
            ];

            const result = __test__.buildCombinedAbacSQL(
                rules,
                'read',
                'TestItem',
                mockTable,
                mockUserContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot convert cannot-condition');
        });
    });
});
