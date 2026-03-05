## ADDED Requirements

### Requirement: Capability Identity Model
A **Capability** is an abstract billable capability identifier (**subject**), NOT a route or procedure. It represents "what can be billed" independent of how it is accessed.

NOTE on terminology: this spec uses `subject` as the canonical term, aligning with the unified three-system governance model (Infra Policy + RBAC + Billing) in `refactor-infra-policy-path-driven`. RBAC and Billing share the `subject` concept: for RBAC it is a permission group; for Billing it is a quota bucket. They can be configured together via `meta.subject` or independently via `meta.permission.subject` / `meta.billing.subject`.

Capability and route/procedure have a **many-to-many** relationship:
- Multiple routes MAY consume the same capability (e.g., `uploadFile`, `uploadAvatar`, `importMedia` all consume `core.storage`)
- One route MAY consume multiple capabilities (rare but supported)
- A route MAY consume zero capabilities (free procedure, no billing)

Capabilities SHALL be registered from two sources:
1. **Plugin capabilities**: Declared in plugin manifest `capabilities[]`, auto-registered by Core on plugin load
2. **Core capabilities**: Registered via seed/config (e.g., `core.teamMembers`, `core.storage`, `core.projects`)

The capability registry SHALL be a **persistent database table** (`capabilities`), NOT a memory-only registry. This is required for:
- FK constraint: `plan_items.subject` MUST reference a valid capability record (only `approved` status)
- Namespace enforcement: registration-time validation prevents subject collisions
- Admin UI data source: PlanItem capability selector queries this table
- Status governance: platform admin controls which capabilities are billable

NOTE on DB field alignment: The existing schema column `plan_items.featureKey` SHALL be renamed to `plan_items.subject` as part of this migration.

**Capability status field**: Each capability record SHALL have a `status` field with values:
- `pending` — auto-registered by plugin, awaiting platform admin approval
- `approved` — approved by platform admin, available for PlanItem configuration
- `rejected` — explicitly rejected by platform admin, cannot be used in PlanItems

Core capabilities SHALL be seeded with `status = 'approved'` (bypass approval workflow).
Plugin capabilities SHALL be auto-registered with `status = 'pending'` on plugin load.
PlanItem `subject` FK constraint SHALL only reference capabilities with `status = 'approved'`.

**subject namespace rules** (enforced at registration time):
- `core.*` — reserved for Core capabilities, rejected if source is plugin
- `{pluginId}.*` — plugin capabilities MUST use their pluginId as prefix
- Duplicate subject registration SHALL be rejected with an error

The mapping from route/procedure to subject is configured through a **four-layer resolution model** (see Three-Layer Capability Control):
- **L1 Platform Registry**: `capabilities` table with status governance (legitimacy constraint, not priority)
- **L2 Module Default**: Settings `billing.module.{module}.subject` (admin configures module-level default)
- **L3 Developer Declaration**: manifest `capabilities.billing.procedures` mapping (automatic middleware)
- **L4 Admin Override**: Settings `billing.override.{path}` (highest priority, runtime remapping)
- **Core services**: via explicit `entitlementService.requireAndConsume(orgId, subject, amount)` calls

NOTE: The original L1/L2/L3 labels are replaced here with a four-layer model aligning with the unified governance priority chain from `refactor-infra-policy-path-driven`: `L4 Admin Override > L3 Developer Declaration > L2 Module Default > Default Policy`. L1 (`capabilities` table) is a legitimacy constraint layer, not part of the priority resolution.

#### Scenario: Plugin registers capabilities on load
- **WHEN** a plugin with declared capabilities is loaded by PluginManager
- **THEN** each capability SHALL be recorded in the capability registry with `status = 'pending'`
- **AND** the capability is NOT available for PlanItem configuration until admin approves it

#### Scenario: Platform admin approves capability
- **WHEN** platform admin reviews a pending capability and sets `status = 'approved'`
- **THEN** the capability becomes available for PlanItem configuration in Admin UI
- **AND** existing manifest billing.procedures mappings referencing this subject become enforceable

#### Scenario: Core registers built-in capabilities
- **WHEN** the system starts
- **THEN** Core capabilities (e.g., `core.teamMembers`, `core.storage`) SHALL be seeded with `status = 'approved'`
- **AND** they bypass the approval workflow (trusted source)

