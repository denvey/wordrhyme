## 1. Cache Infrastructure

- [ ] 1.1 Create `.wordrhyme/cache/plugins/` directory structure (gitignored)
- [ ] 1.2 Implement cache key generation: hash(source files + manifest version + build config)
- [ ] 1.3 Implement cache lookup: compare key with stored hash, return cached bundle if match

## 2. Integration with Plugin Manager

- [ ] 2.1 Add cache check before plugin frontend bundle build in `plugin-manager.ts`
- [ ] 2.2 Skip rebuild if cache hit, log cache status
- [ ] 2.3 Invalidate cache entry on plugin update/uninstall
- [ ] 2.4 Add `--no-cache` CLI flag to force rebuild

## 3. Observability

- [ ] 3.1 Add cache stats to `/api/health` response (hits, misses, size)
- [ ] 3.2 Log cache hit/miss per plugin during reload
- [ ] 3.3 Write tests for cache key generation and invalidation
