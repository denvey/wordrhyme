## ADDED Requirements

### Requirement: Plugin Widget Slot Declaration

Plugins SHALL declare Admin UI widgets in `manifest.json` under `admin.widgets`. Each widget declaration MUST specify a `slot` name and a `component` export name. The system SHALL collect all widget declarations at startup and expose them via tRPC API for the Admin host to render.

Supported slot names for v0.1:
- `dashboard` — draggable widget on Dashboard page
- `entity.actions.{entityType}` — action buttons on entity edit pages
- `settings.tab` — additional tabs on Settings page
- `entity.sidebar.{entityType}` — sidebar panel on entity edit pages

```typescript
// manifest.json extension
interface PluginManifestAdmin {
  remoteEntry?: string;
  menus?: AdminMenu[];
  widgets?: WidgetDeclaration[];
}

interface WidgetDeclaration {
  slot: string;
  component: string;       // exported component name from remote entry
  options?: {
    w?: number; h?: number; // grid size for dashboard widgets
    label?: string;         // display label
    order?: number;         // sort order within slot
  };
}
```

#### Scenario: Plugin declares dashboard widget
- **WHEN** a plugin manifest contains:
  ```json
  {
    "admin": {
      "widgets": [{
        "slot": "dashboard",
        "component": "SalesChart",
        "options": { "w": 4, "h": 2, "label": "Sales Overview" }
      }]
    }
  }
  ```
- **THEN** the widget declaration is stored in plugin metadata
- **AND** the Admin host renders `SalesChart` component on the Dashboard page
- **AND** the widget is draggable within the dashboard grid

#### Scenario: Plugin declares entity action widget
- **WHEN** a plugin manifest contains `widgets: [{ "slot": "entity.actions.product", "component": "SeoScore" }]`
- **THEN** the `SeoScore` component is rendered near the Save button on the Product edit page

#### Scenario: Invalid slot name rejected
- **WHEN** a plugin declares `widgets: [{ "slot": "nonexistent.slot", "component": "Foo" }]`
- **THEN** manifest validation logs a warning
- **AND** the widget is ignored (not rendered)
- **AND** the plugin still loads normally (non-fatal)

---

### Requirement: Plugin Hook Convenience API

PluginContext SHALL provide convenience methods for hook registration and Core-mediated event emission. These methods SHALL be thin wrappers over the existing Hook system defined in EVENT_HOOK_GOVERNANCE.md. All hooks registered via this API SHALL be Side-Effect type only (no Transform or Decision hooks).

Plugins MAY only subscribe to and emit events that are **registered by Core** with a defined payload schema. Plugins MUST declare `events.subscribe` and/or `events.emit` in their manifest's `capabilities` section. Arbitrary plugin-defined events are NOT supported — all events flow through Core's event registry.

```typescript
interface PluginHooksCapability {
  /**
   * Subscribe to a Core-registered event.
   * Events: 'entity:post:afterUpdate', 'entity:product:afterCreate', etc.
   * Plugin must declare event in manifest capabilities.events.subscribe.
   */
  on(eventName: string, handler: (payload: unknown) => void | Promise<void>): Disposable;

  /**
   * Emit a Core-registered event. Auto-namespaced to plugin:{pluginId}:{eventName}.
   * Event must be pre-registered by Core with a payload schema.
   * Plugin must declare event in manifest capabilities.events.emit.
   */
  emit(eventName: string, payload: unknown): Promise<void>;
}

interface Disposable {
  dispose(): void;
}
```

#### Scenario: Plugin subscribes to Core entity event
- **GIVEN** plugin `com.vendor.seo` declares `capabilities.events.subscribe: ["entity:post:afterUpdate"]` in manifest
- **AND** calls `ctx.hooks.on('entity:post:afterUpdate', handler)`
- **WHEN** a post is updated
- **THEN** the handler is invoked with the post update payload
- **AND** the handler runs asynchronously (does not block Core)

#### Scenario: Plugin emits Core-registered event
- **GIVEN** Core has registered event `plugin:com.vendor.seo:analysisComplete` with a payload schema
- **AND** plugin `com.vendor.seo` declares `capabilities.events.emit: ["analysisComplete"]` in manifest
- **WHEN** the plugin calls `ctx.hooks.emit('analysisComplete', { score: 95 })`
- **THEN** the actual event name is `plugin:com.vendor.seo:analysisComplete`
- **AND** any plugin that has declared subscription to that event receives the payload
- **AND** the plugin does NOT assume any subscriber exists

#### Scenario: Undeclared event subscription rejected
- **GIVEN** plugin `com.vendor.seo` does NOT declare `entity:order:afterCreate` in manifest
- **WHEN** the plugin calls `ctx.hooks.on('entity:order:afterCreate', handler)`
- **THEN** the call throws `UndeclaredEventError`
- **AND** the handler is NOT registered

#### Scenario: Plugin hook errors do not crash Core
- **GIVEN** plugin `com.vendor.seo` registers a handler that throws an error
- **WHEN** the event fires and the handler throws
- **THEN** the error is caught and logged
- **AND** other handlers for the same event continue to execute
- **AND** Core execution is not blocked

#### Scenario: Hooks cleaned up on plugin disable
- **GIVEN** plugin `com.vendor.seo` has registered 3 event handlers
- **WHEN** the plugin is disabled
- **THEN** all 3 handlers are automatically unregistered via Disposable
- **AND** no orphaned handlers remain

---

### Requirement: Plugin Settings Layout Component

The `@wordrhyme/plugin-api` package SHALL export a `PluginSettingsLayout` React component that provides a consistent settings page framework for plugins. The component SHALL implement deferred-save semantics (changes held in memory until explicit save action).

```typescript
interface PluginSettingsLayoutProps<T> {
  pluginName: string;
  children: (api: {
    settings: T;
    changeSetting: <K extends keyof T>(key: K, value: T[K]) => void;
    isDirty: boolean;
  }) => React.ReactNode;
  onSave?: (settings: T) => void | Promise<void>;
  onLoad?: () => T | Promise<T>;
}
```

#### Scenario: Plugin uses PluginSettingsLayout for consistent UI
- **WHEN** a plugin renders `<PluginSettingsLayout pluginName="my-plugin">{({ settings, changeSetting }) => ...}</PluginSettingsLayout>`
- **THEN** the component loads current settings from `ctx.settings.get('plugin_global', 'my-plugin:config')`
- **AND** renders a Save button that persists changes on click
- **AND** the UI style matches the Admin panel's design system

#### Scenario: Deferred save prevents accidental data loss
- **WHEN** a user modifies settings but has not clicked Save
- **AND** the user navigates away
- **THEN** a confirmation dialog warns about unsaved changes
- **AND** the user can choose to stay or discard

#### Scenario: Settings load failure shows error state
- **WHEN** settings cannot be loaded (network error, permission denied)
- **THEN** the component renders an error message
- **AND** the Save button is disabled
