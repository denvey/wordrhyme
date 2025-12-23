# Project Context

## Purpose

**Nebula CMS** is a Contract-First, Plugin-Extensible Headless CMS designed for:

- **Multi-tenant SaaS** and **self-hosted open-source** deployments
- **Plugin ecosystem** with strict isolation and governance
- **Enterprise-grade** permission, billing, and data sovereignty
- **Long-term stability** through frozen architecture contracts

**Current Phase**: Architecture documentation v0.1 (implementation codebase is separate)

**Core Philosophy**:
- Contracts before implementation
- Plugins extend, never modify Core
- Stability over convenience
- Modular Monolith over microservices

---

## Tech Stack

### Backend
- **Framework**: NestJS + Fastify
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Cache**: Redis (control signals only, not business data)
- **Process Management**: PM2 Cluster (zero-downtime rolling reload)

### Frontend
- **Framework**: React
- **Build Tool**: Rspack
- **Micro-frontend**: Module Federation 2.0
- **Plugin UI**: Remote Entry pattern

### Infrastructure
- **Deployment**: Rolling Reload via PM2
- **Storage**: Shared NFS/NAS for `/plugins` directory
- **Cluster**: Redis Pub/Sub for control signals
- **Multi-tenancy**: Tenant-scoped everything

### Not Yet Decided (Implementation Phase)
- Authentication provider (considering better-auth)
- Admin UI state management
- Testing frameworks
- CI/CD tooling

---

## Project Conventions

### Architecture Governance

**CRITICAL**: This project uses a **Contract-First** approach where:
1. All architecture contracts are **frozen** (v0.1)
2. Implementation must conform to contracts, never the reverse
3. Breaking changes require major version upgrade
4. No implicit adjustments to frozen documents

**Document Hierarchy** (highest to lowest authority):
1. `SYSTEM_INVARIANTS.md` - Constitutional law
2. `CORE_DOMAIN_CONTRACT.md` - Core boundaries
3. Domain-specific governance (Plugin, Permission, Runtime, etc.)
4. Reference documents

### Code Style

**When Implementation Begins**:
- TypeScript strict mode
- ESLint + Prettier (configurations TBD)
- Functional programming preferred for business logic
- Immutable data structures where possible

**Naming Conventions** (from contracts):
- Core modules: `@nebula/core`, `@nebula/plugin-api`
- Plugin namespaces: `plugin:{pluginId}:{action}`
- Capability format: `resource:action:scope`
- Plugin tables: `plugin_{pluginId}_*`

### Architecture Patterns

**1. Modular Monolith**
- Not microservices - single deployable unit
- Bounded contexts via NestJS modules
- Clear boundaries via contracts

**2. Plugin Isolation**
- Plugins depend on `@nebula/plugin-api` only
- Core never reverse-depends on plugins
- No shared mutable state between plugins
- No direct plugin-to-plugin communication

**3. Permission Model**
- Shopify-inspired capability-based authorization
- Centralized in Permission Kernel
- Three actors: User / Plugin / System
- Authorization before execution (never after)
- Scope hierarchy: instance → organization → space → project

**4. Multi-Tenancy**
- All data tenant-scoped
- No global permissions
- Cross-tenant access forbidden
- Workspace-level isolation

**5. Plugin Lifecycle**
- Install → Validate → DB Update → Redis Broadcast → Rolling Reload
- Plugins load at startup only (no hot-swapping)
- Changes take effect on next restart

**6. Billing & Entitlement**
- Capability-based (not feature-based)
- Plan → PlanGrant → Entitlement → Usage flow
- Atomic metering, append-only records
- Plugins never see pricing/revenue

### Testing Strategy

**TBD** (implementation phase), but must test:
- Contract compliance (plugins respect boundaries)
- Multi-tenant isolation
- Permission enforcement
- Plugin lifecycle (install/enable/disable/uninstall)
- Billing flow accuracy
- Rolling reload behavior

### Git Workflow

**TBD** (implementation phase), but likely:
- Protected `main` branch
- Feature branches
- Contract changes require architectural review
- Semantic versioning (major.minor.patch)

---

## Domain Context

### CMS Domain

Nebula CMS is a **Headless CMS** focused on:
- Content modeling and storage
- Multi-language/multi-currency content
- Plugin-extensible capabilities
- Marketplace ecosystem
- SaaS and self-hosted deployment models

### Plugin Ecosystem

**Plugin Types**:
- Content type extensions
- API integrations
- Workflow automation
- UI customizations
- Billing/monetization plugins

**Plugin Boundaries** (from `PLUGIN_CONTRACT.md`):
- Plugins are isolated execution units
- Must declare permissions in manifest
- Cannot modify Core tables/state
- Cannot bypass authorization
- Cannot assume execution environment
- Cannot cache permission results

### Permission & Authorization

**Key Concepts**:
- **Capability**: Smallest authorization unit (`resource:action:scope`)
- **Entitlement**: Runtime authorization snapshot
- **Plan**: Commercial packaging of capabilities
- **Role**: Collection of capabilities (mapping, not authority)

**Critical Rules**:
- White-list model (undeclared = forbidden)
- Core is sole authority (plugins request, never decide)
- Multi-tenant scoped (no global permissions)

### Billing & Monetization

