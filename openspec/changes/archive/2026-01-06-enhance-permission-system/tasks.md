# Tasks: Enhance Permission System

## Phase 1: Database Schema & Seeding

- [x] Create `roles` table schema in `apps/server/src/db/schema/roles.ts`
- [x] Create `role_permissions` table schema in `apps/server/src/db/schema/role-permissions.ts`
- [x] Export new schemas from `apps/server/src/db/schema/definitions.ts`
- [x] Run `pnpm db:generate` to create migration
- [x] Create seed function to populate default system roles for new organizations
- [x] Integrate seed into organization creation hook in auth.ts
- [x] Backfill: Create default roles for existing organizations (`seed:roles` script)

## Phase 2: Permission Kernel Refactor

- [x] Add `loadRoleCapabilities(roleSlug, orgId)` method to PermissionKernel
- [x] Update `can()` to use database-driven permission lookup
- [x] Maintain request-level caching for database queries
- [x] Add fallback to hardcoded mappings during migration period
- [x] Update unit tests for database-driven permission checks

## Phase 3: tRPC API

- [x] Create `roles` router with list/get/create/update/delete procedures
- [x] Add `assignPermissions` mutation to roles router
- [x] Create `permissions` router with list procedure (all available capabilities)
- [x] Add input validation with Zod schemas
- [x] Integrate routers into main appRouter
- [x] Add authorization checks (only admin/owner can manage roles)

## Phase 4: Admin UI - Roles Management

- [x] Create `Roles.tsx` page component (list view)
- [x] Create `RoleDetail.tsx` page component (edit view with permissions)
- [x] Add permissions matrix component for capability assignment
- [x] Group permissions by resource category (content, media, plugin:*, etc.)
- [x] Add role to sidebar navigation
- [x] Integrate role deletion with confirmation dialog

## Phase 5: Member Role Integration

- [x] Update Members page role picker to use roles from database
- [x] Update member role assignment to validate against available roles
- [x] Show role permissions summary in member detail view

## Phase 6: Cleanup & Testing

- [x] Remove hardcoded `ROLE_PERMISSIONS` constant after verification
- [x] Add integration tests for role CRUD operations
- [x] Add integration tests for permission checks with custom roles
- [x] Update existing tests that rely on hardcoded roles
- [x] Manual QA: Create custom role, assign permissions, verify access control
  - Fixed AsyncLocalStorage context issue in PermissionKernel
  - Updated requirePermission middleware to pass explicit context
  - Server restarted with fixed permission system