#### Scenario: Multiple routes consume same capability
- **WHEN** three different routes (`uploadFile`, `uploadAvatar`, `importMedia`) all map to `core.storage`
- **THEN** each invocation SHALL consume from the same `core.storage` quota bucket
- **AND** the total consumption is the sum across all routes

### Requirement: Plan Capability Configuration
The system SHALL allow administrators to configure capability grants per plan, including usage limits, overage policies, and reset strategies.

Each PlanItem MUST define:
- `subject`: The capability identifier from the capability registry (e.g., `pluginC.request`, `core.storage`)
- `type`: `boolean` or `metered`
- `amount`: Usage limit per billing cycle (NULL = unlimited for boolean, required for metered)
- `overagePolicy`: One of `deny`, `charge`, `throttle`, `downgrade` (default: `deny`)
- `overagePriceCents`: Per-unit overage price in cents (required when overagePolicy=`charge`, NULL otherwise)
- `resetStrategy`: One of `hard`, `soft`, `capped`
- `quotaScope`: One of `tenant`, `user`

NOTE on field naming alignment with existing schema (`packages/db/src/schema/billing.ts`):
- Spec `subject` maps to schema `planItems.featureKey` (to be renamed to `planItems.subject` in migration)
- Spec `amount` maps to schema `planItems.amount` (NOT `limit`)
- Spec `overagePolicy` is a NEW field to add to schema (enum text, default 'deny')
- Schema `planItems.overagePriceCents` already exists and serves as the pricing for `charge` policy
- Schema `planItems.resetStrategy`, `resetCap`, `quotaScope` already exist — no migration needed for these

#### Scenario: Create plan with metered capability
- **WHEN** administrator creates a Plan with PlanItem `pluginC.request` amount=100, overagePolicy=deny, resetStrategy=hard
- **THEN** the system persists the PlanItem configuration
- **AND** any tenant subscribing to this plan receives 100 units of `pluginC.request` per billing cycle

#### Scenario: Modify plan capability limit
- **WHEN** administrator updates PlanItem amount from 100 to 200
- **THEN** existing active subscriptions SHALL reflect the new limit at next reset cycle
- **AND** current cycle entitlements remain unchanged until reset

#### Scenario: Prevent plan deletion with active subscriptions
- **WHEN** administrator attempts to delete a Plan with active subscriptions
- **THEN** the system SHALL reject the deletion with an appropriate error
- **AND** suggest deactivating the plan instead

### Requirement: Subscription Lifecycle Management
The system SHALL manage the complete subscription lifecycle with the following states: `trialing`, `active`, `past_due`, `canceled`, `expired`.

All subscription mutations (create, cancel, changePlan) SHALL enforce tenant ownership: the requesting user's organizationId MUST match the subscription's organizationId. Cross-tenant access is forbidden per ENTITLEMENT_SYSTEM.md (P0 Bug).

#### Scenario: Create and activate subscription
- **WHEN** a tenant subscribes to a plan and payment succeeds
- **THEN** the subscription status SHALL be set to `active`
- **AND** tenant quotas SHALL be provisioned based on PlanItems
- **AND** the subscription's organizationId SHALL match the requesting tenant's organizationId

#### Scenario: Reject cross-tenant subscription access
- **WHEN** a user attempts to read, cancel, or modify a subscription belonging to a different organizationId
- **THEN** the system SHALL reject the request with a 403 Forbidden error
- **AND** the attempt SHALL be logged for audit

#### Scenario: Cancel subscription at period end
- **WHEN** administrator cancels a subscription with `cancelAtPeriodEnd=true`
- **THEN** the subscription remains `active` until the current period ends
- **AND** at period end, status transitions to `expired` and quotas are removed

#### Scenario: Immediate plan upgrade
- **WHEN** a tenant upgrades from Plan A to Plan B mid-cycle
- **THEN** the upgrade SHALL take effect immediately
- **AND** quotas SHALL be adjusted to reflect the new plan's PlanItems
- **AND** a prorated credit SHALL be calculated for the remaining period of Plan A

#### Scenario: Plan downgrade at period end
- **WHEN** a tenant downgrades from Plan B to Plan A
- **THEN** the change SHALL be scheduled for the end of the current billing period
- **AND** current quotas remain unchanged until the switch

