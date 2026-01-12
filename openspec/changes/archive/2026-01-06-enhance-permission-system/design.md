# Design: Database-Driven Permission System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Admin UI                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Roles List   │  │ Role Detail  │  │ Member Role Picker    │  │
│  │ (CRUD)       │  │ (Permissions)│  │ (existing Members.tsx)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
└─────────┼──────────────────┼─────────────────────┼──────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      tRPC Router                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ roles.*      │  │ permissions.*│  │ organization.*        │  │
│  │ (new)        │  │ (new)        │  │ (existing)            │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
└─────────┼──────────────────┼─────────────────────┼──────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Permission Kernel                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ can(capability, scope) → boolean                            │ │
│  │   1. Check request cache                                    │ │
│  │   2. Load user's roles from member.role                     │ │
│  │   3. Load role_permissions for those roles                  │ │
│  │   4. Match capability against permissions                   │ │
│  │   5. Cache & audit log                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Schema                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ roles       │  │ role_permissions │  │ permissions        │  │
│  │ (new)       │  │ (new)            │  │ (existing)         │  │
│  └─────────────┘  └──────────────────┘  └────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌──────────────────┐                          │
│  │ member      │  │ organization     │                          │
│  │ (modified)  │  │ (existing)       │                          │
│  └─────────────┘  └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema Design

### New Table: `roles`

```sql
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,  -- System roles cannot be deleted
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);
```

**Design Decisions:**
- `is_system`: Protects default roles (owner/admin/member/viewer) from deletion
- `slug`: Used for programmatic access and member.role reference
- Tenant-scoped: Each organization has its own set of roles

### New Table: `role_permissions`

```sql
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, capability)
);
```

**Design Decisions:**
- Simple many-to-many relationship
- `capability` references `permissions.capability` but not enforced as FK (allows plugin permissions to be removed independently)
- CASCADE delete ensures cleanup when role is deleted

### Modified Table: `member`

Current `member.role` stores string like "owner", "admin", "member".

**No schema change needed** - the `role` field will reference `roles.slug` within the same organization. Application logic validates this at write time.

## Permission Kernel Changes

### Current Flow (Hardcoded)

```typescript
const rolePerms = ROLE_PERMISSIONS[userRole ?? 'viewer'] ?? [];
return this.matchCapability(capability, rolePerms);
```

### New Flow (Database-Driven)

```typescript
async can(capability: string, scope?: PermissionScope): Promise<boolean> {
  // 1. Get user's role slug from context
  const { memberRole } = ctx;

  // 2. Load role's capabilities from DB (with request cache)
  const capabilities = await this.loadRoleCapabilities(memberRole, ctx.tenantId);

  // 3. Match capability
  return this.matchCapability(capability, capabilities);
}

private async loadRoleCapabilities(roleSlug: string, orgId: string): Promise<string[]> {
  // Check request cache first
  const cacheKey = `role:${orgId}:${roleSlug}`;
  if (this.requestCache.has(cacheKey)) {
    return this.requestCache.get(cacheKey);
  }

  // Query database
  const result = await db
    .select({ capability: rolePermissions.capability })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .where(and(
      eq(roles.slug, roleSlug),
      eq(roles.organizationId, orgId)
    ));

  const capabilities = result.map(r => r.capability);
  this.requestCache.set(cacheKey, capabilities);
  return capabilities;
}
```

## Default Role Seeding

When an organization is created, seed these system roles:

| Slug | Name | Capabilities |
|------|------|--------------|
| `owner` | Owner | `*:*:*` (full access) |
| `admin` | Administrator | `organization:*:*`, `plugin:*:*`, `user:manage:*`, `content:*:*` |
| `member` | Member | `content:read:space`, `content:comment:*` |
| `viewer` | Viewer | `content:read:public` |

These match the current hardcoded `ROLE_PERMISSIONS` to ensure backward compatibility.

## tRPC API Design

### roles router

```typescript
roles: {
  list: publicProcedure
    .query(() => Role[]),

  get: publicProcedure
    .input(z.object({ roleId: z.string() }))
    .query(() => RoleWithPermissions),

  create: publicProcedure
    .input(z.object({ name: z.string(), description: z.string().optional() }))
    .mutation(() => Role),

  update: publicProcedure
    .input(z.object({ roleId: z.string(), name: z.string(), description: z.string().optional() }))
    .mutation(() => Role),

  delete: publicProcedure
    .input(z.object({ roleId: z.string() }))
    .mutation(() => void),

  assignPermissions: publicProcedure
    .input(z.object({ roleId: z.string(), capabilities: z.array(z.string()) }))
    .mutation(() => void),
}
```

### permissions router (for listing available capabilities)

```typescript
permissions: {
  list: publicProcedure
    .query(() => Permission[]),  // List all available capabilities (Core + Plugin)
}
```

## Admin UI Design

### Roles List Page (`/roles`)

```
┌────────────────────────────────────────────────────────────────┐
│ Roles                                            [Create Role] │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Owner (System)                              [View]       │   │
│ │ Full access to all resources                             │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Administrator (System)                   [View] [Edit]   │   │
│ │ Manage organization, plugins, users, and content         │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Editor (Custom)                    [View] [Edit] [Delete]│   │
│ │ Create and edit content                                  │   │
│ └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Role Detail/Edit Page (`/roles/:id`)

```
┌────────────────────────────────────────────────────────────────┐
│ Edit Role: Editor                                              │
├────────────────────────────────────────────────────────────────┤
│ Name:        [Editor                                  ]        │
│ Description: [Create and edit content                 ]        │
│                                                                │
│ Permissions:                                                   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Content                                                   │   │
│ │   ☑ content:create:space   Create content in space       │   │
│ │   ☑ content:update:own     Update own content            │   │
│ │   ☑ content:read:*         Read all content              │   │
│ │   ☐ content:delete:*       Delete content                │   │
│ │   ☐ content:publish:*      Publish content               │   │
│ ├──────────────────────────────────────────────────────────┤   │
│ │ Media                                                     │   │
│ │   ☑ media:upload:space     Upload media                  │   │
│ │   ☑ media:read:*           Read media                    │   │
│ │   ☐ media:delete:*         Delete media                  │   │
│ ├──────────────────────────────────────────────────────────┤   │
│ │ Plugin: SEO Optimizer                                     │   │
│ │   ☐ plugin:seo:settings.read   Read SEO settings         │   │
│ │   ☐ plugin:seo:settings.write  Modify SEO settings       │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│                                    [Cancel] [Save Permissions] │
└────────────────────────────────────────────────────────────────┘
```

## Migration Strategy

1. **Create tables**: `roles`, `role_permissions`
2. **Seed default roles**: For each existing organization, create default system roles
3. **Populate role_permissions**: Map from hardcoded `ROLE_PERMISSIONS` to database
4. **Update PermissionKernel**: Switch to database-driven lookups
5. **Remove hardcoded mappings**: Delete `ROLE_PERMISSIONS` constant

### Rollback Plan

If issues arise:
1. Keep `ROLE_PERMISSIONS` constant as fallback
2. PermissionKernel checks DB first, falls back to hardcoded if role not found
3. Feature flag to toggle between modes

## Performance Considerations

1. **Request-level caching**: Already implemented in PermissionKernel
2. **Role-permissions query**: Single query per request (cached)
3. **Future optimization**: Redis cache for role-permissions with TTL
4. **Index**: `role_permissions(role_id)` for fast lookups
