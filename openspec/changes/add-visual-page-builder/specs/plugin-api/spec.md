## ADDED Requirements

### Requirement: Plugin-Contributed Page Builder Blocks

Plugins SHALL be able to contribute custom block types to the page builder via the `pageBuilder.blocks` array in `manifest.json`. Custom blocks SHALL be loaded via Module Federation and rendered within the page builder editor.

```json
{
  "pageBuilder": {
    "blocks": [
      {
        "type": "product-showcase",
        "exportName": "ProductShowcase",
        "label": "Product Showcase",
        "icon": "Grid",
        "configSchema": { "columns": { "type": "number", "default": 3 } }
      }
    ]
  }
}
```

#### Scenario: Plugin block available in editor palette
- **WHEN** a plugin with `pageBuilder.blocks` declarations is enabled
- **THEN** the custom block types appear in the page builder's "Add Block" palette
- **AND** selecting one inserts a block of that type into the page

#### Scenario: Plugin block receives instance settings
- **WHEN** a user configures a plugin block in the editor (e.g., sets columns to 4)
- **THEN** the configuration is stored in `BlockData.plugin.instanceSettings`
- **AND** the plugin component receives `instanceSettings` as a prop
