## Context

WordRhyme's permission system needs to evolve from simple capability-string matching to a full-featured ABAC system. The current implementation:

- Uses `PermissionKernel.can(capability, scope)` with string matching
- Stores capabilities as single strings in `role_permissions.capability`
- Supports wildcards via custom `matchCapability()` function

The target architecture integrates CASL (`@casl/ability`) as the authorization engine while maintaining:
- Tenant isolation (cross-tenant access forbidden)
- Per-request caching
- Audit logging for denied/sensitive operations
- Database-driven role definitions

### Stakeholders

- **Backend developers**: Will use new CASL-based APIs
- **Admin users**: Will see enhanced role permission management UI (future)
- **Plugin developers**: Will benefit from fine-grained permission checks

## Goals / Non-Goals

### Goals

1. Replace internal permission matching with CASL `MongoAbility`
2. Support ABAC conditions (e.g., `{ ownerId: "${user.id}" }`)
3. Support field-level security for response sanitization
4. Maintain backward compatibility for existing `can()` API signature
5. Provide Drizzle query helpers for database-level filtering

### Non-Goals

1. Runtime hot-reloading of permission rules (requires restart)
2. UI for visual rule editing (future scope)
3. Full MongoDB query syntax support (only simple conditions)
4. Cross-plugin permission dependencies (forbidden by architecture)

## Decisions

### Decision 1: Use MongoAbility (not PureAbility)

**Choice**: `createMongoAbility` from `@casl/ability`

**Rationale**:
- MongoDB query syntax is widely understood and documented
- Supports nested conditions and array matching
- Better ecosystem support (CASL extras, tutorials)

**Alternatives considered**:
- `PureAbility` (simpler but less powerful conditions)
- Custom condition evaluator (maintenance burden)

### Decision 2: Condition Interpolation at Ability Creation Time

**Choice**: Replace `${user.id}` placeholders when building AbilityBuilder

**Rationale**:
- Conditions are evaluated once per request, not per check
- Enables caching of the built Ability object
- Matches CASL's recommended pattern

**Implementation**:
```typescript
function interpolateConditions(
  conditions: Record<string, unknown>,
  context: UserContext
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(conditions).replace(
      /\$\{user\.(\w+)\}/g,
      (_, key) => context[key] ?? ''
    )
  );
}
```

### Decision 3: Drizzle Query Translation for Scoped Queries

**Choice**: Implement `rulesToDrizzleQuery(ability, action, subject, schema)` helper

**Rationale**:
- `@casl/drizzle` does not exist officially
- Memory filtering is not acceptable for list queries
- Scope conditions (tenantId, ownerId) are common patterns

**Supported Conditions**:
| MongoDB Operator | Drizzle Equivalent |
|------------------|-------------------|
| `{ field: value }` | `eq(schema.field, value)` |
| `{ field: { $in: [...] } }` | `inArray(schema.field, [...])` |
| `{ $and: [...] }` | `and(...)` |
| `{ $or: [...] }` | `or(...)` |

**Unsupported** (will throw):
- `$not`, `$nor`, `$exists`, `$regex`, nested paths

**Fallback**: If conditions cannot be translated, the function throws. Callers must handle by either:
1. Using explicit scoping (e.g., `where(eq(table.orgId, ctx.tenantId))`)
2. Applying memory filtering for small datasets

### Decision 4: Schema Migration Strategy

**Choice**: Alter existing `role_permissions` table in-place

**Migration Steps**:
1. Add new columns: `action`, `subject`, `fields`, `conditions`, `inverted`
2. Migrate data: Parse existing `capability` strings into new columns
3. Drop old column: Remove `capability` column
4. Update indexes

**Mapping from old to new**:
```
"content:read:space" → { action: "read", subject: "Content", fields: null, conditions: null }
"core:users:manage"  → { action: "manage", subject: "User", fields: null, conditions: null }
"*:*:*"              → { action: "manage", subject: "all", fields: null, conditions: null }
```

### Decision 5: Better-Auth Teams Integration

**Choice**: Enable teams plugin and extend `teamMember.role`

**Rationale**:
- Teams provide natural sub-tenant grouping
- Role field allows team-specific permissions
- Aligns with specification requirement

