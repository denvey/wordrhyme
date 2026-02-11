## ADDED Requirements

### Requirement: Plugin Build Artifact Cache

The system SHALL maintain a content-addressable build cache for plugin frontend bundles (Module Federation remote entries). During the startup build pipeline (which runs as part of PM2 Rolling Reload per `PLUGIN_CONTRACT.md §4.3`), the system SHALL compare each plugin's cache key with the stored hash and skip rebuild if they match. This is a startup-time optimization, not a runtime hot-swap mechanism.

Cache key formula: `SHA256(source_files_hash + manifest.version + build_config_hash)`

Cache storage location: `.wordrhyme/cache/plugins/{pluginId}/{cacheKey}/`

#### Scenario: Cache hit skips rebuild
- **WHEN** the startup build pipeline runs during PM2 Rolling Reload
- **AND** plugin `com.vendor.seo` has not changed since last build (same cache key)
- **THEN** the cached frontend bundle is used directly
- **AND** the rebuild is skipped for that plugin
- **AND** a log entry records: "Plugin com.vendor.seo: cache hit, skipping build"

#### Scenario: Cache miss triggers rebuild
- **WHEN** the startup build pipeline runs during PM2 Rolling Reload
- **AND** plugin `com.vendor.seo` has a new version (different cache key)
- **THEN** the plugin frontend bundle is rebuilt
- **AND** the new bundle is stored in the cache
- **AND** the old cache entry is evicted

#### Scenario: Force rebuild ignores cache
- **WHEN** the system is started with `--no-cache` flag
- **THEN** all plugin frontend bundles are rebuilt regardless of cache state
- **AND** the cache is repopulated with fresh builds

#### Scenario: Cache stats in health endpoint
- **WHEN** `/api/health` is queried
- **THEN** the response includes cache statistics: `{ hits: number, misses: number, totalSize: string }`
