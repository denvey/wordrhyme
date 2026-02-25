## MODIFIED Requirements

### Requirement: Plugin Manifest Schema

The Plugin API SHALL export a TypeScript type for `manifest.json`. The schema MUST match the validation rules in `PLUGIN_CONTRACT.md`. A Zod schema SHALL be provided for runtime validation.

The `admin` section SHALL support an `extensions` field that declares all UI extensions the plugin provides. Each extension declaration MUST specify an `id`, target `slots[]`, and either a `component` export name or inline metadata. The `admin.menus[]` field SHALL be removed and replaced by `admin.extensions[]`.

```typescript
// admin.extensions[] schema
interface AdminExtensionDeclaration {
  id: string;                    // unique within plugin, e.g., 'settings'
  slots: string[];               // target slot names, e.g., ['nav.sidebar', 'settings.plugin']
  label: string;                 // display label
  icon?: string;                 // icon name from lucide-react
  order?: number;                // sort order within slot
  category?: string;             // semantic grouping hint
  component?: string;            // export name from admin entry (direct reference)
  remoteComponent?: string;      // MF2.0 remote path for lazy loading
}
```

#### Scenario: Manifest type validates structure
- **WHEN** a plugin author writes a manifest using the `PluginManifest` type
- **THEN** TypeScript validates required fields: `pluginId`, `version`, `vendor`, `type`, `runtime`, `engines.wordrhyme`
- **AND** optional fields are typed correctly: `capabilities`, `server`, `admin`, `permissions`
- **AND** `admin.extensions[]` is validated with `id`, `slots[]`, and `label` as required fields

#### Scenario: Zod schema validates at runtime
- **WHEN** a `manifest.json` file is parsed
- **THEN** the Zod schema validates the structure
- **AND** type errors are caught with descriptive messages
- **AND** the inferred TypeScript type matches the exported type

#### Scenario: Manifest with admin.extensions validates
- **WHEN** a plugin manifest contains:
  ```json
  {
    "admin": {
      "remoteEntry": "./dist/admin/remoteEntry.js",
      "extensions": [
        {
          "id": "settings",
          "slots": ["nav.sidebar", "settings.plugin"],
          "label": "S3 Storage",
          "icon": "Cloud",
          "category": "storage",
          "component": "SettingsPage"
        }
      ]
    }
  }
  ```
- **THEN** the manifest validates successfully
- **AND** the extension declaration is accessible via `manifest.admin.extensions`

#### Scenario: Extension with remoteComponent validates
- **WHEN** a plugin manifest declares an extension with `remoteComponent: "email_resend/SyncButton"` instead of `component`
- **THEN** the manifest validates successfully
- **AND** the extension is marked for MF2.0 lazy loading at runtime

---
