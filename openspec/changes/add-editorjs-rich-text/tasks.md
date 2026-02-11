## 1. Package Setup

- [ ] 1.1 Create `packages/editor/` with tsup build config (ESM, TypeScript declarations)
- [ ] 1.2 Install EditorJS core (`@editorjs/editorjs`) and standard block tools
- [ ] 1.3 Configure Module Federation shared dependency for `@wordrhyme/editor`

## 2. Standard Block Tools

- [ ] 2.1 Integrate standard blocks: paragraph, heading, list, quote, code, delimiter
- [ ] 2.2 Integrate table block (`@editorjs/table`)
- [ ] 2.3 Integrate embed block (`@editorjs/embed`)
- [ ] 2.4 Create custom image block that integrates with `AssetService` (upload via tRPC, not direct POST)
- [ ] 2.5 Create custom gallery block reusing asset picker

## 3. Component Export

- [ ] 3.1 Create `<RichTextEditor>` React component with controlled value (EditorJS OutputData)
- [ ] 3.2 Export from `@wordrhyme/ui` for Admin/Plugin consumption
- [ ] 3.3 Add read-only renderer component `<RichTextRenderer>` for previewing content
- [ ] 3.4 Support `onChange`, `onReady`, `initialData` props

## 4. Plugin Block Extension

- [ ] 4.1 Define `EditorBlockDefinition` interface in `@wordrhyme/plugin-api`
- [ ] 4.2 Add `editor.blocks` array to plugin manifest schema
- [ ] 4.3 Load plugin-contributed blocks at editor initialization via MF remote import
- [ ] 4.4 Write tests for block registration and rendering

## 5. Integration

- [ ] 5.1 Write tests for editor initialization, save/load cycle, and image upload
- [ ] 5.2 Verify EditorJS output is valid JSON and round-trips correctly
