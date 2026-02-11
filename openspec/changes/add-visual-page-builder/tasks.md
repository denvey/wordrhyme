## 1. Block System Core

- [ ] 1.1 Define Block primitives: Container, Text, Image, HTML, Gallery, Plugin
- [ ] 1.2 Define `BlockData` schema (id, type, parentId, index, style, isVirtual, isDeleted)
- [ ] 1.3 Define modification merge strategy (author layer + user layer, user overrides author)
- [ ] 1.4 Create DB table `page_block_modifications` for storing user modifications as JSON

## 2. Drag-and-Drop Engine

- [ ] 2.1 Integrate `@dnd-kit/core` and `@dnd-kit/sortable` for block reordering
- [ ] 2.2 Implement block drag between containers (nested re-parenting)
- [ ] 2.3 Add grid layout support for dashboard-style block arrangement
- [ ] 2.4 Implement block selection, deletion, and property editing panel

## 3. Plugin Block Extension

- [ ] 3.1 Add `blocks` array to plugin manifest schema
- [ ] 3.2 Load plugin-contributed blocks via Module Federation at editor init
- [ ] 3.3 Show plugin blocks in "Add Block" palette

## 4. Page Builder Plugin

- [ ] 4.1 Create `plugins/page-builder/` as Core plugin
- [ ] 4.2 Register Admin page for visual page editing
- [ ] 4.3 Implement live preview rendering
- [ ] 4.4 Write tests for block CRUD, drag-drop, and modification merge
