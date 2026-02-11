# Spec: Frontend Audit Page Refactor

## R1: AutoCrudTable Integration

### Scenario: Replace hand-written table
```
Given AuditLogs page currently uses AuditFilterBar + AuditLogTable + manual pagination
When refactored to AutoCrudTable
Then filtering, sorting, and pagination are handled by AutoCrudTable
And AuditFilterBar.tsx and AuditLogTable.tsx are deleted
```

### Scenario: Custom column rendering preserved
```
Given AutoCrudTable supports `fields` configuration and `columns` override
When actorType needs Badge + Icon rendering
Then use columns override with custom cell renderer
And action column uses Badge with variant mapping (create→default, delete→destructive)
```

### Scenario: Stats cards above table
```
Given trpc.audit.stats returns { total, last24Hours, byEntityType, byAction }
When page renders
Then stats cards are rendered ABOVE AutoCrudTable as independent components
And stats data is fetched via separate useQuery (not part of AutoCrudTable)
```

### Scenario: Export via toolbar slot
```
Given AutoCrudTable supports slots.toolbarEnd
When export buttons are placed in toolbar
Then Export JSON and Export CSV buttons appear in AutoCrudTable toolbar
And clicking triggers trpc.audit.export mutation
```

### Scenario: Row click opens detail sheet
```
Given AuditLogDetailSheet is preserved
When user clicks a table row
Then detail sheet opens with full audit event data
And JsonDiffViewer shows changes if present
```

## R2: Component Cleanup

### Scenario: Barrel export update
```
Given AuditFilterBar and AuditLogTable are deleted
When index.ts is updated
Then only AuditLogDetailSheet and JsonDiffViewer are exported
```

## R3: Read-only permissions

### Scenario: No write buttons shown
```
Given permissions.can = { create: false, update: false, delete: false }
When AutoCrudTable renders
Then no "Add", "Edit", "Delete" buttons appear
And batch operations are disabled
```

## PBT Properties

### P1: Component deletion completeness
```
INVARIANT: No import references to AuditFilterBar or AuditLogTable exist after refactor
FALSIFICATION: grep -r "AuditFilterBar\|AuditLogTable" apps/admin/src/ returns empty
```

### P2: Feature parity
```
INVARIANT: All 6 current filter types (entityType, action, actorType, dateRange, traceId) are available via AutoCrudTable filters
FALSIFICATION: Open audit page, verify each filter type is accessible
```
