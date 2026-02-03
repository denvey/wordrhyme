## MODIFIED Requirements

### Requirement: Permission Caching

The Permission Kernel SHALL implement a three-layer caching strategy to optimize permission checks. Cached permissions SHALL NOT persist across requests unless explicitly designed for multi-request caching (L2 Redis cache). Cache MUST be invalidated when user roles or permission rules change.

**Layer 1: Per-Request Cache** (0ms latency)
- Cache CASL abilities and permission check results in memory Map
- Scoped to single request via `requestId`
- Automatically cleared at request end

**Layer 2: Redis Cache** (0.5-2ms latency)
- Cache permission rules (CaslRule[]) in Redis
- Key format: `perm:rules:{organizationId}:{role1,role2,role3}` (roles sorted alphabetically)
- TTL: Configurable via `PERMISSION_CACHE_TTL` environment variable (default: 300 seconds)
- Invalidation: Automatic on permission rule modifications + TTL expiration
- Error handling: Redis failure SHALL fallback to L3 (Database) gracefully

**Layer 3: Database** (15-20ms latency)
- Load permission rules from `role_permissions` table
- Used when L1 and L2 cache miss
- Newly loaded rules SHALL be written to L2 cache for subsequent requests

#### Scenario: Per-request caching (L1)
- **WHEN** a permission check is performed for User A in Request 1
- **THEN** the CASL ability is created and cached in memory Map
- **WHEN** the same permission is checked again in Request 1
- **THEN** the cached ability is returned (0ms, no DB or Redis query)
- **WHEN** Request 2 starts for the same user
- **THEN** L1 cache is cleared, check proceeds to L2

#### Scenario: Redis cache hit (L2)
- **WHEN** Request 2 checks permissions for User A (org X, roles [editor])
- **AND** L1 cache is empty (new request)
- **AND** L2 Redis cache contains `perm:rules:org-x:editor` (not expired)
- **THEN** permission rules are loaded from Redis (~1ms)
- **AND** CASL ability is created and cached in L1
- **AND** NO database query is performed

#### Scenario: Redis cache miss, database fallback (L3)
- **WHEN** Request 1 checks permissions for User A (org X, roles [editor])
- **AND** L1 cache is empty (new request)
- **AND** L2 Redis cache does not contain `perm:rules:org-x:editor`
- **THEN** permission rules are loaded from database (~17ms)
- **AND** rules are written to L2 Redis with TTL=300s
- **AND** CASL ability is created and cached in L1

#### Scenario: Redis failure graceful degradation
- **WHEN** Redis is unavailable or returns error
- **AND** a permission check is performed
- **THEN** the system SHALL log warning "Redis error, fallback to DB"
- **AND** permission rules are loaded from database (L3)
- **AND** the request continues without failure

#### Scenario: Permission rule change invalidates cache
- **WHEN** an admin modifies role permissions in `role_permissions` table
- **THEN** `permissionCache.invalidateOrganization(organizationId)` SHALL be called
- **AND** all Redis keys matching `perm:rules:{organizationId}:*` are deleted
- **WHEN** next permission check occurs for any user in that organization
- **THEN** L2 cache miss triggers database reload (fresh rules)

#### Scenario: Cache TTL expiration
- **WHEN** a permission rule is cached in Redis with TTL=300s
- **AND** 5 minutes elapse without cache invalidation
- **THEN** the Redis key automatically expires
- **WHEN** next permission check occurs
- **THEN** L2 cache miss triggers database reload
- **AND** the cycle repeats (preventing stale cache indefinitely)

---

## ADDED Requirements

### Requirement: Field-Level Permissions API

The Permission Kernel SHALL provide a `permittedFields(action, subject, ctx)` API to query which fields a user is allowed to access for a given action and subject. This enables automatic field filtering in database queries.

The API SHALL return:
- `string[] | undefined` - Array of permitted field names, or `undefined` if all fields are permitted
- Fields are extracted from CASL rules with `fields` property
- Only non-inverted rules are considered (cannot rules are ignored)

