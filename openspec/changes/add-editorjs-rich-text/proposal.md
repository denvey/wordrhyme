# Change: Add EditorJS Rich Text Editor Package

## Why

WordRhyme has no content editing capability. As a Headless CMS, structured rich-text editing is a foundational requirement. Cromwell CMS demonstrates that EditorJS's block-styled JSON output is ideal for headless architectures — the structured output allows any frontend to render content freely, unlike HTML-based editors that couple content to presentation.

## What Changes

- Create `@wordrhyme/editor` package wrapping EditorJS with CMS-specific configuration
- Integrate with existing `AssetService` for image uploads within the editor
- Support plugin-contributed custom EditorJS blocks via `@wordrhyme/plugin-api`
- Provide a reusable `<RichTextEditor>` component exported from `@wordrhyme/ui`
- Store content as structured JSON (EditorJS OutputData format), not HTML
- Include standard blocks: paragraph, heading, list, quote, code, image, table, embed, delimiter

## Impact

- Affected specs: `admin-ui-host`
- New package: `packages/editor/`
- Affected code:
  - `packages/editor/` (new package)
  - `packages/ui/src/components/` (RichTextEditor export)
  - `apps/admin/src/` (content editing pages consume the component)
  - `packages/plugin/src/` (plugin block registration API)
- No breaking changes
- Leverages existing `AssetService` and `ImageProcessorService` for image handling