### Requirement: Quota Provisioning and Reset
The system SHALL automatically provision and reset tenant quotas based on subscription plan configuration.

#### Scenario: Quota provisioning on subscription activation
- **WHEN** a subscription is activated
- **THEN** tenant_quotas records SHALL be created for each metered PlanItem
- **AND** each quota SHALL have priority, expiresAt, and sourceId set according to the plan configuration
- **AND** sourceType SHALL be `membership` and sourceId SHALL be `plan_{planId}`

#### Scenario: Multi-plan quota independence
- **WHEN** a tenant subscribes to Plan A (100 units of `feature.x`) and Plan B (200 units of `feature.x`)
- **THEN** two independent tenant_quota buckets SHALL exist for `feature.x`
- **AND** consumption SHALL use waterfall deduction (priority DESC, expiresAt ASC)
- **AND** no max/sum aggregation is applied — each bucket is consumed independently

#### Scenario: Hard reset on renewal
- **WHEN** a subscription renews with resetStrategy=hard
- **THEN** the quota balance SHALL be reset to the full PlanItem amount
- **AND** the previous remaining balance is discarded

#### Scenario: Soft reset on renewal
- **WHEN** a subscription renews with resetStrategy=soft and 200 units remain of 1000
- **THEN** the new balance SHALL be 1200 (remaining + new grant)

#### Scenario: Capped reset on renewal
- **WHEN** a subscription renews with resetStrategy=capped, resetCap=1500, and 800 units remain of 1000
- **THEN** the new balance SHALL be 1500 (capped at resetCap, not 1800)

### Requirement: Payment Webhook Processing
The system SHALL process payment gateway webhooks to drive subscription state transitions.

The webhook handler SHALL enforce the following security requirements:
- Webhook signature verification SHALL be mandatory (reject unsigned or tampered payloads)
- Timestamp tolerance SHALL be enforced (reject events older than 5 minutes to prevent replay attacks)
- Event-id based idempotency SHALL prevent duplicate processing
- Before activating a subscription, the handler SHALL verify that the payment amount, currency, and sourceId match the expected transaction fields
- The handler SHALL resolve organizationId from the subscription record, never from untrusted webhook payload

#### Scenario: Successful payment activates subscription
- **WHEN** a `payment_intent.succeeded` webhook is received with valid signature
- **THEN** the handler SHALL verify amount/currency/sourceId match the pending transaction
- **AND** the corresponding subscription SHALL be activated
- **AND** quotas SHALL be provisioned

#### Scenario: Failed payment marks subscription past due
- **WHEN** a `payment_intent.payment_failed` webhook is received
- **THEN** the subscription status SHALL transition to `past_due`

#### Scenario: Duplicate webhook is handled idempotently
- **WHEN** the same webhook event is delivered multiple times
- **THEN** the system SHALL process it only once
- **AND** subsequent deliveries SHALL be acknowledged without side effects

### Requirement: Billing Admin UI
The system SHALL provide an administrative interface for managing plans, subscriptions, and quotas.

Implementation SHALL follow project conventions:
- Backend Plan CRUD SHALL use `@wordrhyme/auto-crud-server` (`createCrudRouter`) with `protectedProcedure.meta({ permission })` for RBAC integration
- Frontend Plan list SHALL use `@wordrhyme/auto-crud` (`AutoCrudTable` + `useCrudPermissions`)
- PlanItem configuration may use custom components due to capability selector requirements, but SHALL still use `protectedProcedure.meta()` for authorization
- Billing menu items SHALL be platform-scoped (`organizationId='platform'`, `systemReserved: true`)

#### Scenario: Administrator configures plan capabilities
- **WHEN** administrator opens the Plan management page
- **THEN** they can create/edit plans with PlanItem configurations
- **AND** select capabilities from registered capability list (only `approved` status)
- **AND** set amounts, overage policies (with overagePriceCents for `charge`), and reset strategies per capability

#### Scenario: Administrator approves plugin capabilities
- **WHEN** a new plugin is installed and its capabilities are registered as `pending`
- **THEN** administrator can review each capability in the Capability management page
- **AND** approve (→ available for PlanItem) or reject (→ blocked) each capability
- **AND** the approval status is persisted in the `capabilities` table