**Role Aggregation**:
```typescript
interface UserContext {
  id: string;
  orgId: string;
  roles: string[];  // e.g., ["owner", "team:finance"]
  attributes: Record<string, unknown>;
}
```

Roles are collected from:
1. `organization.member.role` (org-level)
2. `teamMember.role` (team-level, prefixed with `team:`)

### Decision 6: Dual API Strategy (Legacy + CASL)

**Choice**: Support both three-segment string API and CASL-style object API

**Rationale**:
- Minimizes migration cost for existing code
- Simple checks (menu visibility) don't need ABAC complexity
- Complex checks (owner-based access) benefit from object-based API

**API Design**:

```typescript
// API 1: Three-segment string (simple checks)
// For menu visibility, button display, basic capability checks
await permissions.can('content:read')           // → { action: "read", subject: "Content" }
await permissions.can('core:users:manage')      // → { action: "manage", subject: "User" }

// API 2: CASL-style (ABAC checks)
// For condition-based access control with actual data
await permissions.can('update', content)        // content = { id, authorId, orgId, ... }
await permissions.can('delete', 'Order', { id: 'order-123', ownerId: 'user-456' })

// API 3: Field-level check
const allowedFields = permissions.permittedFields('read', 'User')
```

**Internal Resolution**:

| Input | Parsed As |
|-------|-----------|
| `'content:read'` | `{ action: 'read', subject: 'Content' }` |
| `'content:read:space'` | `{ action: 'read', subject: 'Content' }` (scope ignored in CASL) |
| `'read', 'Content'` | `{ action: 'read', subject: 'Content' }` |
| `'read', contentObj` | `{ action: 'read', subject: 'Content' }` + condition check against object |

**Method Signatures**:

```typescript
class PermissionKernel {
  // Overload 1: Legacy three-segment string
  can(capability: string, scope?: PermissionScope): Promise<boolean>;

  // Overload 2: CASL-style with subject string
  can(action: string, subject: string, instance?: Record<string, unknown>): Promise<boolean>;

  // Overload 3: CASL-style with subject instance
  can(action: string, subject: Record<string, unknown>): Promise<boolean>;

  // Field-level permissions
  permittedFields(action: string, subject: string): string[];
}
```

**Alternatives considered**:
- Full CASL migration (too disruptive)
- Separate methods like `canLegacy()` / `canCasl()` (confusing)

### Decision 7: Transport-Agnostic Architecture

**Choice**: Design `PermissionKernel` as a standalone NestJS Injectable service, independent of any transport layer (tRPC/REST/GraphQL).

**Rationale**:
- Project currently uses tRPC, but may add REST or GraphQL endpoints in the future
- Authorization logic should be centralized, not duplicated per transport layer
- Different transports can integrate via their own middleware/guard patterns

**Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Transport Layer                       │
├─────────────┬─────────────────┬─────────────────────────┤
│   tRPC      │   REST          │   GraphQL               │
│  Middleware │   Guard         │   Guard                 │
└──────┬──────┴────────┬────────┴───────────┬─────────────┘
       │               │                    │
       ▼               ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              PermissionKernel (Injectable)              │
│  • can(capability) / can(action, subject)               │
│  • permittedFields(action, subject)                     │
│  • rulesToDrizzleQuery(...)                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           CASL Ability (cached per-request)             │
└─────────────────────────────────────────────────────────┘
```

**Integration Patterns**:

| Transport | Integration Method | Example |
|-----------|-------------------|---------|
| tRPC | `t.middleware()` | `requirePermission('content:read')` |
| REST | `@UseGuards(PermissionGuard)` | NestJS CanActivate guard |
| GraphQL | `@UseGuards(GqlPermissionGuard)` | GqlExecutionContext guard |

**Context Injection**:

All transports share a common pattern for injecting `PermissionContext` via AsyncLocalStorage:

```typescript
// Unified context setup (works for all transports)
const context: PermissionContext = {
  requestId: crypto.randomUUID(),
  userId: user.id,
  tenantId: user.orgId,
  roles: user.roles,
  attributes: user.attributes,
};
runWithContext(context, () => handler());
```

**Future REST Integration** (when needed):

```typescript
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionKernel: PermissionKernel,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.get<string>('capability', context.getHandler());
    return capability ? this.permissionKernel.can(capability) : true;
  }
}