**Key Concepts**:
- **Capability**: What plugins can do
- **Plan**: How it's packaged for users
- **PlanGrant**: Capability + limit + overage policy
- **UsageRecord**: Immutable consumption log
- **BillingLedger**: Financial records

**Critical Rules**:
- Plugins declare capabilities, hosts set prices
- Usage is atomic, auditable, immutable
- Plugins don't see revenue/pricing
- Runtime flow is mandatory (6-step process)

---

## Important Constraints

### Frozen Architecture (v0.1)

**Hard Constraints**:
- Architecture is frozen - breaking changes require version bump
- All governance documents are binding
- Implementation cannot violate contracts
- Plugin boundaries are non-negotiable

### Plugin Restrictions (Hard Bans)

Plugins **CANNOT**:
- ❌ Modify Core state directly
- ❌ Access other plugins' data
- ❌ Bypass permissions or billing checks
- ❌ Cache permission results
- ❌ Modify Core database tables
- ❌ Create global mutable state
- ❌ Self-authorize or authorize other plugins
- ❌ Block Core execution flow
- ❌ Assume specific runtime (must work in Node/Edge/WASM)

### Non-Goals (v0.x)

Explicitly **NOT** supported in v0.x:
- Runtime hot-swapping (no restarts)
- Plugin VM/sandbox isolation
- Plugins controlling Core startup
- Dynamic permission graphs
- Cross-plugin permission dependencies
- Plugin-to-plugin direct communication

### Data Sovereignty

- Core owns Core tables
- Plugins own plugin data
- Multi-language via JSON structure (not separate tables)
- No cross-tenant data leaks
- Audit logs are immutable

### Globalization

- i18n via BCP 47 standards (`en-US`, `zh-CN`)
- Multi-currency: Base Currency (settlement) vs Display Currency
- Plugins cannot hardcode locales/currencies
- Context-driven (not code branches)

---

## External Dependencies

### Current (Documentation Phase)

- None (pure documentation repository)

### Planned (Implementation Phase)

**Infrastructure**:
- PostgreSQL (primary database)
- Redis (cluster coordination)
- NFS/NAS (shared plugin storage)
- PM2 (process management)

**Frontend**:
- React ecosystem
- Rspack bundler
- Module Federation 2.0

**Backend**:
- NestJS framework
- Fastify HTTP server
- Drizzle ORM

**Authentication** (TBD):
- Considering better-auth
- Must support multi-tenant context
- Must integrate with Permission Kernel

**Marketplace** (Future):
- Plugin registry service
- Payment gateway integration
- License management

---

## Key Governance Documents

When working on this project, **always check these contracts first**:

**Foundational**:
- `SYSTEM_INVARIANTS.md` - Highest authority
- `CORE_DOMAIN_CONTRACT.md` - Core boundaries

**Domain Governance**:
- `PLUGIN_CONTRACT.md` - Plugin system rules
- `PERMISSION_GOVERNANCE.md` - Authorization model
- `RUNTIME_GOVERNANCE.md` - Execution rules
- `EVENT_HOOK_GOVERNANCE.md` - Extension protocol

**Business Logic**:
- `BILLING_MONETIZATION_GOVERNANCE.md` - Monetization rules
- `CAPABILITY_BILLING_MODEL.md` - Billing model
- `ENTITLEMENT_SYSTEM.md` - Authorization + metering
- `PLUGIN_MARKETPLACE_GOVERNANCE.md` - Marketplace rules

**Cross-Cutting**:
- `GLOBALIZATION_GOVERNANCE.md` - i18n/l10n/currency
- `DATA_MODEL_GOVERNANCE.md` - Data ownership
- `OBSERVABILITY_GOVERNANCE.md` - Monitoring/logging

**Reference**:
- `GOVERNANCE_PLAYBOOK.md` - Decision making guide
- `REFERENCE_ARCHITECTURE.md` - Architecture overview
- `CLAUDE.md` - AI assistant guidance

---

## Development Workflow (Future)

**Not Yet Applicable** (documentation phase only)

When implementation begins:
1. Read relevant governance contracts
2. Ensure changes don't violate frozen rules
3. Implementation follows contracts (not the reverse)
4. Document deviations require architectural review
5. Breaking changes require version bump + contract update

---

## Notes for AI Assistants

**Golden Rules**:
1. **Contracts Win** - If implementation conflicts with contracts, contracts are correct
2. **Hierarchy Matters** - Higher-level docs override lower-level docs
3. **Frozen Means Frozen** - Don't suggest "improvements" to frozen contracts
4. **Plugin Boundaries** - Always enforce isolation rules
5. **Permission First** - Authorization before execution, always
6. **Multi-tenant Always** - No global state, everything tenant-scoped
7. **No Speculation** - Don't invent features not in contracts

**Quick Reference**:
- Permissions → `PERMISSION_GOVERNANCE.md`
- Plugins → `PLUGIN_CONTRACT.md`
- Billing → `BILLING_MONETIZATION_GOVERNANCE.md`
- Runtime → `RUNTIME_GOVERNANCE.md`
- Data → `DATA_MODEL_GOVERNANCE.md`
- Conflicts → Check `SYSTEM_INVARIANTS.md` first

---

**Last Updated**: 2025-12-22
**Architecture Version**: v0.1 (Frozen)
**Status**: Documentation Phase
