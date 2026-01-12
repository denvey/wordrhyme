# Permission Testing Guide

## 🎯 Quick Start

### Run all permission tests
```bash
pnpm --filter @wordrhyme/server test:permission
```

### Watch mode (auto-rerun on changes)
```bash
pnpm --filter @wordrhyme/server test:permission:watch
```

### Run specific test file
```bash
pnpm --filter @wordrhyme/server test -- --run src/__tests__/permission/role-permissions.integration.test.ts
```

---

## 📋 Test Coverage

### ✅ Current Test Files (78 tests total)

1. **`capability-parser.test.ts`** (23 tests)
   - Legacy format parsing (`content:read:space`)
   - CASL format parsing (`read`, `Content`)
   - Plugin permission format
   - Wildcard handling

2. **`permission-kernel.test.ts`** (21 tests)
   - Deny by default
   - CASL ability creation
   - Condition interpolation (`${user.id}`)
   - Field-level permissions
   - Dual API support
   - Request-level caching

3. **`role-permissions.integration.test.ts`** (34 tests) ⭐ NEW
   - **Owner role**: `manage all`
   - **Admin role**: `manage Content/Menu`, `read User`
   - **Member role**: `manage Content`, `read Member`
   - **Field-level permissions**: Editor can only update `title, body, tags`
   - **ABAC conditions**: Only update own content (`ownerId: ${user.id}`)
   - **Status-based**: Read published OR own drafts
   - **Inverted rules**: `Cannot read AuditLog`
   - **Multi-role aggregation**: Combine permissions from multiple roles
   - **Real-world scenarios**: CMS Author, Reviewer workflows

---

## 🔧 When to Run Tests

### ✅ MUST run tests after:
1. Modifying permission rules in database
2. Changing role definitions
3. Updating CASL rule schema
4. Modifying `PermissionKernel` logic
5. Adding new permission middleware
6. Changing `requirePermission()` implementation

### 📝 Before committing:
```bash
# Run all permission tests
pnpm --filter @wordrhyme/server test:permission

# Run type check
pnpm --filter @wordrhyme/server type-check

# Run full test suite (optional)
pnpm --filter @wordrhyme/server test
```

---

## 🎨 Test Scenarios Covered

### 1. Role-Based Access Control (RBAC)
```typescript
// Owner: Full access
{ action: 'manage', subject: 'all' }

// Admin: Specific resources
{ action: 'manage', subject: 'Content' }
{ action: 'read', subject: 'User' }

// Member: Limited access
{ action: 'manage', subject: 'Content' }
{ action: 'read', subject: 'Member' }
```

### 2. Field-Level Permissions
```typescript
// Editor can only update specific fields
{
  action: 'update',
  subject: 'Content',
  fields: ['title', 'body', 'tags']
}
```

### 3. Attribute-Based Access Control (ABAC)
```typescript
// Only update own content
{
  action: 'update',
  subject: 'Content',
  conditions: { ownerId: '${user.id}' }
}

// Only read published content
{
  action: 'read',
  subject: 'Content',
  conditions: { status: 'published' }
}
```

### 4. Inverted Rules (Deny)
```typescript
// Can read all except AuditLog
{ action: 'read', subject: 'all', inverted: false }
{ action: 'read', subject: 'AuditLog', inverted: true }
```

### 5. Multi-Role Aggregation
```typescript
// User has both 'member' and 'editor' roles
// Permissions are combined (union)
userRoles: ['member', 'editor']
```

---

## 🐛 Debugging Failed Tests

### Check CASL rules in database
```bash
docker exec wordrhyme-postgres psql -U postgres -d wordrhyme -c "
SELECT r.name, r.slug, rp.action, rp.subject, rp.fields, rp.conditions, rp.inverted
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
WHERE r.slug = 'member'
ORDER BY rp.action;
"
```

### Verify role assignment
```bash
docker exec wordrhyme-postgres psql -U postgres -d wordrhyme -c "
SELECT u.email, m.role, o.name as org_name
FROM member m
JOIN \"user\" u ON m.user_id = u.id
JOIN organization o ON m.organization_id = o.id
WHERE u.email = 'admin@wordrhyme.com';
"
```

### Check permission kernel logs
Enable debug logging in tests:
```typescript
// In test file
beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
});
```

---

## 📊 Test Results

Last run: **78/78 tests passing** ✅

```
Test Files  3 passed (3)
     Tests  78 passed (78)
  Duration  712ms
```

### Breakdown:
- ✅ Capability Parser: 23/23
- ✅ Permission Kernel: 21/21
- ✅ Role Permissions Integration: 34/34

---

## 🚀 Adding New Tests

### Template for new role test:
```typescript
describe('Custom Role', () => {
    const customContext = createContext({
        userId: 'user-1',
        tenantId: 'org-1',
        userRoles: ['custom'],
    });

    beforeEach(() => {
        mockCaslRules([
            { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
            // Add more rules...
        ]);
    });

    it('should allow specific action', async () => {
        expect(await kernel.can('read', 'Content', undefined, customContext)).toBe(true);
    });
});
```

### Template for ABAC test:
```typescript
it('should enforce ABAC condition', async () => {
    const userId = 'user-123';
    const context = createContext({ userId, tenantId: 'org-1', userRoles: ['author'] });

    mockCaslRules([
        { action: 'update', subject: 'Content', fields: null, conditions: { ownerId: userId }, inverted: false },
    ]);

    const ownContent = { __caslSubjectType__: 'Content', id: 'c1', ownerId: userId };
    expect(await kernel.can('update', 'Content', ownContent, context)).toBe(true);

    const otherContent = { __caslSubjectType__: 'Content', id: 'c2', ownerId: 'other-user' };
    expect(await kernel.can('update', 'Content', otherContent, context)).toBe(false);
});
```

---

## 📚 Related Documentation

- **CASL Documentation**: https://casl.js.org/v6/en/
- **Permission Governance**: `/docs/architecture/PERMISSION_GOVERNANCE.md`
- **Permission Kernel**: `/apps/server/src/permission/permission-kernel.ts`
- **CASL Ability Factory**: `/apps/server/src/permission/casl-ability.ts`

---

## ✅ Pre-Commit Checklist

Before committing permission changes:

- [ ] Run `pnpm --filter @wordrhyme/server test:permission`
- [ ] All 78 tests passing
- [ ] No new TypeScript errors
- [ ] Database migrations applied (if schema changed)
- [ ] Updated test cases for new rules
- [ ] Documented breaking changes

---

**Last Updated**: 2026-01-07
**Test Coverage**: 78 tests across 3 files
**Status**: ✅ All passing