// Usage
@Get()
@SetMetadata('capability', 'content:read')
@UseGuards(PermissionGuard)
findAll() { /* ... */ }
```

**Future GraphQL Integration** (when needed):

```typescript
@Injectable()
export class GqlPermissionGuard implements CanActivate {
  constructor(private permissionKernel: PermissionKernel) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const capability = this.reflector.get<string>('capability', ctx.getHandler());
    return capability ? this.permissionKernel.can(capability) : true;
  }
}
```

**Benefits**:
- Zero code changes to `PermissionKernel` when adding new transports
- Consistent authorization behavior across all APIs
- Single source of truth for permission rules

### Decision 8: Tenant Isolation via Application-Layer DB Wrappers

**Choice**: Tenant isolation is enforced via existing application-layer db wrapper methods, not at the CASL layer.

**Rationale**:
- Project already has encapsulated db query methods that automatically inject `organizationId` filter
- Tenant boundaries are strictly enforced at application layer - cross-tenant access is only allowed for platform management
- Duplicating tenant checks in CASL would be redundant and error-prone
- CASL conditions focus on business logic (owner-based, department-based) not tenant scoping

**Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                   Permission Check                       │
│  CASL Ability.can(action, subject)                      │
│  → Business logic: owner, department, role-based        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Application Layer - DB Wrappers             │
│  Encapsulated db methods auto-inject organizationId     │
│  → Tenant isolation: cross-tenant access blocked        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Database                            │
└─────────────────────────────────────────────────────────┘
```

**Implications**:
- Three-segment scope (e.g., `content:read:space`) is ignored in CASL matching because tenant scoping is handled by db wrappers
- `rulesToDrizzleQuery` does NOT inject tenant conditions - caller must use tenant-aware db wrappers
- Platform management (cross-tenant) will use separate admin context with explicit tenant override

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking migration fails | Data loss | Backup before migration, test on staging |
| CASL performance overhead | Slower checks | Per-request ability caching, benchmarks |
| Drizzle translation gaps | Memory filtering needed | Document limitations, log warnings |
| Teams plugin side effects | Auth behavior change | Review Better-Auth changelog, test auth flows |

## Migration Plan

### Pre-Migration

1. Backup `role_permissions` table
2. Add new columns as nullable
3. Deploy code that reads both old and new format

### Migration Script

```typescript
// Pseudocode
for (const row of existingRolePermissions) {
  const [resource, action, scope] = row.capability.split(':');
  await db.update(rolePermissions)
    .set({
      action: action ?? 'manage',
      subject: capitalize(resource) ?? 'all',
      fields: null,
      conditions: null,
      inverted: false,
    })
    .where(eq(rolePermissions.id, row.id));
}
```

### Post-Migration

1. Drop `capability` column
2. Remove nullable from new columns
3. Update seed scripts

### Rollback

1. Re-add `capability` column
2. Reverse-migrate data from new columns
3. Drop new columns
4. Deploy old code

### Decision 9: Multi-Tenant Context Switching

**Choice**: `createAppAbility` must accept `currentTeamId` parameter to scope permissions to active context.

**Rationale**:
- Users can belong to multiple teams with different roles
- Loading all team roles simultaneously causes permission leakage
- Only active team context + global org roles should be evaluated

**Implementation**:
```typescript
async function createAppAbility(
  user: UserContext,
  currentTeamId?: string
): Promise<MongoAbility> {
  // 1. Load org-level roles (always included)
  const orgRoles = await loadOrgRoles(user.id, user.orgId);

  // 2. Load team-specific roles (only for current team)
  const teamRoles = currentTeamId
    ? await loadTeamRoles(user.id, currentTeamId)
    : [];

  // 3. Merge and build ability
  const allRoles = [...orgRoles, ...teamRoles];
  return buildAbilityFromRoles(allRoles, user);
}
```

### Decision 10: Frontend Rule Sync via Packed Rules

**Choice**: Provide `GET /api/auth/permissions` endpoint returning packed CASL rules.