#### Scenario: User has field-level restrictions
- **WHEN** role "editor" has CASL rule: `{ action: 'read', subject: 'Article', fields: ['id', 'title', 'content'] }`
- **AND** a user with role "editor" calls `permissionKernel.permittedFields('read', 'Article', ctx)`
- **THEN** the API returns `['id', 'title', 'content']`

#### Scenario: User has no field restrictions (all fields permitted)
- **WHEN** role "admin" has CASL rule: `{ action: 'manage', subject: 'Article' }` (no `fields` property)
- **AND** a user with role "admin" calls `permittedFields('read', 'Article', ctx)`
- **THEN** the API returns `undefined` (indicating all fields are permitted)

#### Scenario: Multiple roles with overlapping field restrictions
- **WHEN** a user has roles ["viewer", "editor"]
- **AND** role "viewer" permits fields `['id', 'title']`
- **AND** role "editor" permits fields `['id', 'title', 'content', 'authorId']`
- **AND** user calls `permittedFields('read', 'Article', ctx)`
- **THEN** the API returns union of all fields: `['id', 'title', 'content', 'authorId']` (deduplicated)

#### Scenario: No matching rules found
- **WHEN** a user has role "guest"
- **AND** role "guest" has no rules for `read:Article`
- **AND** user calls `permittedFields('read', 'Article', ctx)`
- **THEN** the API returns `undefined` (no restrictions, but permission check will still fail in `can()`)

---

### Requirement: Audit Recursion Prevention

The Permission Kernel SHALL provide a `skipAudit` flag in the `can()` and `require()` methods to prevent infinite recursion when writing audit logs. When `skipAudit: true`, the permission check SHALL NOT write to the `audit_logs` table.

This flag is intended for **internal system use only**, such as:
- Database-layer permission checks (ScopedDb)
- Audit log writes (avoid self-triggering)
- System health checks

#### Scenario: Normal permission check with audit logging
- **WHEN** a user attempts action `content:delete` via tRPC handler
- **AND** `permissionKernel.require('delete', 'Content', instance, ctx)` is called
- **AND** the check fails (user lacks permission)
- **THEN** permission is denied (throws error)
- **AND** an audit log entry is written to `audit_logs` table

#### Scenario: Database-layer check skips audit to prevent recursion
- **WHEN** ScopedDb Proxy intercepts an UPDATE query
- **AND** calls `permissionKernel.require('update', 'Article', instance, { ...ctx, skipAudit: true })`
- **AND** the check passes
- **THEN** permission is granted
- **AND** NO audit log entry is written (avoids triggering ScopedDb recursion)

#### Scenario: Audit log write uses rawDb to prevent recursion
- **WHEN** PermissionKernel writes an audit log entry
- **THEN** it SHALL use `rawDb.insert(auditLogs).values(entry)`
- **AND** NOT use the permission-wrapped `db` instance
- **AND** this prevents ScopedDb from intercepting the audit write

---

### Requirement: SQL Condition Pushdown Optimization

The Permission Kernel MAY integrate with a SQL optimization layer (`casl-to-sql.ts`) to convert CASL attribute-based conditions into SQL WHERE clauses. This optimization reduces latency for UPDATE/DELETE operations by eliminating the need for a separate SELECT query to fetch resource instances.

**Conversion Rules**:
- Template variables like `{ authorId: '${user.id}' }` are resolved to actual values
- MongoDB-style operators are converted:
  - `$eq` → `eq(column, value)`
  - `$ne` → `not(eq(column, value))`
  - `$in` → `inArray(column, values)`
  - `$gte`, `$lte`, `$gt`, `$lt` → corresponding Drizzle operators

**Fallback Strategy**:
- If conditions contain unsupported operators (`$or`, `$and`, nested conditions), SQL conversion returns `undefined`
- The system SHALL fallback to double-query approach (SELECT instances, check each, then UPDATE)

**Performance Impact**:
- Simple conditions: 20ms → 10ms (~50% improvement)
- Complex conditions: 20ms (no regression, same as before)

