# Proposal: Enhance Permission System

## Summary

Evolve the permission kernel from hardcoded role-permission mappings to a fully database-driven system with Admin UI for role management and permission assignment.

## Why

The current hardcoded role-permission system prevents organizations from defining custom roles tailored to their workflows. This limits flexibility and forces all tenants to use the same predefined roles, which doesn't scale for diverse use cases.

## Problem Statement

Current implementation has:
1. `ROLE_PERMISSIONS` hardcoded in `permission.types.ts`
2. No database tables for custom roles or role-permission mappings
3. No Admin UI for role/permission management
4. `member.role` field stores a simple string without validation against defined roles

This prevents:
- Tenant-specific custom roles
- Dynamic permission assignment
- Admin-driven role configuration

## What Changes

### Phase 1: Database Schema & Core API

1. Create `roles` table for tenant-scoped role definitions
2. Create `role_permissions` table for role-capability mappings
3. Migrate `PermissionKernel` to query database instead of hardcoded mappings
4. Add tRPC procedures for role CRUD and permission assignment

### Phase 2: Admin UI

1. Roles list page with create/edit/delete
2. Role detail page with permission assignment matrix
3. Member role assignment integration (modify existing Members page)

## Scope

### In Scope
- Database-driven roles and role-permission mappings
- Tenant-scoped roles (each organization has its own roles)
- Core capability seeding (predefined system capabilities)
- Admin UI for role management
- Permission assignment to roles
- Update existing member role assignment to use new roles

### Out of Scope
- Plugin permission registration (already specified, no changes)
- Cross-plugin permission dependencies (explicitly forbidden per governance)
- ABAC/policy engine (MVP uses simple RBAC)
- Hierarchical roles (role inheritance)

## Affected Capabilities

| Capability | Change Type |
|------------|-------------|
| permission-kernel | MODIFIED |
| database-schema | MODIFIED |
| admin-ui-host | MODIFIED |

## Dependencies

- Existing `permissions` table for capability definitions
- Existing `member` table with `role` field
- better-auth organization plugin integration

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration breaks existing role assignments | Seed default roles matching current hardcoded values |
| Performance regression on permission checks | Maintain per-request caching, add Redis cache for role-permissions |
| Tenant isolation violation | All queries filtered by organizationId |

## Success Criteria

1. Roles can be created/edited/deleted per organization
2. Capabilities can be assigned to roles via Admin UI
3. Permission checks use database-driven mappings
4. Existing `member.role` values work with new system
5. Default roles (owner/admin/member/viewer) seeded on org creation
