# Change: Refactor Permission System with CASL Integration

## Why

The current `PermissionKernel` uses simple string-based capability matching with wildcard support. While functional for basic RBAC, it lacks:

1. **ABAC (Attribute-Based Access Control)** - Cannot enforce conditions like "user can only edit their own orders" or "manager can view reports for their department only"
2. **Field-level security** - No ability to restrict which fields a user can read/write on a resource
3. **Standardized rule format** - Custom matching logic is harder to extend and reason about compared to industry-standard solutions
4. **Admin Management API** - No API for managing roles and permissions from Admin Dashboard
5. **Plugin Permission Protocol** - No flexible registration mechanism for plugin permissions
6. **Frontend Sync** - No way for frontend to know user's permissions for UI rendering

CASL (`@casl/ability`) provides a proven, well-documented authorization library that supports all these features while maintaining compatibility with the existing white-list model.

## What Changes

### Schema Changes (**BREAKING**)

- **Refactor `role_permissions` table** to CASL-compatible structure:
  - Replace single `capability` column with `action`, `subject`, `fields`, `conditions`, `inverted` columns
  - Add `source` column for plugin tracking and cleanup
  - Migrate existing capability strings (e.g., `content:read:space`) to equivalent CASL rules
  - Add index on `role_id` for query performance

### Permission Kernel Changes

- **Replace internal matching engine** with CASL `createMongoAbility`
- **Implement condition interpolation** to replace placeholders like `${user.id}` with actual context values
- **Add Drizzle query helper** (`rulesToDrizzleQuery`) to translate CASL conditions to SQL WHERE clauses for tenant/owner scoping
- **Add field-level filtering** using `permittedFieldsOf` from CASL extras
- **Support multi-tenant context** via `currentTeamId` parameter to prevent permission leakage

### Better-Auth Changes

- **Enable `teams` plugin** in organization configuration
- **Extend `teamMember` schema** with `role` field for team-level role assignment
- **Update role aggregation logic** to collect roles from both organization and team memberships
- **Implement context switching** - only load current team roles + org-level roles

### Admin Management API (NEW)

- **Permission constants** - `APP_SUBJECTS`, `APP_ACTIONS` for Admin UI dropdowns
- **Permissions meta endpoint** - `GET /api/admin/permissions/meta`
- **Role CRUD** - Create/update/delete roles
- **Permission rules CRUD** - GET/PUT CASL rules for a role
- **User role assignment** - Assign/remove roles to users

### Plugin Integration Protocol (NEW)

- **Flexible permission definition** - Support both simple and complex plugin permissions
- **Default values** - `actions: ['manage']`, `fields: null` for simple plugins
- **Source tracking** - Populate `source` column for cleanup on uninstall
- **Admin UI adaptation** - Simplify UI for plugins with only `manage` action

### Frontend Sync API (NEW)

- **Packed rules endpoint** - `GET /api/auth/permissions`
- **CASL hydration** - Return packed rules for frontend `Ability` instance

### Bootstrap Safety (NEW)

- **Super Admin seeding** - Create role with `{ action: "manage", subject: "all" }`
- **Initial user assignment** - Assign Super Admin to `INITIAL_ADMIN_EMAIL` from `.env`

## Impact

- **Affected specs**: `permission-kernel`
- **Affected code**:
  - `apps/server/src/db/schema/role-permissions.ts` - Schema refactor
  - `apps/server/src/permission/permission-kernel.ts` - Engine replacement
  - `apps/server/src/permission/permission-matcher.ts` - Remove (replaced by CASL)
  - `apps/server/src/permission/constants.ts` - NEW: APP_SUBJECTS, APP_ACTIONS
  - `apps/server/src/permission/casl-ability.ts` - NEW: Ability creation
  - `apps/server/src/permission/drizzle-query-helper.ts` - NEW: Query translation
  - `apps/server/src/permission/capability-parser.ts` - NEW: Dual API parsing
  - `apps/server/src/auth/auth.ts` - Enable teams plugin
  - `apps/server/src/db/seed/seed-roles.ts` - Update seed data format + Super Admin
  - `apps/server/src/trpc/context.ts` - Update context to include team roles
  - `apps/server/src/trpc/routers/permissions.ts` - NEW: Admin API
  - `apps/server/src/trpc/routers/roles.ts` - Update for CASL format
  - `apps/server/src/plugins/permission-registry.ts` - Update for flexible defs
  - `packages/plugin/src/types.ts` - NEW: PluginPermissionDef interface
- **Migration required**: Yes, existing `role_permissions` data must be migrated to new format
- **Dependencies added**: `@casl/ability`

## Critical Safeguards

1. **Multi-Tenant Context** - `createAppAbility` accepts `currentTeamId` to prevent permission leakage across teams
2. **Bootstrap Safety** - Super Admin role seeded to prevent "locked out" scenario on fresh installs
3. **Plugin Isolation** - `source` column enables targeted cleanup when plugins are uninstalled
4. **Frontend Sync** - Packed rules endpoint enables frontend permission checks
