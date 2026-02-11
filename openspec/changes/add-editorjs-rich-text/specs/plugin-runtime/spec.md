## MODIFIED Requirements

### Requirement: Plugin Manifest Validation (Extension)

The manifest schema SHALL be extended to support `editor.blocks` declarations. Plugins declaring editor blocks MUST have a valid `admin.remoteEntry` for Module Federation loading.

```typescript
// manifest.json extension
interface PluginManifestEditor {
  blocks?: EditorBlockDeclaration[];
}

interface EditorBlockDeclaration {
  name: string;            // unique block type name
  exportName: string;      // MF exported component name
  label: string;           // display label in block insertion menu
  icon?: string;           // icon identifier
}
```

#### Scenario: Editor block manifest validated
- **WHEN** a plugin manifest contains `editor.blocks` declarations
- **AND** `admin.remoteEntry` is defined
- **THEN** the manifest passes validation
- **AND** block declarations are stored in plugin metadata

#### Scenario: Editor blocks without remoteEntry rejected
- **WHEN** a plugin manifest contains `editor.blocks` but no `admin.remoteEntry`
- **THEN** manifest validation logs a warning
- **AND** the editor blocks are ignored (non-fatal)
- **AND** the plugin still loads normally
