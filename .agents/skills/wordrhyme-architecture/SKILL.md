---
description: WordRhyme核心架构及业务限制规范（插件、权限、计费、数据）
---

# WordRhyme Architecture Constraints

**WordRhyme** is a Contract-First, Headless CMS with a plugin architecture. This is an **architecture documentation repository** (v0.1) - the actual implementation codebase is separate.

**Core Philosophy**:
- "Contract-First" - all contracts are frozen and must be followed
- "Modular Monolith" not microservices
- Plugins extend via defined boundaries, never modify Core
- Rolling reload deployment (no runtime hot-swapping)

---

## Architecture Status

**FROZEN (v0.1)** - All breaking changes require version upgrade. No implicit adjustments allowed.

The architecture is defined through governance documents that form a strict hierarchy. **Never suggest changes that violate these contracts.**

---

## Documentation Architecture (Critical)

### Navigation Hierarchy

All documents follow a strict precedence order:

**Level 0 - Constitutional Law:**
- `SYSTEM_INVARIANTS.md` - Non-negotiable system rules (highest authority)
- `CORE_DOMAIN_CONTRACT.md` - Core boundary definition

**Level 1 - Core Governance:**
- `PLUGIN_CONTRACT.md` - Plugin system boundaries
- `PERMISSION_GOVERNANCE.md` - Authorization model
- `RUNTIME_GOVERNANCE.md` - Plugin execution rules
- `EVENT_HOOK_GOVERNANCE.md` - Extension protocol

**Level 2 - Business Governance:**
- `BILLING_MONETIZATION_GOVERNANCE.md` - Monetization rules
- `CAPABILITY_BILLING_MODEL.md` - Capability-based billing
- `BILLING_ENGINE_INTERFACE.md` - Billing engine contract
- `ENTITLEMENT_SYSTEM.md` - Authorization & metering system
- `PLUGIN_MARKETPLACE_GOVERNANCE.md` - Marketplace rules

**Level 3 - Cross-Cutting Concerns:**
- `GLOBALIZATION_GOVERNANCE.md` - i18n/l10n/currency
- `DATA_MODEL_GOVERNANCE.md` - Data ownership rules
- `PLUGIN_DATA_GOVERNANCE.md` - Plugin data lifecycle
- `OBSERVABILITY_GOVERNANCE.md` - Monitoring & logging

**Reference Documents:**
- `GOVERNANCE_PLAYBOOK.md` - Operational decision making
- `REFERENCE_ARCHITECTURE.md` - Architecture overview
- `CORE_BOOTSTRAP_FLOW.md` - System startup flow

### Document Location

All architecture documents are in: `docs/architecture/`

---

## Key Architectural Decisions (Frozen)

### Tech Stack
- **Backend**: NestJS + Fastify
- **ORM**: Drizzle + PostgreSQL
- **Frontend**: React + Rspack + Module Federation 2.0
- **Process**: PM2 Cluster (zero-downtime reload)
- **Cache**: Redis (control signals only, not business data)

### Plugin Model
- Plugins loaded at **startup only** (via rolling reload)
- No runtime hot-swapping
- Plugins depend on `@wordrhyme/plugin-api` (never on Core directly)
- Core **never** reverse-depends on plugins
- `/plugins` directory must be shared storage (NFS/NAS)

### Permission Model
- Shopify-inspired capability-based model
- Centralized in Permission Kernel (not in plugins)
- Plugins declare permissions in manifest
- Authorization happens **before** execution
- Three actors: User / Plugin / System

### Multi-Tenancy
- All permissions bound to Tenant/Workspace
- No global permissions
- Cross-tenant access forbidden
- Plugin data isolated per tenant

---

## Critical Constraints

### What Plugins CANNOT Do (Hard Bans)

From `SYSTEM_INVARIANTS.md` and contracts:

