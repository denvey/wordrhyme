# Architecture Decision 001: Billing & Membership - Core vs Plugin

## Context

The question was raised whether **Billing Functions** and **Membership Levels** should be implemented as:
1.  **Integrated Core Systems**: Tightly coupled with the platform infrastructure.
2.  **Plugins**: Loosely coupled extensions (like a "Stripe Plugin").

This document summarizes the architectural decision based on the frozen governance documents (`BILLING_ENGINE_INTERFACE.md` and `ENTITLEMENT_SYSTEM.md`).

## Decision

**Both Billing and Membership systems are INTEGRATED CORE SYSTEMS.**

They are **NOT** plugins. Plugins are strictly "Consumers" of these systems.

### 1. Membership (Entitlements & Plans) → Integrated Core

**Design Authority**: `ENTITLEMENT_SYSTEM.md`

*   **Rationale**: The concept of "What a user can do" (Entitlement) is the fundamental security implementation of the platform. It determines the Runtime Flow (`permission.require` -> `entitlement` -> `usage`).
*   **Why not Plugin?**:
    *   If Membership were a plugin, the Core Permission System would depend on a plugin to make security decisions. This violates the "Core cannot depend on Plugins" dependency rule.
    *   Performance: Permission checks happen on every request. Relying on a plugin would introduce unacceptable latency and reliability risks.
*   **Mechanism**:
    *   **Plans**: Stored in Core DB (`plans` table).
    *   **Grants**: Stored in Core DB (`plan_grants` table).
    *   **Runtime**: Core resolves entitlements before *any* plugin code executes.

### 2. Billing Function (Engine) → Integrated Core

**Design Authority**: `BILLING_ENGINE_INTERFACE.md`

*   **Rationale**: The Billing Engine is responsible for the "Commercial Truth" of the platform (Ledger, Usage Tracking, Invoicing). It requires:
    *   **Audit-grade reliability**: Usage records must never be lost.
    *   **Trusted Execution**: Users cannot be trusted to self-report usage via a plugin they might modify.
    *   **Global View**: Billing often involves cross-plugin aggregation (e.g., "Total API calls across all plugins").
*   **Role of Plugins**:
    *   Plugins **CANNOT** define prices.
    *   Plugins **CANNOT** create subscriptions.
    *   Plugins **CANNOT** trigger payments directly.
    *   Plugins **ONLY** atomic capability consumption: `usage.consume("ai.tokens", 100)`.
*   **Role of Payment Gateways**:
    *   Stripe/PayPal are **Adapters** controlled by the Core Billing Engine, not independent plugins.

## Implementation Implications

1.  **Core Responsibility**:
    *   Implement the `BillingEngine` to aggregate `UsageRecords` into the `BillingLedger`.
    *   Implement the `EntitlementSystem` to resolve Plans into Runtime Permissions.
    *   Provide the Admin UI for defining Plans and Prices.

2.  **Plugin Responsibility**:
    *   Declare `capabilities` in their manifest.
    *   Call `ctx.usage.consume()` in their runtime code.
    *   Handle `QUOTA_EXCEEDED` errors gracefully.

## Summary Diagram

```mermaid
graph TD
    subgraph Core
        P[Permission System] --> E[Entitlement System]
        E --> U[Usage Tracker]
        U --> B[Billing Engine]
        B --> L[Billing Ledger]
    end

    subgraph "External Adapters"
        B --> G[Payment Gateway\n(Stripe/PayPal)]
    end

    subgraph Plugins
        Pg[Plugin Logic]
    end

    Pg -.->|"1. require(cap)"| P
    Pg -.->|"2. consume(cap)"| U
    B -.->|"3. Policy Update\n(Downgrade/Freeze)"| E
```
