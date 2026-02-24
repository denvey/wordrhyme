# Change: Add Media Library Admin UI

## Why

WordRhyme has a fully implemented backend asset system (Sharp image processing, 4 variant presets, CRUD with metadata) but lacks an Admin panel UI for browsing, uploading, and managing media. Content operators cannot interact with the asset system without developer tools. Cromwell CMS demonstrates a production-ready media library with grid/list views, drag-drop upload, and lightbox preview.

## What Changes

- Add Admin page `pages/Files.tsx` with grid/list view toggle for media browsing
- Implement drag-and-drop upload zone with progress indicators
- Add image lightbox preview with metadata editing (alt, title, tags)
- Display variant thumbnails (leverage existing `thumbnail`/`small`/`medium`/`large` presets)
- Add folder navigation and bulk operations (delete, move, tag)
- Add media picker dialog for reuse in other Admin pages (e.g., entity edit forms)

## Impact

- Affected specs: `admin-ui-host`
- Affected code:
  - `apps/admin/src/pages/Files.tsx` (existing file, enhance)
  - `apps/admin/src/components/media/` (new components)
  - `apps/server/src/trpc/routers/assets.ts` (may need list endpoint enhancements)
- **Backend is already complete** — this is purely Admin UI work
- No breaking changes
