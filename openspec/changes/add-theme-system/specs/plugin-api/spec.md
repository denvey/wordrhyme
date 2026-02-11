## ADDED Requirements

### Requirement: Theme Plugin Type

The plugin manifest schema SHALL support `"type": "theme"` as a valid plugin type. Theme plugins SHALL expose frontend components via Module Federation remote entries. Only one theme SHALL be active per organization at any time.

```typescript
// manifest.json for a theme
{
  "pluginId": "com.wordrhyme.theme-blog",
  "type": "theme",
  "version": "1.0.0",
  "theme": {
    "pages": [
      { "route": "/", "component": "HomePage" },
      { "route": "/post/[slug]", "component": "PostPage" },
      { "route": "/category/[slug]", "component": "CategoryPage" }
    ],
    "layouts": [
      { "name": "default", "component": "DefaultLayout" }
    ],
    "defaultSettings": {
      "logo": "/themes/com.wordrhyme.theme-blog/logo.png",
      "primaryColor": "#3b82f6"
    }
  }
}
```

#### Scenario: Theme plugin installed and activated
- **WHEN** a theme plugin is installed
- **AND** an admin activates it for the current organization
- **THEN** the theme's remote entry is loaded as the active frontend
- **AND** the previous theme is deactivated (only one active per org)
- **AND** the theme's `defaultSettings` are merged into organization settings

#### Scenario: Theme switch without restart
- **WHEN** an admin switches from theme A to theme B via Admin panel
- **THEN** the active theme setting is updated in the database (configuration change)
- **AND** the frontend loads theme B's components on next page load via Module Federation
- **AND** no server restart or Rolling Reload is required (per PLUGIN_CONTRACT.md §4.3: config changes are instant)

---

### Requirement: Theme Component Loading via Module Federation

Theme components SHALL be loaded via Module Federation remote entries, using the same mechanism as plugin UI loading. Theme components SHALL receive a theme context containing site settings, navigation structure, and locale information.

#### Scenario: Theme page component loads
- **WHEN** a visitor accesses route `/post/hello-world`
- **AND** the active theme declares `{ route: "/post/[slug]", component: "PostPage" }`
- **THEN** the `PostPage` component is loaded from the theme's remote entry
- **AND** the component receives `{ slug: "hello-world", siteSettings, navigation, locale }` as context

#### Scenario: Theme remote entry unavailable
- **WHEN** the active theme's remote entry fails to load
- **THEN** a fallback error page is displayed
- **AND** the Admin panel remains functional (independent of theme)
