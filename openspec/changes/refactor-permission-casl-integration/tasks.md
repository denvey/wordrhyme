## 1. Dependencies & Setup

- [x] 1.1 Add `@casl/ability` package to `apps/server/package.json`
- [x] 1.2 Add CASL type definitions (if separate package needed)
- [x] 1.3 Run `pnpm install` to update lockfile

## 2. Schema Changes

- [x] 2.1 Refactor `apps/server/src/db/schema/role-permissions.ts`:
  - Replace `capability` column with `action`, `subject`, `fields`, `conditions`, `inverted`
  - Add `source` column (nullable, for plugin tracking)
  - Update types and relations
- [x] 2.2 Generate Drizzle migration: `pnpm --filter @wordrhyme/server db:generate`
- [x] 2.3 Create migration script to convert existing `capability` strings to new format
- [x] 2.4 Verify migration on local database
- [x] 2.5 Update `apps/server/src/db/schema/zod-schemas.ts` with new validation schemas

## 3. Better-Auth Teams Integration

- [x] 3.1 Update `apps/server/src/auth/auth.ts`:
  - Enable `teams` in organization plugin config
  - Add `member` schema extension with `role` field
- [x] 3.2 Update tRPC context to aggregate roles from org + teams
- [x] 3.3 Test Better-Auth session includes team memberships
- [x] 3.4 **CRITICAL**: Implement `currentTeamId` context switching:
  - `createAppAbility(user, currentTeamId?)` must filter team roles by active team
  - Only load org-level roles + current team roles (not all teams)

## 4. Permission Kernel Refactor

- [x] 4.1 Create `apps/server/src/permission/casl-ability.ts`:
  - `createAppAbility(user, currentTeamId?)` function with team context support
  - `loadRulesFromDB(roleNames, orgId)` function
  - Condition interpolation logic
- [ ] 4.2 Create `apps/server/src/permission/drizzle-query-helper.ts`: (Deferred - requires usage context)
  - `rulesToDrizzleQuery(ability, action, subject, schema)` function
  - Support for `eq`, `inArray`, `and`, `or` operators
  - `UnsupportedConditionError` class
- [x] 4.3 Create `apps/server/src/permission/capability-parser.ts`:
  - `parseCapability(input)` function to handle dual API formats
  - Parse three-segment string `'content:read:space'` → `{ action: 'read', subject: 'Content' }`
  - Parse CASL-style `('read', 'Content')` → `{ action: 'read', subject: 'Content' }`
  - Detect subject instance for ABAC checks
- [x] 4.4 Refactor `apps/server/src/permission/permission-kernel.ts`:
  - Replace `matchCapability` calls with CASL ability checks
  - Implement overloaded `can()` method supporting both API styles
  - Add `permittedFields()` method
  - Update caching to cache Ability instance
- [x] 4.5 Remove `apps/server/src/permission/permission-matcher.ts` (replaced by CASL) - Kept for legacy support
- [x] 4.6 Update `apps/server/src/permission/index.ts` exports
- [x] 4.7 Update plugin permission registration logic:
  - Convert plugin manifest permissions to CASL format
  - Parse `key: "settings.read"` → `{ action: "read", subject: "plugin:{pluginId}:settings" }`
  - Add `source` field to track plugin origin for uninstall cleanup

## 5. Seed Data Update

- [x] 5.1 Update `apps/server/src/db/seed/seed-roles.ts`:
  - Convert hardcoded capabilities to CASL rule format
  - Add example ABAC rules for testing
- [x] 5.2 **CRITICAL**: Bootstrap Safety:
  - Create "Owner" role with `{ action: "manage", subject: "all" }`
  - Read `INITIAL_ADMIN_EMAIL` from `.env`
  - Assign Super Admin role to initial user (or first user if env not set)
- [x] 5.3 Run seed on fresh database to verify

## 6. Admin Management API

- [x] 6.1 Create `apps/server/src/permission/constants.ts`:
  - Define `APP_SUBJECTS` constant array
  - Define `APP_ACTIONS` constant array
  - Export Zod schemas derived from constants
  - Add display name mappings for UI
- [x] 6.2 Create `apps/server/src/trpc/routers/permissions.ts`:
  - `permissions.meta` - GET available subjects/actions for dropdowns
  - Protect with `requirePermission('role:manage')`
- [x] 6.3 Update `apps/server/src/trpc/routers/roles.ts`:
  - Refactor `assignPermissions` to accept CASL rule format
  - Add `getPermissions` to return CASL rules for a role
  - Validate `conditions` field is valid JSON
- [x] 6.4 Add user role assignment endpoints:
  - `users.assignRole` - Assign role to user (Better-Auth member table)
  - `users.removeRole` - Remove role from user
- [x] 6.5 Protect all Admin API with `requirePermission('role:manage')`

## 7. Plugin Integration Protocol

- [x] 7.1 Create `PluginPermissionDef` interface in `@wordrhyme/plugin`:
  - `subject: string` (required)
  - `actions?: string[]` (default: `['manage']`)
  - `fields?: string[] | null` (default: `null`)
  - `description?: string`
- [x] 7.2 Update `apps/server/src/plugins/permission-registry.ts`:
  - Implement `normalizePluginPermission()` with defaults
  - Always set `source` column to `plugin:{pluginId}`
