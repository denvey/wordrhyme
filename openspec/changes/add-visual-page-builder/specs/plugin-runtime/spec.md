## MODIFIED Requirements

### Requirement: Plugin Manifest Validation (Extension)

The manifest schema SHALL be extended to support `pageBuilder.blocks` declarations. These are distinct from `editor.blocks` (EditorJS tools). Plugins declaring page builder blocks MUST have a valid `admin.remoteEntry` for Module Federation loading.

```typescript
// manifest.json extension
interface PluginManifestPageBuilder {
  blocks?: PageBuilderBlockDeclaration[];
}

interface PageBuilderBlockDeclaration {
  type: string;            // unique block type name
  exportName: string;      // MF exported component name
  label: string;           // display label in "Add Block" palette
  icon?: string;           // icon identifier
  configSchema?: Record<string, unknown>; // instance configuration schema
}
```

#### Scenario: Page builder block manifest validated
- **WHEN** a plugin manifest contains `pageBuilder.blocks` declarations
- **AND** `admin.remoteEntry` is defined
- **THEN** the manifest passes validation
- **AND** block declarations are stored in plugin metadata

#### Scenario: Page builder blocks without remoteEntry rejected
- **WHEN** a plugin manifest contains `pageBuilder.blocks` but no `admin.remoteEntry`
- **THEN** manifest validation logs a warning
- **AND** the page builder blocks are ignored (non-fatal)
