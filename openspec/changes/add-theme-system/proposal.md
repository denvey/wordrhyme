# Change: Add Theme System via Plugin Architecture

## Why

WordRhyme currently has only an Admin panel with no frontend rendering layer. Cromwell CMS demonstrates a "theme as npm package" model where themes are installable, switchable, and customizable via Admin panel. WordRhyme can adopt a "theme as plugin" model that leverages existing Module Federation 2.0 infrastructure instead of requiring a separate Next.js renderer.

## What Changes

- Define `theme` as a plugin type in manifest (`"type": "theme"`)
- Theme plugins expose frontend components via Module Federation remote entries
- Active theme configurable via Settings (one active theme per organization)
- Theme switching via Admin panel (no restart required — just config change)
- Theme plugins can declare pages, layouts, and navigation structure
- Themes depend on `@wordrhyme/plugin-api` only (same isolation as plugins)

## Impact

- Affected specs: `plugin-api`, `plugin-runtime`
- Affected code:
  - `packages/plugin/src/manifest.ts` (extend type to include `theme`)
  - `apps/server/src/plugins/` (theme-specific lifecycle handling)
  - `apps/server/src/services/` (active theme resolution)
- High complexity — requires frontend rendering strategy decision (SSR vs CSR vs SSG)
- No breaking changes to existing plugin system
