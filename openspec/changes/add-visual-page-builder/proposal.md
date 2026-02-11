# Change: Add Visual Page Builder with Block System

## Why

Cromwell CMS demonstrates that a block-based page builder transforms a CMS from a developer tool into a platform content operators can use directly. Cromwell's approach (CContainer/CText/CImage blocks with unique IDs, drag-drop via React Grid Layout, dual-layer modifications author+user) is proven in production. WordRhyme can implement this as a Core plugin rather than embedding it in Core, preserving architectural purity.

## What Changes

- Create `@wordrhyme/page-builder` Core plugin with drag-and-drop block editor
- Define Block System primitives: Container, Text, Image, HTML, Gallery, Plugin blocks
- Each block has unique `id` for tracking author vs. user modifications
- Block modifications stored as JSON in database (page-level)
- Plugin-contributed blocks via `manifest.json` `blocks` declaration
- Admin page for visual page editing with live preview
- Built on `@dnd-kit` (sortable, draggable) + grid layout

## Impact

- Affected specs: `admin-ui-host`, `plugin-api`
- New plugin: `plugins/page-builder/`
- Affected code:
  - `plugins/page-builder/` (new Core plugin)
  - `packages/plugin/src/` (block registration API)
  - `apps/admin/src/` (page builder UI integration)
  - `apps/server/src/db/schema/` (page modifications table)
- High complexity — requires careful design of Block schema and modification merge strategy
- No breaking changes (additive plugin)