#### Scenario: Administrator manages billing overrides
- **WHEN** administrator opens the Billing Override management page
- **THEN** they can create/edit/delete override mappings (pluginId + procedureName → overrideFeatureKey)
- **AND** overrides take effect immediately on the next request (no restart required)
- **AND** can configure the Default Policy for undeclared procedures (allow/deny/audit)

#### Scenario: Administrator views tenant quota usage
- **WHEN** administrator opens the quota dashboard
- **THEN** they can see each capability's used/limit/remaining for the current tenant
- **AND** usage trend visualization

#### Scenario: Administrator grants bonus quota
- **WHEN** administrator grants 500 extra units of `pluginC.request` to a tenant
- **THEN** a new tenant_quota record SHALL be created with sourceType='admin_grant'
- **AND** it participates in the waterfall deduction order based on its priority

### Requirement: Entitlement Runtime Integration
All subscription lifecycle changes SHALL propagate to the entitlement runtime. The runtime SHALL execute the following 5-step flow per request:

1. **Resolve Context** — extract organizationId, userId, subject from request
2. **Permission Check (RBAC)** — in-memory CASL ability evaluation (O(1), cheap → fail fast)
3. **Load Entitlements** — query tenant_quotas for active buckets (DB query, expensive → deferred)
4. **Usage Validation** — for metered types, verify sufficient balance across all buckets
5. **Consume Usage + Execute** — deduct quota (metered only), then execute capability

NOTE: The runtime step order differs from ENTITLEMENT_SYSTEM.md's conceptual model (which lists Load Entitlements before Permission Check). This is a deliberate performance optimization: RBAC check is O(1) in-memory via cached CASL rules, while Load Entitlements requires a DB query. Since the two checks are orthogonal (RBAC = "is this user authorized?" vs Entitlement = "has this org paid?"), placing the cheaper check first enables fail-fast without semantic impact.

**CONSTRAINT: RBAC and Entitlement MUST remain orthogonal.** RBAC rules SHALL NOT depend on entitlement state, and entitlement checks SHALL NOT depend on RBAC results. If future requirements introduce cross-dependency, the step order optimization MUST be re-evaluated.

The `EntitlementService` SHALL serve as a **facade** orchestrating this flow, delegating to existing services:
- Permission Check → `PermissionKernel.require()`
- Load Entitlements → `TenantQuotaRepo.getActiveBySubject()`
- Usage Validation + Consume → `UnifiedUsageService.consume()` (waterfall deduction)

**NOTE: Usage engine consolidation** — `UnifiedUsageService` is the SOLE consumption engine for both tenant and user quotas. Legacy `UsageService` (user-only, operating on `userQuotas` table) SHALL be deprecated and all callers migrated to `UnifiedUsageService`. The two engines MUST NOT coexist long-term to prevent semantic drift.

For `boolean` type PlanItems, only steps 1-3 apply (existence check: active bucket exists and not expired). No usage validation or consumption occurs.

For `metered` type PlanItems, all 5 steps apply. Consumption follows the waterfall deduction model (priority DESC → expiresAt ASC).

#### Scenario: Entitlement reload on subscription activation
- **WHEN** a subscription is activated or quotas are provisioned
- **THEN** the entitlement runtime SHALL reflect the updated quotas immediately
- **AND** subsequent capability consumption SHALL use the new quota balances

#### Scenario: Entitlement invalidation on subscription expiry
- **WHEN** a subscription expires or is immediately canceled
- **THEN** the entitlement runtime SHALL invalidate the associated quotas
- **AND** subsequent capability consumption for the affected subjects SHALL be denied (unless other active quota buckets exist)

#### Scenario: Entitlement update on plan change
- **WHEN** a plan upgrade takes effect immediately
- **THEN** old plan quotas SHALL be removed and new plan quotas SHALL be provisioned
- **AND** the entitlement runtime SHALL reflect the new plan's capabilities within the same request cycle

### Requirement: Three-Layer Capability Control
The system SHALL resolve the billing subject for every plugin procedure call through a **four-layer priority chain**, ensuring the platform retains full commercial control while plugins remain zero-code.

NOTE: This aligns with the unified three-system governance model from `refactor-infra-policy-path-driven` where all three systems (Infra Policy + RBAC + Billing) share the same priority structure: `Admin Override > Developer Declaration > Module Default > Default Policy`. The `capabilities` table (L1) is a legitimacy constraint layer outside the priority chain.

