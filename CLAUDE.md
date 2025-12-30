<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

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

**Plugin changes take effect on next restart only.**

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

**When asked about permissions**: Check `PERMISSION_GOVERNANCE.md`
**When asked about plugins**: Check `PLUGIN_CONTRACT.md`
**When asked about billing**: Check `BILLING_MONETIZATION_GOVERNANCE.md` + `CAPABILITY_BILLING_MODEL.md`
**When asked about runtime**: Check `RUNTIME_GOVERNANCE.md`
**When asked about data**: Check `DATA_MODEL_GOVERNANCE.md` + `PLUGIN_DATA_GOVERNANCE.md`
**When unsure**: Check `SYSTEM_INVARIANTS.md` first

**If contradiction found**: Higher-level doc wins (see hierarchy above)

---

**Architecture Status**: Frozen v0.1
**Last Updated**: 2024-12-22
**Change Policy**: Version-controlled, breaking changes forbidden without major version bump


# shadcn/ui

> shadcn/ui is a collection of beautifully-designed, accessible components and a code distribution platform. It is built with TypeScript, Tailwind CSS, and Radix UI primitives. It supports multiple frameworks including Next.js, Vite, Remix, Astro, and more. Open Source. Open Code. AI-Ready. It also comes with a command-line tool to install and manage components and a registry system to publish and distribute code.

## Overview

