## MODIFIED Requirements

### Requirement: Extension Point Registry

The host SHALL provide a **Slot-based Extension Registry**. Plugins register `UIExtension` objects that declare one or more target `slots`. The Registry SHALL support querying by exact slot name (`getBySlot`) and wildcard pattern (`getBySlotPattern`). Slot names SHALL follow the `{surface}.{page}.{area}` hierarchical convention.

The host SHALL provide a `<PluginSlot>` React component that queries the Registry by slot name and renders all matching extensions. `<PluginSlot>` SHALL support four layout modes: `inline`, `stack`, `tabs`, `grid`. When no extensions match a slot, `<PluginSlot>` SHALL render nothing (no empty container in the DOM).

The old `ExtensionPoint` enum and discriminated union types (`SidebarExtension`, `SettingsTabExtension`, etc.) SHALL be removed and replaced entirely by the `UIExtension` interface.

#### UIExtension Interface

```typescript
interface UIExtension {
  id: string;                          // unique, e.g., 'email-resend.settings'
  pluginId: string;                    // reverse-domain plugin ID
  slots: string[];                     // target slot names, e.g., ['nav.sidebar', 'settings.plugin']
  label: string;                       // display label
  icon?: string;                       // icon name (from lucide-react)
  order?: number;                      // sort order within slot (lower = first)
  category?: string;                   // semantic grouping (e.g., 'storage', 'notification')
  component?: React.ComponentType;     // direct reference (already loaded)
  remoteComponent?: string;            // MF2.0 lazy load path, e.g., 'email_resend/SyncButton'
}
```

#### PluginSlot Props

```typescript
interface PluginSlotProps {
  name: string;                        // slot name, e.g., 'settings.plugin'
  context?: Record<string, unknown>;   // contextual data passed to extensions
  layout?: 'inline' | 'stack' | 'tabs' | 'grid';  // rendering strategy
}
```

#### Core Slot Names (v0.x)

| Slot Name | Surface | Description |
|-----------|---------|-------------|
| `nav.sidebar` | Navigation | Plugin items in main sidebar |
| `settings.plugin` | Settings | Plugin settings tabs/pages |
| `settings.storage` | Settings | Storage configuration tabs |
| `dashboard.widgets` | Dashboard | Dashboard widget area |
| `article.editor.actions` | Article | Actions near article editor toolbar |
| `article.editor.sidebar` | Article | Sidebar panels in article editor |
| `article.list.toolbar` | Article | Toolbar actions on article list page |
| `entity.{type}.detail.sidebar` | Entity | Entity detail sidebar (parameterized) |
| `entity.{type}.detail.actions` | Entity | Entity detail actions (parameterized) |

#### Scenario: Plugin registers sidebar item via slot
- **WHEN** a plugin registers `UIExtension { slots: ['nav.sidebar'], component: SidebarComponent }`
- **THEN** the extension is stored in the Registry under slot `nav.sidebar`
- **AND** `<PluginSlot name="nav.sidebar" />` renders the SidebarComponent
- **AND** clicking the sidebar item navigates to the plugin's page

#### Scenario: Plugin registers to multiple slots with single extension
- **WHEN** a plugin registers `UIExtension { slots: ['nav.sidebar', 'settings.plugin'], component: SettingsPage }`
- **THEN** the same extension appears in both `getBySlot('nav.sidebar')` and `getBySlot('settings.plugin')` results
- **AND** the plugin only registered once (no duplicate `UIExtension` objects)

#### Scenario: Plugin registers settings page via slot
- **WHEN** a plugin registers `UIExtension { slots: ['settings.plugin'], component: SettingsComponent }`
- **THEN** `<PluginSlot name="settings.plugin" layout="tabs" />` renders the SettingsComponent as a tab
- **AND** the tab label uses the extension's `label` field

#### Scenario: PluginSlot renders nothing when no extensions
- **WHEN** no plugins have registered extensions for slot `dashboard.widgets`
- **THEN** `<PluginSlot name="dashboard.widgets" />` renders `null`
- **AND** no empty container element appears in the DOM

#### Scenario: PluginSlot passes context to extensions
- **WHEN** `<PluginSlot name="article.editor.actions" context={{ articleId: "123" }} />` is rendered
- **AND** a plugin has an extension targeting `article.editor.actions`
- **THEN** the extension component receives `{ articleId: "123" }` as a prop

#### Scenario: PluginSlot lazy-loads remote component
- **WHEN** an extension declares `remoteComponent: 'email_resend/SyncButton'` (no `component`)
- **AND** `<PluginSlot>` encounters this extension
- **THEN** the component is loaded via MF2.0 `loadRemote('email_resend/SyncButton')`
- **AND** a loading indicator is shown during load (Suspense fallback)
- **AND** if load fails, an error boundary shows a fallback UI without affecting other extensions

#### Scenario: Wildcard slot pattern query
- **WHEN** `getBySlotPattern('settings.*')` is called
- **THEN** all extensions targeting any slot starting with `settings.` are returned
- **AND** this includes `settings.plugin`, `settings.storage`, etc.

#### Scenario: Extension load error isolated
- **WHEN** a plugin's extension component fails to load (Module Federation error or runtime error)
- **THEN** the error boundary within `<PluginSlot>` catches the error
- **AND** a fallback "Extension unavailable" message is shown for that extension only
- **AND** other extensions in the same slot continue to render normally

---
