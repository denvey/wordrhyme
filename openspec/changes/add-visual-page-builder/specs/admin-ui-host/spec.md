## ADDED Requirements

### Requirement: Block System Primitives

The page builder plugin SHALL define a Block System with standard primitives. Each block MUST have a unique `id` for tracking modifications. Blocks SHALL support three operations: draggable (reorder/re-parent), modifiable (edit properties/styles), removable (mark as deleted without physical removal).

Block types:
- `container` — div wrapper, supports nested children
- `text` — editable text content
- `image` — single image with alt text
- `html` — raw HTML editing (sanitized on save, see XSS scenario below)
- `gallery` — multiple images
- `plugin` — renders a plugin-contributed block component

```typescript
interface BlockData {
  id: string;           // unique per page
  type: BlockType;
  parentId?: string;    // parent container ID
  index: number;        // order within parent
  style?: CSSProperties;
  isVirtual?: boolean;  // created in editor, not in source
  isDeleted?: boolean;  // hidden but not physically removed
  plugin?: { pluginName: string; instanceSettings?: unknown };
  content?: unknown;    // type-specific content
}
```

#### Scenario: Block drag-and-drop reorder
- **WHEN** a user drags a text block from position 2 to position 0 within a container
- **THEN** the block's `index` is updated to 0
- **AND** other blocks' indices are adjusted
- **AND** the modification is stored as a user-layer change

#### Scenario: Block deletion preserves source structure
- **WHEN** a user deletes a block that exists in the source code (not virtual)
- **THEN** the block's `isDeleted` is set to `true`
- **AND** the block renders nothing
- **AND** the block can be restored by setting `isDeleted` to `false`

---

### Requirement: Dual-Layer Modification Merge

Page block modifications SHALL support two layers: author modifications (from theme/source code) and user modifications (from editor). User modifications SHALL override author modifications on a per-block basis.

#### Scenario: User modification overrides author
- **GIVEN** the author defined block "hero_text" with style `{ color: "blue" }`
- **WHEN** a user changes the style to `{ color: "red" }` in the editor
- **THEN** the rendered block uses `{ color: "red" }`
- **AND** the user modification is stored in the database
- **AND** the author modification remains in the source/config

#### Scenario: Author updates merge with user modifications
- **GIVEN** a user has modified block "hero_text" style
- **WHEN** the author releases an update changing block "hero_text" content
- **THEN** the user's style override is preserved
- **AND** the author's content update is applied
- **AND** per-property merge resolves conflicts (user wins on conflicting properties)

---

### Requirement: HTML Block XSS Sanitization

The `html` block type SHALL sanitize user-provided HTML content on the server side before persisting to the database. This prevents stored XSS attacks.

#### Scenario: Malicious script stripped on save
- **WHEN** a user saves an `html` block containing `<script>alert('xss')</script>`
- **THEN** the server strips the `<script>` tag before persisting
- **AND** the saved content does not contain any executable script elements
- **AND** allowed tags are limited to a safe subset (e.g., `div`, `span`, `p`, `a`, `img`, `table`, `ul`, `ol`, `li`, `h1`–`h6`, `strong`, `em`, `br`, `hr`)

#### Scenario: Event handlers stripped on save
- **WHEN** a user saves an `html` block containing `<img onerror="alert('xss')" src="x">`
- **THEN** the server strips `onerror` and all `on*` event handler attributes
- **AND** only safe attributes (`class`, `id`, `style`, `src`, `href`, `alt`, `title`) are preserved

#### Scenario: Sanitization applied on render fallback
- **WHEN** rendering `html` block content on the frontend
- **THEN** the content MUST be rendered via a sanitization library (e.g., DOMPurify) as a defense-in-depth measure
- **AND** raw `dangerouslySetInnerHTML` without sanitization is forbidden
