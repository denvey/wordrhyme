## 1. Manifest Extension

- [ ] 1.1 Add `"type": "theme"` as valid plugin type in manifest schema
- [ ] 1.2 Define theme-specific manifest fields: `pages`, `layouts`, `navigation`, `defaultSettings`
- [ ] 1.3 Validate theme manifests during plugin scan

## 2. Theme Lifecycle

- [ ] 2.1 Add active theme setting per organization in Settings service
- [ ] 2.2 Implement theme activation/deactivation via Admin panel
- [ ] 2.3 Ensure only one theme active per organization at a time
- [ ] 2.4 Handle theme switch without server restart (config change only)

## 3. Theme Rendering Strategy

- [ ] 3.1 Design rendering architecture decision (SSR/CSR/SSG — requires design.md)
- [ ] 3.2 Implement theme component loading via Module Federation remote entry
- [ ] 3.3 Provide theme context (site settings, navigation, locale) to theme components

## 4. Admin Integration

- [ ] 4.1 Add theme management page in Admin panel (list, activate, configure)
- [ ] 4.2 Show theme preview/screenshot from manifest metadata
- [ ] 4.3 Write tests for theme lifecycle and activation