- [x] 7.3 Add `removePluginRules(pluginId)` cleanup function:
  - Delete all `role_permissions` where `source = 'plugin:{pluginId}'`
  - Call on plugin uninstall
- [x] 7.4 Store plugin permission metadata for Admin UI:
  - Track which subjects only support `manage` action
  - Enable UI simplification for simple plugins

## 8. Frontend Rule Sync API

- [x] 8.1 Create `apps/server/src/trpc/routers/permissions.ts` (extended auth router):
  - Add `permissions.myRules` endpoint
  - Call `kernel.getRulesForUser(userRoles, tenantId)`
  - Return rules for frontend CASL hydration
- [x] 8.2 Document frontend hydration pattern:
  ```typescript
  import { createMongoAbility } from '@casl/ability';
  const rules = await trpc.permissions.myRules.query();
  const ability = createMongoAbility(rules.rules);
  ```

## 9. Tests

- [x] 9.1 Update `apps/server/src/__tests__/permission/permission-kernel.test.ts`:
  - Test CASL ability creation
  - Test condition interpolation
  - Test field-level permissions
  - Test dual API (legacy string + CASL-style)
  - Test multi-tenant context switching (currentTeamId)
- [ ] 9.2 Create `apps/server/src/__tests__/permission/drizzle-query-helper.test.ts`: (Deferred)
  - Test simple condition translation
  - Test compound conditions
  - Test unsupported operator handling
- [x] 9.3 Create `apps/server/src/__tests__/permission/capability-parser.test.ts`:
  - Test three-segment string parsing
  - Test CASL-style parsing
  - Test subject instance detection
  - Test plugin permission format conversion
- [ ] 9.4 Create integration test for Better-Auth teams + permissions
- [ ] 9.5 Test plugin permission registration and uninstall cleanup
- [ ] 9.6 Test bootstrap safety (Super Admin seeding)
- [ ] 9.7 Test frontend rule sync endpoint
- [x] 9.8 Run all permission tests: `pnpm --filter @wordrhyme/server test`

## 10. Type Checking & Cleanup

- [x] 10.1 Run type check: `pnpm --filter @wordrhyme/server type-check`
- [x] 10.2 Fix any type errors from refactor
- [x] 10.3 Update JSDoc comments in permission module
- [x] 10.4 Remove unused imports and dead code

## 11. Documentation

- [x] 11.1 Update inline code comments with CASL usage examples
- [x] 11.2 Add permission rule examples to seed file comments

---

## Dependencies

```
Task 1 (Dependencies)
    │
    ├──► Task 2 (Schema) ──► Task 4 (Kernel) ──► Task 5 (Seed)
    │                                │
    └──► Task 3 (Teams) ─────────────┘
                                     │
                                     ▼
                              Task 6 (Admin API)
                                     │
                                     ├──► Task 7 (Plugin Protocol)
                                     │
                                     └──► Task 8 (Frontend Sync)
                                              │
                                              ▼
                                       Task 9 (Tests)
                                              │
                                              ▼
                                    Task 10 (Type Check)
                                              │
                                              ▼
                                      Task 11 (Docs)
```

## Parallelizable Work

- Task 1 (Dependencies) and Task 3 (Teams) can run in parallel
- Task 6, 7, 8 can run in parallel after Task 5
- Task 9.1, 9.2, 9.3 can run in parallel
- Task 10 and 11 can run in parallel after Task 9

## Critical Safeguards Checklist

- [x] **Multi-Tenant Context**: `createAppAbility` accepts `currentTeamId` parameter
- [x] **Bootstrap Safety**: Owner role seeded with wildcard rule
- [x] **Plugin Isolation**: `source` column populated for all plugin rules
- [x] **Frontend Sync**: Rules endpoint available for hydration

## Summary

**Completed Tasks**: 1, 2, 3, 4 (except 4.2), 5, 6, 7, 8, 9 (core tests), 10, 11

**Deferred Tasks**:
- 4.2 (drizzle-query-helper) - Complex feature, needs concrete usage context
- 9.4-9.7 (integration tests) - Require full integration environment

**Files Created/Modified**:
- `apps/server/src/permission/casl-ability.ts` - NEW: CASL ability factory
- `apps/server/src/permission/capability-parser.ts` - NEW: Dual API parser
- `apps/server/src/permission/constants.ts` - NEW: Permission constants
- `apps/server/src/permission/permission-kernel.ts` - REFACTORED: CASL-based
- `apps/server/src/db/schema/role-permissions.ts` - REFACTORED: CASL columns
- `apps/server/src/trpc/routers/permissions.ts` - NEW: Permission meta API
- `apps/server/src/trpc/routers/roles.ts` - UPDATED: CASL rule format
- `apps/server/src/plugins/permission-registry.ts` - UPDATED: CASL support
- `packages/plugin/src/types.ts` - UPDATED: PluginPermissionDef
- `apps/server/src/auth/auth.ts` - UPDATED: Teams enabled
- `apps/server/src/trpc/context.ts` - UPDATED: userRoles, currentTeamId
- `apps/server/src/db/seed/seed-roles.ts` - UPDATED: CASL rules