#### Scenario: Simple ABAC condition converted to SQL (single query)
- **WHEN** CASL rule is `{ action: 'update', subject: 'Article', conditions: { authorId: '${user.id}' } }`
- **AND** user with `userId = 'user-123'` attempts to update Article with `id = 'article-456'`
- **THEN** `conditionsToSQL()` converts condition to `WHERE authorId = 'user-123'`
- **AND** the UPDATE query becomes:
  ```sql
  UPDATE articles SET ... WHERE id = 'article-456' AND authorId = 'user-123'
  ```
- **AND** NO separate SELECT query is performed
- **AND** execution time: ~10ms (single query)

#### Scenario: Complex ABAC condition falls back to double query
- **WHEN** CASL rule contains `{ conditions: { $or: [{ authorId: '${user.id}' }, { collaborators: { $in: ['${user.id}'] } }] } }`
- **AND** user attempts to update Article
- **THEN** `conditionsToSQL()` returns `undefined` (unsupported operator)
- **AND** the system performs SELECT to fetch instances
- **AND** checks each instance with CASL runtime evaluation
- **AND** executes UPDATE with original WHERE clause
- **AND** execution time: ~20ms (double query, same as before)

#### Scenario: SQL optimization with field filtering
- **WHEN** SQL condition pushdown is successful (single query)
- **AND** user has field-level restrictions (e.g., can only update `['title', 'content']`)
- **THEN** UPDATE values are filtered before execution
- **AND** the final query is:
  ```sql
  UPDATE articles SET title = ?, content = ? WHERE id = ? AND authorId = ?
  ```
- **AND** unauthorized fields (e.g., `secretNotes`) are removed from SET clause

---

## ADDED Requirements

### Requirement: Debug Logging for Permission Decisions

The Permission Kernel SHALL support a debug mode activated by the `DEBUG_PERMISSION=true` environment variable. When enabled, the system SHALL log detailed permission decision chains to facilitate troubleshooting.

Debug logs SHALL include:
- Action and subject being checked
- Cache hit/miss status (L1/L2/L3)
- ABAC evaluation results (pass/fail, matched conditions)
- Field filtering decisions (original fields, filtered fields, removed fields)
- SQL optimization status (single query vs double query fallback)

Logs SHALL use `console.log()` with prefix `[PermissionDB]` or `[PermissionKernel]`.

#### Scenario: Debug mode enabled, full decision chain logged
- **WHEN** `DEBUG_PERMISSION=true` environment variable is set
- **AND** a SELECT query is executed with `.meta({ permission: { action: 'read', subject: 'Article' }})`
- **THEN** the system logs:
  ```
  [PermissionDB] SELECT with permission { action: 'read', subject: 'Article', table: 'articles' }
  [PermissionKernel] ✅ Cache HIT: org=org-123, roles=editor (L2 Redis, 1ms)
  [PermissionDB] Field filtering read Article {
    allowedFields: ['id', 'title', 'content'],
    originalKeys: ['id', 'title', 'content', 'secretNotes'],
    removed: ['secretNotes']
  }
  ```

#### Scenario: Debug mode disabled, no logs
- **WHEN** `DEBUG_PERMISSION` is not set or set to `false`
- **AND** permission checks are performed
- **THEN** NO debug logs are written (only errors/warnings)

#### Scenario: Debug logs for ABAC failure
- **WHEN** `DEBUG_PERMISSION=true`
- **AND** user attempts to update Article with `id = 'article-123'`
- **AND** Article `authorId = 'user-999'` (not the current user `user-123`)
- **THEN** the system logs:
  ```
  [PermissionDB] UPDATE with permission { action: 'update', subject: 'Article', table: 'articles' }
  [PermissionDB] UPDATE query found 1 instances
  [PermissionKernel] ❌ ABAC check FAILED: update Article article-123 (authorId mismatch)
  [PermissionKernel] Denied: Missing permission: update:Article
  ```
- **AND** the request is rejected with 403 error
