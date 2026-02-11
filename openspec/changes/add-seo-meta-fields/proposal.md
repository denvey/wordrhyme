# Change: Add SEO Meta Fields to Core Entities

## Why

Cromwell CMS provides built-in SEO support: meta title, meta description, OG tags, auto-generated sitemap, and editable robots.txt. WordRhyme as a Headless CMS should pre-reserve SEO meta fields on core entities so that when a frontend rendering layer is added, SEO data is already available without schema migration.

## What Changes

- Add `meta_title`, `meta_description`, `meta_keywords`, `og_image` columns to content entities
- Add `seo_settings` row in Settings table for robots.txt content and sitemap config
- Add SEO field group to entity edit forms in Admin panel
- **No sitemap generation yet** — deferred until frontend rendering layer exists

## Impact

- Affected specs: `database-schema`
- Affected code:
  - `apps/server/src/db/schema/` (add SEO columns to entity tables)
  - `apps/admin/src/` (SEO field group on edit pages)
  - `apps/server/src/settings/` (SEO settings schema registration)
- Low complexity — additive columns only
- No breaking changes
