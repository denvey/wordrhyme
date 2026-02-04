# ScopedDb Refactoring Plan (Major-6)

## Current State
- File: `scoped-db.ts`
- Lines: ~1983 lines (after performance fixes)
- Status: **Well-functioning but monolithic**

## Proposed Module Structure

```
apps/server/src/db/
├── scoped-db.ts              # Main export (facade) ~200 lines
├── scoped-db/
│   ├── index.ts              # Re-exports
│   ├── types.ts              # Type definitions ~50 lines
│   ├── constants.ts          # Constants (TTL, limits) ~30 lines
│   ├── permission-helpers.ts # ABAC/Permission functions ~350 lines
│   │   - debugLog
│   │   - sanitizeForLog
│   │   - getAbacDenialReason
│   │   - checkAbacForInstances
│   │   - buildCombinedAbacSQL
│   │   - executeWithAbac
│   ├── lbac-filter.ts        # LBAC filter building ~200 lines
│   │   - buildLbacFilter
│   │   - getCachedUserKeys
│   │   - getCachedKeysArraySQL
│   │   - generateUserKeysCacheHash
│   │   - cleanupExpiredUserKeysCache
│   ├── schema-detection.ts   # Schema detection with cache ~100 lines
│   │   - detectTableSchema
│   │   - TABLE_SCHEMA_CACHE
│   ├── context-helpers.ts    # Context management ~80 lines
│   │   - getCurrentContext
│   │   - isSystemContext
│   ├── audit-helpers.ts      # Audit logging ~80 lines
│   │   - logDatabaseAudit
│   │   - shouldAudit
│   ├── field-filtering.ts    # Field-level filtering ~150 lines
│   │   - autoFilterFields
│   │   - filterUpdateValues
│   │   - filterObject
│   ├── wrappers/
│   │   ├── select-wrapper.ts # SQL-like API ~200 lines
│   │   ├── query-wrapper.ts  # Query API ~150 lines
│   │   ├── insert-wrapper.ts # Insert with audit ~150 lines
│   │   ├── update-wrapper.ts # Update with LBAC ~200 lines
│   │   └── delete-wrapper.ts # Delete with LBAC ~200 lines
│   └── helpers.ts            # General utilities ~50 lines
│       - chunkArray
│       - withRetry
```

## Refactoring Priority

### Phase 1: Low Risk (Can do now)
1. Extract `constants.ts` - pure data, no dependencies
2. Extract `types.ts` - type definitions only
3. Extract `helpers.ts` - pure utility functions

### Phase 2: Medium Risk (Recommended)
4. Extract `schema-detection.ts` - isolated functionality
5. Extract `context-helpers.ts` - isolated functionality
6. Extract `field-filtering.ts` - isolated functionality

### Phase 3: Higher Risk (Careful)
7. Extract `lbac-filter.ts` - has cache state
8. Extract `permission-helpers.ts` - complex dependencies
9. Extract `audit-helpers.ts` - cross-cutting concern

### Phase 4: Wrappers (Last)
10. Extract wrapper modules - depend on all above

## Decision

**Recommendation: Defer to future sprint**

Reasons:
- All Critical/Major performance/security issues are fixed
- Current code is well-organized with clear sections
- File is maintainable despite size
- Risk of introducing regressions during refactor

**When to refactor:**
- When adding significant new features
- When multiple developers work on this file simultaneously
- When test coverage reaches >80%

## Metrics After Current Fixes

| Metric | Before | After |
|--------|--------|-------|
| Lines | ~1700 | ~1983 |
| N+1 ABAC | Serial | Parallel (10 concurrent) |
| OOM Risk | Yes | Mitigated (10K limit) |
| Cache Pollution | Possible | Request-isolated |
| SQL Pushdown | Single rule | Multi-rule |
| Encapsulation | Broken | Fixed |

## Notes

- Tests: 45 passing
- TypeScript: Some pre-existing type warnings (not blocking)
- Performance: Significant improvements from Critical-1/2 fixes
