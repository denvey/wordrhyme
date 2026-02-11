# Change: Add Plugin Build Cache

## Why

Each PM2 Rolling Reload triggers a full plugin scan and potential rebuild. As the plugin count grows, rebuild latency increases linearly. Cromwell CMS uses `cacache` for build artifact caching to avoid redundant compilation. WordRhyme can adopt a similar strategy to reduce reload times, especially in development.

## What Changes

- Add content-addressable build cache for plugin frontend bundles (Module Federation remote entries)
- Cache key: hash of plugin source files + `manifest.json` version + build config
- On reload: compare cache key with stored hash — skip rebuild if match
- Store cache in `.wordrhyme/cache/plugins/` (gitignored)
- Add `--no-cache` flag to force rebuild
- Add cache stats to `/api/health` response

## Impact

- Affected specs: `plugin-runtime`
- Affected code:
  - `apps/server/src/plugins/plugin-manager.ts` (cache check before load)
  - `packages/plugin/src/` (build cache utilities)
- No breaking changes
- Performance improvement only — no behavioral change
