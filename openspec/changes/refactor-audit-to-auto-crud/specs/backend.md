# Spec: Backend Audit Router Refactor

## R1: createCrudRouter Integration

### Scenario: Auto-generated list with filtering
```
Given auditEvents table with filterableColumns configured
When client sends list request with filters array
Then auto-crud processes pagination, sorting, and filtering
And returns { data, total, page, perPage, pageCount }
```

### Scenario: Only read endpoints exposed
```
Given auditCrud.procedures contains list/get/create/update/delete/deleteMany/updateMany/upsert
When building auditRouter
Then only destructure { list, get } from procedures
And create/update/delete/deleteMany/updateMany/upsert are NOT accessible via tRPC
```

### Scenario: Permission integration via meta
```
Given all auto-crud procedures use protectedProcedure.meta({ permission })
When list or get is called
Then globalPermissionMiddleware checks AuditLog:read
And ScopedDb applies tenant isolation via LBAC
```

### Scenario: Custom procedures preserved
```
Given stats/entityTypes/actions use GROUP BY/DISTINCT (unsupported by auto-crud)
When auditRouter is assembled
Then custom procedures coexist with auto-crud list/get
And each has correct permission meta
```

## R2: Schema Compatibility

### Scenario: Table without updatedAt
```
Given auditEvents has no updatedAt column
When createCrudRouter applies default omitFields ['id', 'createdAt', 'updatedAt']
Then Zod .omit() silently ignores non-existent key updatedAt
And no runtime or type error occurs
```

### Scenario: omitFields excludes organizationId
```
Given omitFields includes 'organizationId'
When auto-crud derives insertSchema
Then organizationId is excluded from client input
And ScopedDb auto-injects organizationId at query time
```

## PBT Properties

### P1: Read-only invariant
```
INVARIANT: auditRouter exposes exactly 6 procedures: list, get, stats, entityTypes, actions, export
FALSIFICATION: Object.keys(auditRouter._def.procedures) should equal expected set
```

### P2: Permission consistency
```
INVARIANT: All 5 read procedures use { action: 'read', subject: 'AuditLog' }, export uses { action: 'manage', subject: 'AuditLog' }
FALSIFICATION: Extract meta from each procedure and verify permission mapping
```

### P3: List pagination
```
INVARIANT: For any (page, perPage), returned data.length <= perPage AND page <= pageCount
FALSIFICATION: Request page > total/perPage, expect empty data array
```
