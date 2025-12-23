# SYSTEM_INVARIANTS.md

## Purpose

This document defines the **non-negotiable system invariants** of the platform.

System Invariants are **constitutional rules** that MUST hold true regardless of:
- deployment mode (open-source / SaaS / self-hosted)
- runtime (Node.js / Edge / WASM / future runtimes)
- business model changes
- plugin ecosystem growth
- implementation refactors

Any component that violates these invariants is considered **invalid by definition**.

---

## 1. Core Authority Invariant

### 1.1 Core is the final authority

- The Core System is the **only source of truth** for:
  - identity
  - permission evaluation
  - domain ownership
  - billing state
  - execution boundaries

Plugins:
- MUST NOT replace Core decisions
- MUST NOT bypass Core checks
- MUST NOT mutate Core state directly

---

### 1.2 Core APIs are mandatory boundaries

- All plugin–core interactions MUST go through:
  - defined contracts
  - versioned APIs
  - validated schemas

Direct access to Core internals is **forbidden**.

---

## 2. Isolation Invariant

### 2.1 Plugins are isolated by default

Each plugin MUST be isolated in terms of:
- execution context
- memory
- data access
- permissions
- lifecycle

No plugin may:
- access another plugin’s memory or state
- infer another plugin’s internal behavior
- communicate with another plugin unless explicitly mediated by Core

---

### 2.2 No shared mutable global state

- Global mutable state shared across plugins is forbidden
- All shared capabilities MUST be provided by Core-managed services

---

## 3. Explicit Permission Invariant

### 3.1 Deny-by-default

- All permissions are **denied by default**
- Plugins only gain capabilities via **explicit grants**

Implicit permission, transitive permission, or inferred permission is forbidden.

---

### 3.2 Permission evaluation is centralized

- Permission checks MUST be evaluated by the Permission Service
- Plugins MUST NOT self-evaluate authorization logic

A plugin may request, but never decide.

---

## 4. Contract-First Invariant

### 4.1 Contracts define reality

- All cross-boundary interactions MUST be defined by contracts:
  - Plugin Contract
  - Event / Hook Governance
  - Core Domain Contract
  - Permission Contract
  - Billing / Marketplace Contract

Implementation MUST conform to contracts — not the other way around.

---

### 4.2 Backward compatibility is mandatory

- Breaking contract changes require:
  - explicit versioning
  - migration strategy
  - deprecation window

Silent breaking changes are forbidden.

---

## 5. Event & Hook Determinism Invariant

### 5.1 Hooks do not control outcomes

- Hooks may observe or suggest
- Hooks MUST NOT:
  - block Core execution
  - override Core decisions
  - cause non-deterministic results

Core logic must remain deterministic **with or without plugins**.

---

### 5.2 Event order is owned by Core

- Execution order is determined by Core governance
- Plugins may not assume:
  - execution order
  - exclusivity
  - uniqueness

---

## 6. Data Ownership Invariant

### 6.1 Core owns domain data

- Core domain data is owned and governed by Core
- Plugins may only access data through:
  - scoped APIs
  - explicit permissions
  - declared contracts

---

### 6.2 Plugin data is isolated

- Each plugin owns its private data namespace
- Cross-plugin data access is forbidden unless mediated by Core

---

## 7. Runtime Neutrality Invariant

### 7.1 No runtime assumptions

- Plugins MUST NOT assume:
  - filesystem access
  - process-level access
  - long-lived memory
  - specific execution environment

All plugins must be compatible with:
- server
- edge
- sandboxed runtimes

---

### 7.2 Execution limits are enforced

- Time
- Memory
- CPU
- IO

Limits are enforced by the Runtime and are non-negotiable.

---

## 8. Billing & Marketplace Integrity Invariant

### 8.1 Billing state is authoritative

- Billing, entitlement, and license state are owned by Core
- Plugins MUST NOT:
  - fake entitlements
  - bypass payment checks
  - self-authorize premium features

---

### 8.2 Marketplace trust is mandatory

- Installed plugins MUST be verifiable
- Plugin integrity MUST be enforceable
- Tampered or unverifiable plugins are invalid

---

## 9. Open-Source & SaaS Parity Invariant

### 9.1 Same contracts, different deployment

- Open-source and SaaS deployments MUST:
  - share the same contracts
  - share the same invariants
  - differ only in enforcement strictness

---

### 9.2 No SaaS-only hidden power

- SaaS may add services
- SaaS MUST NOT add undocumented authority

All authority MUST be expressible in contracts.

---

## 10. Invariant Supremacy Rule

If any document, implementation, plugin, or feature conflicts with this file:

> **SYSTEM_INVARIANTS.md wins by definition.**

Violations require:
- explicit governance change
- versioned invariant update
- ecosystem-wide communication

Silent violation is forbidden.