- ❌ Modify Core state directly
- ❌ Access other plugins' data
- ❌ Bypass permissions
- ❌ Cache permission results
- ❌ Assume execution order
- ❌ Modify Core tables
- ❌ Create global mutable state
- ❌ Self-authorize
- ❌ Block Core execution
- ❌ Assume runtime environment (must work in Node/Edge/WASM)

### Plugin Lifecycle Rules

1. Install → Extract to `/plugins/{pluginId}`
2. Validate `plugin.json`
3. Update DB status
4. Redis broadcast `RELOAD_APP`
5. PM2 Rolling Reload all nodes
6. Scan and load plugins on startup

**变更生效时机（分级）**：
- **代码/Manifest 变更**（Install/Update/Uninstall）：仅在 PM2 Rolling Reload 后生效
- **配置/激活变更**（Settings 修改、Theme 切换、功能开关）：即时生效，无需重启
- 判断标准：是否涉及文件系统操作或内存中模块替换

---

## Permission System Rules

From `PERMISSION_GOVERNANCE.md`:

- **White-list model**: Undeclared capability = forbidden
- **Centralized**: Only Core decides allow/deny
- **Scope hierarchy**: instance → organization → space → project
- **Plugin permissions** must use namespace: `plugin:{pluginId}:{action}`
- **Capability format**: `resource:action:scope`
- Plugins are always "审查对象" (审计 subjects), never authorities

---

## Billing & Monetization Rules

From billing governance docs:

- **Capability ≠ Pricing**: Plugins declare capabilities, hosts set prices
- **Plan-based**: Plans grant capabilities with limits
- **Usage metering**: Atomic, auditable, immutable records
- **Plugin separation**: Plugins never see pricing/revenue
- **Runtime flow** (mandatory order):
  1. Resolve Context
  2. Load Entitlements
  3. Permission Check
  4. Usage Validation
  5. Consume Usage
  6. Execute Capability

---

## Data Model Rules

From `DATA_MODEL_GOVERNANCE.md` and `PLUGIN_DATA_GOVERNANCE.md`:

- Core tables: **Never modified by plugins**
- Plugin data: Use JSONB extensions OR plugin-private tables
- Plugin table naming: `plugin_{pluginId}_*`
- Data retention: Must declare in manifest (`onDisable`, `onUninstall`)
- No UPDATE/DELETE on `usage_records` (append-only)
- Multi-language: Use translations structure, not separate tables

---

## Globalization Rules

From `GLOBALIZATION_GOVERNANCE.md`:

- Language/Currency/Region: Configuration, not code branches
- Global Context: locale, currency, timezone, numberFormat, dateFormat, taxRegion
- Language standard: BCP 47 (`en-US`, `zh-CN`)
- Base Currency for settlement, Display Currency for presentation
- Plugins must not hardcode currencies or locales
- Translation structure:
  ```json
  {
    "title": {
      "en-US": "Product",
      "fr-FR": "Produit"
    }
  }
  ```

---

## Event & Hook Rules

From `EVENT_HOOK_GOVERNANCE.md`:

- **Events**: Broadcast facts (read-only, cannot block Core)
- **Hooks**: Controlled extension points
- Three hook types:
  1. **Side-Effect** (99% of plugins) - no return, no Core impact
  2. **Transform** (rare) - Core explicitly declared only
  3. **Decision** (forbidden for plugins) - Core internal only
- Default: Async execution
- Plugins cannot assume execution order
- Hook failures don't break Core
- **Core-Mediated Events** (§7.1): 插件可通过 Core 注册的公共事件通道通信，需满足：Core 注册 + schema 定义 + manifest 声明 + Side-Effect only + 可审计

---

## Runtime Governance

From `RUNTIME_GOVERNANCE.md`:

- **Actor Model**: Plugin actor ≠ User ≠ System
- **Resource limits**: CPU, Memory, Timeout, Task Count (all enforced)
- **Isolation levels**: Logic → Thread → Memory
- **Failure states**: transient_error → degraded → crashed
- **Quarantine**: Bad plugins isolated, not killed immediately
- Runtime must work across Node/Worker/Edge/WASM