**L1 — Platform Capability Registry** (`capabilities` table, legitimacy constraint):
- Authoritative registry of all billable subjects with `status` governance
- PlanItem only references `approved` subjects
- Core capabilities seeded as `approved`; plugin capabilities auto-registered as `pending`
- Platform admin approves/rejects capabilities before they can be used in Plans
- This layer validates that a resolved subject is legitimate, it does NOT participate in resolution priority

**L2 — Module Default** (Settings: `billing.module.{module}.subject`):
- Admin configures a default billing subject for all procedures in a module
- All procedures in the module inherit this subject unless overridden by higher-priority layers
- Stored as platform-level Settings (same pattern as `infra.policy.{m}`)
- Example: `billing.module.image-gen.subject = "imageGen.requests"` makes all `imageGen.*` procedures consume the same quota bucket by default

**L3 — Developer Declaration** (manifest `capabilities.billing.procedures`):
- Plugin developer maps specific procedure names to subjects or `"free"`
- Overrides the Module Default for declared procedures
- A procedure explicitly mapped to `"free"` SHALL bypass all billing checks

**L4 — Admin Override** (Settings: `billing.override.{path}`):
- Platform admin MAY override any plugin procedure's billing mapping at runtime
- Key format: `billing.override.pluginApis.{pluginId}.{procedureName}` (global scope)
- L4 override takes **highest priority** — overrides all other layers
- Takes effect immediately (Settings-based, no restart required)
- Consistent with `rbac.override.{path}` pattern from the unified governance model

**Resolution priority** (highest → lowest):
```
L4 Admin Override (billing.override.{path})
  > L3 Developer Declaration (manifest billing.procedures)
  > L2 Module Default (billing.module.{m}.subject)
  > Default Policy (billing.defaultUndeclaredPolicy)
```
After resolution: validate subject exists in L1 `capabilities` table with `status = 'approved'`.

**Middleware resolution flow** (executed per plugin procedure call):
1. Identify `pluginId` + `procedureName` from request path
2. **Check L4**: query Settings `billing.override.pluginApis.{pluginId}.{procedureName}` → if match, use override subject
3. **Check L3**: read manifest `billing.procedures[procedureName]` → if match, use declared subject; if `"free"`, pass through
4. **Check L2**: query Settings `billing.module.{pluginId}.subject` → if configured, use module default subject
5. **Undeclared**: no match in L2-L4 → execute **Default Policy** (`billing.defaultUndeclaredPolicy`)
6. **Validate + Execute**: with determined subject → verify in L1 (approved) → `EntitlementService.requireAndConsume()` (metered) or `.requireAccess()` (boolean)

**Default Policy for undeclared procedures** — platform-level configurable setting (`billing.defaultUndeclaredPolicy`):
- `allow` — undeclared procedures are free (development-friendly, NOT recommended for production)
- `deny` — undeclared procedures are blocked (strictest, prevents accidental free usage)
- `audit` — undeclared procedures are allowed but flagged for admin review (RECOMMENDED default)

#### Scenario: L4 override takes precedence over manifest
- **WHEN** a plugin declares `billing.procedures.generate = "imageGen.request"` in manifest
- **AND** platform admin sets Settings `billing.override.pluginApis.image-gen.generate = "premium.imageGen"`
- **AND** a request arrives at `pluginApis.image-gen.generate`
- **THEN** the middleware SHALL use `premium.imageGen` (from L4), NOT `imageGen.request` (from L3)
- **AND** consumption is charged against the `premium.imageGen` quota bucket

#### Scenario: Module Default applies to undeclared procedures
- **WHEN** admin configures `billing.module.image-gen.subject = "imageGen.requests"`
- **AND** a plugin exposes procedure `thumbnail` NOT declared in manifest `billing.procedures`
- **AND** no L4 override exists for the procedure
- **THEN** the middleware SHALL use `imageGen.requests` (from L2 Module Default)
- **AND** quota is consumed from the module's default bucket

#### Scenario: Undeclared procedure with no Module Default hits Default Policy
- **WHEN** a plugin exposes procedure `health` with no L4 override, no L3 declaration, and no L2 module default
- **THEN** the middleware SHALL execute the platform's Default Policy:
  - `allow`: request proceeds with no billing
  - `deny`: request is rejected with 402
  - `audit`: request proceeds but an audit log entry is created for admin review