**Rationale**:
- Frontend cannot access database directly
- CASL's `packRules` produces lightweight JSON for hydration
- Enables `<Can>` component usage in React

**Implementation**:
```typescript
// Backend endpoint
router.get('/api/auth/permissions', async (ctx) => {
  const ability = await kernel.createAppAbility(ctx.user, ctx.currentTeamId);
  const rules = ability.rules;
  return { rules: packRules(rules) };
});

// Frontend hydration
import { unpackRules, createMongoAbility } from '@casl/ability';
const ability = createMongoAbility(unpackRules(packedRules));
```

### Decision 11: Bootstrap Safety (Super Admin Seeding)

**Choice**: Seed script creates "Super Admin" role with `{ action: "manage", subject: "all" }` and assigns to initial user.

**Rationale**:
- Fresh installs have empty database
- Admin API requires permissions to access
- Without bootstrap, system is locked out

**Implementation**:
- Read `INITIAL_ADMIN_EMAIL` from `.env`
- Create "Super Admin" role with wildcard rule
- Assign to user matching email (or first user if not specified)

### Decision 12: Plugin Permission Cleanup on Uninstall

**Choice**: Use `source` column in `role_permissions` to track plugin origin and enable cleanup.

**Rationale**:
- Uninstalled plugins leave orphaned permission rules
- Orphaned rules cause Admin UI errors (subject not in dropdown)
- `source` column enables targeted deletion

**Implementation**:
```typescript
// On plugin install
await db.insert(rolePermissions).values({
  ...rule,
  source: `plugin:${pluginId}`,
});

// On plugin uninstall
await db.delete(rolePermissions)
  .where(eq(rolePermissions.source, `plugin:${pluginId}`));
```

### Decision 13: Flexible Plugin Permission Definition

**Choice**: Support both simple and complex plugin permission definitions with sensible defaults.

**Rationale**:
- Most plugins only need simple "full access to my resource" permissions
- Complex plugins may need fine-grained action/field control
- Defaults reduce boilerplate for simple cases

**Type Definition**:
```typescript
interface PluginPermissionDef {
  subject: string;           // Required: e.g., 'SeoTools'
  actions?: string[];        // Optional: default ['manage']
  fields?: string[] | null;  // Optional: default null (all fields)
  description?: string;      // Optional: for Admin UI
}
```

**Normalization Logic**:
```typescript
function normalizePluginPermission(pluginId: string, def: PluginPermissionDef) {
  const subject = `plugin:${pluginId}:${def.subject}`;
  const actions = def.actions ?? ['manage'];
  const fields = def.fields ?? null;

  return actions.map(action => ({
    action,
    subject,
    fields,
    conditions: null,
    inverted: false,
    source: `plugin:${pluginId}`,
  }));
}
```

### Decision 14: Admin API Design (Hybrid UI)

**Choice**: Structured form for Action/Subject, JSON textarea for Conditions.

**Rationale**:
- Action/Subject are finite sets - dropdowns prevent typos
- Conditions are flexible ABAC expressions - JSON preserves power
- Hybrid approach balances usability and flexibility

**API Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/permissions/meta` | GET | Returns APP_SUBJECTS, APP_ACTIONS for dropdowns |
| `/api/admin/roles` | CRUD | Role management |
| `/api/admin/roles/:id/permissions` | GET/PUT | CASL rules for a role |
| `/api/admin/users/:id/roles` | GET/PUT | User role assignment |

**Constants File**:
```typescript
export const APP_SUBJECTS = ['all', 'User', 'Role', 'Content', 'Order', 'Product', 'Organization'] as const;
export const APP_ACTIONS = ['manage', 'create', 'read', 'update', 'delete'] as const;
```

## Open Questions

1. **Field naming convention**: Should CASL subjects be PascalCase (`User`) or camelCase (`user`)?
   - **Recommendation**: PascalCase to match TypeScript class/type naming

2. **Wildcard migration**: How to handle `*:*:*` superadmin capability?
   - **Recommendation**: Map to `{ action: "manage", subject: "all" }` (CASL convention)

3. **Team role format**: Should team roles include team ID or just name?
   - **Recommendation**: Use `team:{teamId}:{roleSlug}` for uniqueness