- [Introduction](https://ui.shadcn.com/docs): Core principles—Open Code, Composition, Distribution, Beautiful Defaults, and AI-Ready design.
- [CLI](https://ui.shadcn.com/docs/cli): Command-line tool for installing and managing components.
- [components.json](https://ui.shadcn.com/docs/components-json): Configuration file for customizing the CLI and component installation.
- [Theming](https://ui.shadcn.com/docs/theming): Guide to customizing colors, typography, and design tokens.
- [Changelog](https://ui.shadcn.com/docs/changelog): Release notes and version history.
- [About](https://ui.shadcn.com/docs/about): Credits and project information.

## Installation

- [Next.js](https://ui.shadcn.com/docs/installation/next): Install shadcn/ui in a Next.js project.
- [Vite](https://ui.shadcn.com/docs/installation/vite): Install shadcn/ui in a Vite project.
- [Remix](https://ui.shadcn.com/docs/installation/remix): Install shadcn/ui in a Remix project.
- [Astro](https://ui.shadcn.com/docs/installation/astro): Install shadcn/ui in an Astro project.
- [Laravel](https://ui.shadcn.com/docs/installation/laravel): Install shadcn/ui in a Laravel project.
- [Gatsby](https://ui.shadcn.com/docs/installation/gatsby): Install shadcn/ui in a Gatsby project.
- [React Router](https://ui.shadcn.com/docs/installation/react-router): Install shadcn/ui in a React Router project.
- [TanStack Router](https://ui.shadcn.com/docs/installation/tanstack-router): Install shadcn/ui in a TanStack Router project.
- [TanStack Start](https://ui.shadcn.com/docs/installation/tanstack): Install shadcn/ui in a TanStack Start project.
- [Manual Installation](https://ui.shadcn.com/docs/installation/manual): Manually install shadcn/ui without the CLI.

## Components

### Form & Input

- [Form](https://ui.shadcn.com/docs/components/form): Building forms with React Hook Form and Zod validation.
- [Field](https://ui.shadcn.com/docs/components/field): Field component for form inputs with labels and error messages.
- [Button](https://ui.shadcn.com/docs/components/button): Button component with multiple variants.
- [Button Group](https://ui.shadcn.com/docs/components/button-group): Group multiple buttons together.
- [Input](https://ui.shadcn.com/docs/components/input): Text input component.
- [Input Group](https://ui.shadcn.com/docs/components/input-group): Input component with prefix and suffix addons.
- [Input OTP](https://ui.shadcn.com/docs/components/input-otp): One-time password input component.
- [Textarea](https://ui.shadcn.com/docs/components/textarea): Multi-line text input component.
- [Checkbox](https://ui.shadcn.com/docs/components/checkbox): Checkbox input component.
- [Radio Group](https://ui.shadcn.com/docs/components/radio-group): Radio button group component.
- [Select](https://ui.shadcn.com/docs/components/select): Select dropdown component.
- [Switch](https://ui.shadcn.com/docs/components/switch): Toggle switch component.
- [Slider](https://ui.shadcn.com/docs/components/slider): Slider input component.
- [Calendar](https://ui.shadcn.com/docs/components/calendar): Calendar component for date selection.
- [Date Picker](https://ui.shadcn.com/docs/components/date-picker): Date picker component combining input and calendar.
- [Combobox](https://ui.shadcn.com/docs/components/combobox): Searchable select component with autocomplete.
- [Label](https://ui.shadcn.com/docs/components/label): Form label component.

### Layout & Navigation

- [Accordion](https://ui.shadcn.com/docs/components/accordion): Collapsible accordion component.
- [Breadcrumb](https://ui.shadcn.com/docs/components/breadcrumb): Breadcrumb navigation component.
- [Navigation Menu](https://ui.shadcn.com/docs/components/navigation-menu): Accessible navigation menu with dropdowns.
- [Sidebar](https://ui.shadcn.com/docs/components/sidebar): Collapsible sidebar component for app layouts.
- [Tabs](https://ui.shadcn.com/docs/components/tabs): Tabbed interface component.
- [Separator](https://ui.shadcn.com/docs/components/separator): Visual divider between content sections.
- [Scroll Area](https://ui.shadcn.com/docs/components/scroll-area): Custom scrollable area with styled scrollbars.
- [Resizable](https://ui.shadcn.com/docs/components/resizable): Resizable panel layout component.

### Overlays & Dialogs

- [Dialog](https://ui.shadcn.com/docs/components/dialog): Modal dialog component.
- [Alert Dialog](https://ui.shadcn.com/docs/components/alert-dialog): Alert dialog for confirmation prompts.
- [Sheet](https://ui.shadcn.com/docs/components/sheet): Slide-out panel component (drawer).
- [Drawer](https://ui.shadcn.com/docs/components/drawer): Mobile-friendly drawer component using Vaul.
- [Popover](https://ui.shadcn.com/docs/components/popover): Floating popover component.
- [Tooltip](https://ui.shadcn.com/docs/components/tooltip): Tooltip component for additional context.
- [Hover Card](https://ui.shadcn.com/docs/components/hover-card): Card that appears on hover.
- [Context Menu](https://ui.shadcn.com/docs/components/context-menu): Right-click context menu.
- [Dropdown Menu](https://ui.shadcn.com/docs/components/dropdown-menu): Dropdown menu component.
- [Menubar](https://ui.shadcn.com/docs/components/menubar): Horizontal menubar component.
- [Command](https://ui.shadcn.com/docs/components/command): Command palette component (cmdk).

### Feedback & Status

- [Alert](https://ui.shadcn.com/docs/components/alert): Alert component for messages and notifications.
- [Toast](https://ui.shadcn.com/docs/components/toast): Toast notification component using Sonner.
- [Progress](https://ui.shadcn.com/docs/components/progress): Progress bar component.
- [Spinner](https://ui.shadcn.com/docs/components/spinner): Loading spinner component.
- [Skeleton](https://ui.shadcn.com/docs/components/skeleton): Skeleton loading placeholder.
- [Badge](https://ui.shadcn.com/docs/components/badge): Badge component for labels and status indicators.
- [Empty](https://ui.shadcn.com/docs/components/empty): Empty state component for no data scenarios.

### Display & Media

- [Avatar](https://ui.shadcn.com/docs/components/avatar): Avatar component for user profiles.
- [Card](https://ui.shadcn.com/docs/components/card): Card container component.
- [Table](https://ui.shadcn.com/docs/components/table): Table component for displaying data.
- [Data Table](https://ui.shadcn.com/docs/components/data-table): Advanced data table with sorting, filtering, and pagination.
- [Chart](https://ui.shadcn.com/docs/components/chart): Chart components using Recharts.
- [Carousel](https://ui.shadcn.com/docs/components/carousel): Carousel component using Embla Carousel.
- [Aspect Ratio](https://ui.shadcn.com/docs/components/aspect-ratio): Container that maintains aspect ratio.
- [Typography](https://ui.shadcn.com/docs/components/typography): Typography styles and components.
- [Item](https://ui.shadcn.com/docs/components/item): Generic item component for lists and menus.
- [Kbd](https://ui.shadcn.com/docs/components/kbd): Keyboard shortcut display component.

### Misc

- [Collapsible](https://ui.shadcn.com/docs/components/collapsible): Collapsible container component.
- [Toggle](https://ui.shadcn.com/docs/components/toggle): Toggle button component.
- [Toggle Group](https://ui.shadcn.com/docs/components/toggle-group): Group of toggle buttons.
- [Pagination](https://ui.shadcn.com/docs/components/pagination): Pagination component for lists and tables.

## Dark Mode

- [Dark Mode](https://ui.shadcn.com/docs/dark-mode): Overview of dark mode implementation.
- [Dark Mode - Next.js](https://ui.shadcn.com/docs/dark-mode/next): Dark mode setup for Next.js.
- [Dark Mode - Vite](https://ui.shadcn.com/docs/dark-mode/vite): Dark mode setup for Vite.
- [Dark Mode - Astro](https://ui.shadcn.com/docs/dark-mode/astro): Dark mode setup for Astro.
- [Dark Mode - Remix](https://ui.shadcn.com/docs/dark-mode/remix): Dark mode setup for Remix.

## Forms

- [Forms Overview](https://ui.shadcn.com/docs/forms): Guide to building forms with shadcn/ui.
- [React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form): Using shadcn/ui with React Hook Form.
- [TanStack Form](https://ui.shadcn.com/docs/forms/tanstack-form): Using shadcn/ui with TanStack Form.
- [Forms - Next.js](https://ui.shadcn.com/docs/forms/next): Building forms in Next.js with Server Actions.

## Advanced

- [Monorepo](https://ui.shadcn.com/docs/monorepo): Using shadcn/ui in a monorepo setup.
- [React 19](https://ui.shadcn.com/docs/react-19): React 19 support and migration guide.
- [Tailwind CSS v4](https://ui.shadcn.com/docs/tailwind-v4): Tailwind CSS v4 support and setup.
- [JavaScript](https://ui.shadcn.com/docs/javascript): Using shadcn/ui with JavaScript (no TypeScript).
- [Figma](https://ui.shadcn.com/docs/figma): Figma design resources.
- [v0](https://ui.shadcn.com/docs/v0): Generating UI with v0 by Vercel.

## MCP Server

- [MCP Server](https://ui.shadcn.com/docs/mcp): Model Context Protocol server for AI integrations. Allows AI assistants to browse, search, and install components from registries using natural language. Works with Claude Code, Cursor, VS Code (GitHub Copilot), Codex and more.

## Registry

- [Registry Overview](https://ui.shadcn.com/docs/registry): Creating and publishing your own component registry.
- [Getting Started](https://ui.shadcn.com/docs/registry/getting-started): Set up your own registry.
- [Examples](https://ui.shadcn.com/docs/registry/examples): Example registries.
- [FAQ](https://ui.shadcn.com/docs/registry/faq): Common questions about registries.
- [Authentication](https://ui.shadcn.com/docs/registry/authentication): Adding authentication to your registry.
- [Registry MCP](https://ui.shadcn.com/docs/registry/mcp): MCP integration for registries.

### Registry Schemas

- [Registry Schema](https://ui.shadcn.com/schema/registry.json): JSON Schema for registry index files. Defines the structure for a collection of components, hooks, pages, etc. Requires name, homepage, and items array.
- [Registry Item Schema](https://ui.shadcn.com/schema/registry-item.json): JSON Schema for individual registry items. Defines components, hooks, themes, and other distributable code with properties for dependencies, files, Tailwind config, CSS variables, and more.