#### Scenario: Procedure explicitly marked free
- **WHEN** a plugin declares `billing.procedures.getStatus = "free"` in manifest
- **AND** no L4 override exists for the procedure
- **THEN** the middleware SHALL bypass all billing checks
- **AND** no entitlement check or consumption occurs

### Requirement: Plugin Billing Transparency
Plugin developers SHALL NOT be required to write any billing/entitlement code. The system SHALL automatically enforce entitlement checks and usage consumption based on the four-layer resolution model (see Three-Layer Capability Control).

Implementation approach:
- Plugin manifest SHALL support a `capabilities.billing.procedures` mapping (procedure name → subject or `"free"`)
- Developers MAY also declare `meta.billing.subject` on individual procedures to override the module default
- A **host-side billing middleware** SHALL intercept plugin procedure calls and execute the four-layer resolution flow
- The middleware SHALL read the manifest at request time (already available via `context.ts:261 _serviceProvider.getPluginManifest()`)
- For `boolean` subjects: middleware performs existence check only (no consume)
- For `metered` subjects: middleware performs entitlement check + consume(1) by default
- Plugins requiring **dynamic consumption amounts** (e.g., token count, file size) MAY opt out of automatic mode and use explicit `ctx.usage.consume(subject, amount)` calls

**CRITICAL implementation constraint — middleware mounting strategy**:
Plugin procedures use an independent `initTRPC` instance (`packages/plugin/src/trpc.ts`), separate from the host's `procedureBase`. Billing middleware mounted on `procedureBase` will NOT reach plugin procedures. The middleware MUST be mounted at the **host-side router integration layer** — specifically in `registerPluginRouter()` (`apps/server/src/trpc/router.ts`), wrapping the plugin router with a billing middleware before merging it into the `pluginApis` namespace. This preserves plugin code isolation while enabling host-controlled billing interception.

NOTE: This approach is feasible because `context.ts` already detects plugin API calls (`extractPluginIdFromPath`), loads the manifest, and injects billing services into context. The middleware adds no new infrastructure — only orchestration.

#### Scenario: Automatic metered billing for plugin procedure
- **WHEN** a plugin declares `capabilities.billing.procedures.generate = "imageGen.request"` in manifest
- **AND** a request arrives at `pluginApis.image-gen.generate`
- **THEN** the middleware SHALL automatically check entitlement for `imageGen.request`
- **AND** consume 1 unit upon successful execution
- **AND** the plugin code contains zero billing-related calls

#### Scenario: Automatic boolean access check for plugin procedure
- **WHEN** a plugin declares a boolean-type subject mapping
- **THEN** the middleware SHALL verify an active, non-expired tenant_quota bucket exists
- **AND** no consumption occurs
- **AND** access is denied if no active bucket exists

#### Scenario: Plugin with dynamic consumption amount
- **WHEN** a plugin needs to consume variable amounts per request (e.g., token count)
- **THEN** the plugin MAY omit the procedure from manifest billing declarations
- **AND** use explicit `ctx.usage.consume(subject, amount)` in its procedure code
- **AND** this is the ONLY case where plugin code references billing APIs

### Requirement: Core Feature Billing
Core features SHALL use the same EntitlementService and quota infrastructure as plugins. The subject namespace `core.*` is reserved for Core capabilities.

Core billing differs from plugin billing in the invocation method only:
- Plugins: automatic middleware interception (zero-code)
- Core: explicit `entitlementService.requireAndConsume()` calls in Service layer

The underlying quota system (tenant_quotas, waterfall deduction, overage policies) is identical for both.

#### Scenario: Core feature quota enforcement
- **WHEN** a tenant attempts to create a project and the plan has `core.projects` amount=10
- **AND** the tenant already has 10 projects
- **THEN** the EntitlementService SHALL deny the request per the configured overagePolicy
- **AND** the denial is indistinguishable from a plugin capability denial

#### Scenario: Core feature with variable consumption
- **WHEN** a tenant uploads a 50MB file mapped to `core.storage`
- **THEN** the Service SHALL call `entitlementService.requireAndConsume(orgId, 'core.storage', 50)`
- **AND** 50 units SHALL be deducted from the `core.storage` quota bucket