---

## Working with This Repository

### Current State
- This is **documentation only** (architecture v0.1)
- No implementation code yet
- Focus on governance contracts and system design

### When Adding/Modifying Documents

1. **Check hierarchy**: Does change violate higher-level contracts?
2. **Version bumping**: Breaking changes require version upgrade
3. **Consistency**: Cross-reference related governance docs
4. **Frozen status**: Most docs marked "Frozen" - only clarifications allowed

### Document Consolidation

Recent cleanup (2024-12-22):
- Merged duplicate permission docs → `PERMISSION_GOVERNANCE.md`
- Merged runtime docs → `RUNTIME_GOVERNANCE.md`
- Merged marketplace docs → `PLUGIN_MARKETPLACE_GOVERNANCE.md`
- Merged entitlement docs → `ENTITLEMENT_SYSTEM.md`
- Removed: `PERMISSION_CONTRACT.md`, `Permission & Authorization Governance.md`, `Plugin Runtime & Execution Governance.md`, `MARKETPLACE_STRATEGY.md`, etc.

**Do not recreate deleted redundant documents.**

---

## Non-Goals (v0.x)

Explicitly NOT supported in v0.x:

- Runtime hot-swapping (no restarts)
- Plugin VM/sandbox isolation
- Plugins controlling Core startup
- Plugins modifying global middleware
- Plugin-to-plugin direct communication
- Dynamic permission graphs
- Cross-plugin permission dependencies

---

## Future Evolution (v1.x)

Planned but not yet:
- Plugin permission declaration enforcement
- Plugin marketplace
- Optional sandbox mechanisms
- Enhanced isolation

**Any architectural change requires**:
1. Major version bump
2. Contract updates
3. Ecosystem-wide communication

---

## Golden Rules for AI Assistance

1. **Contract Supremacy**: If implementation conflicts with contracts → contracts win
2. **No Speculation**: Don't invent features not in contracts
3. **Hierarchy Respect**: Lower docs cannot override higher docs
4. **Frozen Means Frozen**: Don't suggest "improvements" to frozen contracts
5. **Plugin Boundaries**: Always enforce plugin isolation rules
6. **Permission First**: Authorization before execution, always
7. **Multi-tenant Always**: No global state, everything tenant-scoped

---

## Quick Reference

**When asked about permissions**: Check `PERMISSION_GOVERNANCE.md` (architecture) or `docs/PERMISSION_SYSTEM.md` (implementation)
**When asked about plugins**: Check `PLUGIN_CONTRACT.md`
**When asked about billing**: Check `BILLING_MONETIZATION_GOVERNANCE.md` + `CAPABILITY_BILLING_MODEL.md`
**When asked about billing implementation**: Check `apps/server/src/trpc/routers/billing.ts` (API router) + `docs/guides/BILLING_ADMIN_GUIDE.md` (admin guide)
**When asked about billing services**: Key files: `subscription.service.ts`, `payment.service.ts`, `renewal.service.ts`, `quota.service.ts`, `unified-usage.service.ts`, `entitlement.service.ts` (all in `apps/server/src/billing/services/`)
**When asked about Stripe/webhooks**: Check `docs/guides/STRIPE_WEBHOOK_SETUP.md`
**When asked about runtime**: Check `RUNTIME_GOVERNANCE.md`
**When asked about data**: Check `DATA_MODEL_GOVERNANCE.md` + `PLUGIN_DATA_GOVERNANCE.md`
**When asked about CRUD / auto-crud-server**: Check `docs/auto-crud-server-best-practices.md` (must read before writing CRUD code)
**When asked about Zod schemas**: Check `docs/zod-schema-conventions.md` (must read before defining schemas)
**When asked about Drizzle queries**: Check `docs/drizzle-query-api-v2.md` (must use v2 object-based syntax for new code)
**When unsure**: Check `SYSTEM_INVARIANTS.md` first

**If contradiction found**: Higher-level doc wins (see hierarchy above)
