## ADDED Requirements

### Requirement: SEO Meta Fields on Content Entities

Content entity tables SHALL include SEO meta fields: `meta_title`, `meta_description`, `meta_keywords`, `og_image`. These fields SHALL be nullable and stored as `varchar` (titles/keywords) or `text` (description). The fields are reserved for future frontend rendering use.

#### Scenario: SEO fields available on entity
- **WHEN** an admin edits a content entity (e.g., post, product)
- **THEN** a collapsible "SEO" section is available on the edit form
- **AND** the section contains fields: Meta Title, Meta Description, Meta Keywords, OG Image
- **AND** all fields are optional (nullable)

#### Scenario: SEO fields persisted and queryable
- **WHEN** an admin fills in `meta_title = "Best Running Shoes 2026"` on a product
- **AND** saves the entity
- **THEN** the value is stored in the `meta_title` column of the products table
- **AND** the value is returned in tRPC query responses

---

### Requirement: SEO Settings in Settings Service

The Settings service SHALL include an `seo` settings schema for site-wide SEO configuration: robots.txt content and sitemap preferences. These settings are reserved for future use when a frontend rendering layer is added.

#### Scenario: SEO settings registered
- **WHEN** the system boots
- **THEN** the `seo` settings schema is registered with defaults:
  - `robotsTxt`: `"User-agent: *\nAllow: /"`
  - `sitemapEnabled`: `false` (no frontend yet)
  - `sitemapFrequency`: `"daily"`

#### Scenario: Admin edits robots.txt
- **WHEN** an admin edits the robots.txt content in platform Settings
- **AND** saves
- **THEN** the setting is persisted via Settings service
- **AND** the value is available for future frontend rendering
