## 1. Governance Alignment

- [x] 1.1 Add OpenSpec proposal/design/tasks for unified plugin marketplace governance
- [x] 1.2 Define formal terminology for `Shopify-style Platform Managed` and `WordPress-style Instance Managed`
- [x] 1.3 Define `installationScope` and `migrationStrategy` as the primary variability points

## 2. Spec Alignment

- [x] 2.1 Update `plugin-runtime` spec to describe the unified contract and dual governance modes
- [x] 2.2 Clarify that WordPress-style is an instance/site-scoped mode under the same Plugin Contract
- [x] 2.3 Clarify that SaaS default is Shopify-first, not dual-primary

## 3. Documentation Alignment

- [x] 3.1 Update compatibility and architecture docs to remove ambiguous wording about migration trigger timing
- [x] 3.2 Document current implementation status vs target architecture status
- [x] 3.3 Add marketplace governance wording to plugin contract / architecture docs if this change is accepted

## 4. Runtime Alignment Design

- [x] 4.1 Audit `plugin-manager` and `migration-service` against the target governance model
- [x] 4.2 Decide the preferred default path: instance-level schema migration + tenant-level installation/activation
- [x] 4.3 Decide `plugin_migrations` strategy: short-term semantic reinterpretation (`'default'` = instance owner), long-term structural cleanup

## 5. Implementation

- [x] 5.1 Update `PluginManager` to explicitly separate startup-time load/migration from tenant install/enable semantics
- [x] 5.2 Refactor `PluginMigrationService` API so migration ownership is modeled explicitly as instance-scope by default
- [x] 5.3 Align uninstall behavior so tenant uninstall does not implicitly drop shared plugin tables in Shopify-first mode
- [x] 5.4 Introduce strategy/config objects for `installationScope`, `migrationStrategy`, and `upgradePolicy`
- [x] 5.5 Reconcile `pluginInstances`, `plugins`, and `pluginMigrations` naming/comments/docs with the chosen default model

## 6. Verification

- [x] 6.1 Verify SaaS default path: startup-managed migration + tenant install/enable without duplicate schema execution
- [x] 6.2 Verify tenant uninstall in Shopify-first mode preserves shared schema unless an instance-managed policy explicitly allows deletion
- [x] 6.3 Verify instance-managed compatibility mode can still trigger installation-time initialization when enabled by strategy
