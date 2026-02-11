# Design: Core Messaging System

## Context

WordRhyme requires foundational messaging infrastructure for production use:

1. **Problem**: User requests are blocked by slow operations (email sending, image processing)
2. **Problem**: No way to notify users of events (comments, mentions, system alerts)
3. **Problem**: Plugins cannot execute async tasks reliably
4. **Constraint**: Must integrate with existing Plugin Contract (plugins extend, not modify)
5. **Constraint**: Must be tenant-scoped (no cross-tenant data leaks)
6. **Constraint**: Must support plugin enhancement via events (not replacement)

### Stakeholders

- **End Users** - Receive notifications, configure preferences
- **Plugin Developers** - Enqueue async tasks, subscribe to notification events
- **System Administrators** - Monitor queue health, manage workers
- **Core Developers** - Maintain queue and notification infrastructure

## Goals / Non-Goals

### Goals
- Provide reliable async task execution with retries
- Provide in-app notification system with configurable templates
- Allow users to select notification channels and set preferences
- Enable plugins to add notification channels via event subscription
- Support production-grade reliability (no job loss, automatic recovery)

### Non-Goals
- Real-time collaborative editing (different system)
- Complex workflow orchestration (out of scope)
- Multi-region queue distribution (single region for v1)
- Notification analytics/reporting (post-MVP)

## Decisions

### Decision 1: BullMQ for Queue System

**Choice**: BullMQ (Redis-based) over alternatives

**Why**:
- Redis already required for cluster coordination
- Mature, battle-tested library (used by Shopify, GitLab)
- Supports priorities, retries, delayed jobs, repeatable jobs
- Built-in dashboard (Bull Board) for monitoring
- TypeScript-first with excellent types

**Alternatives Considered**:
- **Bee-Queue**: Rejected - less feature-rich, no built-in delayed jobs
- **PostgreSQL-based** (graphile-worker): Rejected - adds DB load, less performant
- **RabbitMQ**: Rejected - additional infrastructure complexity
- **AWS SQS**: Rejected - vendor lock-in, not self-hostable

### Decision 2: Core Built-in Notification vs Plugin

**Choice**: Core provides in-app notifications, plugins enhance with additional channels

**Why**:
- In-app notifications are fundamental (user experience baseline)
- Plugins should enhance (add email/SMS), not replace core functionality
- Avoids plugin dependency issues (what if no notification plugin installed?)
- Event-driven enhancement allows multiple plugins to coexist

**Architecture**:
```
┌─────────────────────────────────────┐
│ Core (Built-in)                     │
│ ├── In-app notification storage     │
│ ├── Notification templates          │
│ ├── User preferences                │
│ └── Event: notification.created     │
└─────────────────────────────────────┘
          │ Event
          ▼
┌─────────────────────────────────────┐
│ Plugins (Enhancement)               │
│ ├── Email plugin → uses queue       │
│ ├── SMS plugin → uses queue         │
│ └── Push plugin → uses queue        │
└─────────────────────────────────────┘
```

### Decision 3: Worker Process Model

**Choice**: Flexible worker model - In-process by default, separate process optional

**Why**:
- **In-Process Default**: Zero-config deployment, works on all platforms (Vercel, Railway, Docker single container)
- **Separate Process Optional**: For high-load production, can isolate workers via environment variable
- Most queue tasks (notifications, emails) are I/O-bound, not CPU-bound
- BullMQ is async and doesn't block the event loop
- Reduces deployment complexity for most users

**Default Mode (In-Process)**:
```typescript
// Worker starts automatically with web server
// No additional configuration needed
import { startWorker } from './queue/worker';

// In NestJS bootstrap
if (process.env.WORKER_MODE !== 'standalone') {
  await startWorker();  // Start worker in same process
}
```

**Production Mode (Separate Process)**:
```bash
# Set environment variable to disable in-process worker
WORKER_MODE=standalone

# Start worker separately
node dist/worker.js
```

**Optional PM2 Configuration** (for high-load scenarios):
```javascript
// ecosystem.config.js (optional, for advanced users)
module.exports = {
  apps: [
    {
      name: 'wordrhyme-web',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: { WORKER_MODE: 'standalone' },  // Disable in-process worker
    },
    {
      name: 'wordrhyme-worker',
      script: 'dist/worker.js',
      instances: 2,
      exec_mode: 'cluster',
    },
  ],
};
```

**Trade-offs**:
| Mode | Pros | Cons |
|------|------|------|
| In-Process | Simple deployment, zero-config | Worker crash affects web, shared resources |
| Separate | Isolation, independent scaling | More complex deployment |

### Decision 4: Notification Template System

**Choice**: Database-stored templates with i18n support and variable interpolation

**Why**:
- Templates can be updated without code deployment
- Supports multi-language (i18n via JSON structure)
- Variables allow dynamic content (`{userName}`, `{postTitle}`)
- Plugins can register their own templates

**Template Structure**:
```typescript
interface NotificationTemplate {
  key: string;              // 'comment.new', 'order.shipped'
  title: Record<string, string>;    // { 'en-US': 'New Comment', 'zh-CN': '新评论' }
  message: Record<string, string>;  // { 'en-US': '{user} commented...', ... }
  variables: string[];      // ['user', 'postTitle']
  defaultChannels: string[]; // ['in-app', 'email']
  priority: 'low' | 'normal' | 'high' | 'urgent';
  pluginId?: string;        // If registered by plugin
}
```

### Decision 5: User Preference Model

**Choice**: Granular preferences with template-level overrides

**Why**:
- Users have different preferences for different notification types
- Some want email for comments, but only in-app for likes
- Quiet hours prevent late-night notifications (except urgent)

**Preference Structure**:
```typescript
interface NotificationPreference {
  userId: string;
  tenantId: string;
  enabledChannels: string[];        // Global: ['in-app', 'email']
  templateOverrides: Record<string, string[]>;  // { 'order.urgent': ['in-app', 'email', 'sms'] }
  quietHours: {
    enabled: boolean;
    start: string;   // '22:00'
    end: string;     // '08:00'
    timezone: string;
  };
  emailFrequency: 'instant' | 'hourly' | 'daily';
}
```

### Decision 6: Plugin Channel Registration

**Choice**: Plugins register channels, subscribe to events, use Core queue

**Why**:
- Decoupled from Core (plugins can be installed/uninstalled)
- Multiple channel plugins can coexist
- Plugins use reliable Core queue for async delivery

**Channel Registration**:
```typescript
// Plugin registers channel on enable
await ctx.services.registerNotificationChannel({
  key: `plugin:${ctx.pluginId}:email`,  // Namespaced channel key
  name: { 'en-US': 'Email', 'zh-CN': '邮件' },
  icon: 'Mail',
  pluginId: ctx.pluginId,
  configSchema: { /* Zod schema for user config */ },
});

// Plugin subscribes to notification event
eventBus.on('notification.created', async (event) => {
  if (!event.channels.includes(`plugin:${ctx.pluginId}:email`)) return;

  // Enqueue async job (automatically namespaced to plugin:{pluginId}:send-email)
  await ctx.queue.enqueue('send-email', {
    userId: event.userId,
    notification: event.notification,
  });
});

// Plugin registers queue handler (automatically namespaced to plugin:{pluginId}:send-email)
ctx.queue.registerHandler('send-email', async (data) => {
  await emailService.send(data);
});
```

## Data Model

### Core Tables

```sql
-- Notification Templates
CREATE TABLE notification_templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,  -- 'system' | 'plugin' | 'custom'
  title JSONB NOT NULL,    -- i18n: { "en-US": "...", "zh-CN": "..." }
  message JSONB NOT NULL,
  variables JSONB,
  default_channels JSONB DEFAULT '["in-app"]',
  priority TEXT DEFAULT 'normal',
  plugin_id TEXT,
  deprecated BOOLEAN DEFAULT FALSE,  -- Template deprecation flag
  version INTEGER DEFAULT 1,         -- Template version for evolution
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Preferences
CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  enabled_channels JSONB DEFAULT '["in-app"]',
  template_overrides JSONB,
  quiet_hours JSONB,
  email_frequency TEXT DEFAULT 'instant',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Notifications (In-app storage)
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Recipient
  tenant_id TEXT NOT NULL,

  -- Actor/Entity for better UI rendering
  actor_id TEXT,                   -- Who performed the action (e.g., commenter)
  entity_id TEXT,                  -- The entity involved (e.g., comment ID)
  entity_type TEXT,                -- Entity type (e.g., 'comment', 'order')

  -- Template reference
  template_key TEXT,
  template_variables JSONB,

  -- Content (rendered)
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,

  -- Status
  read BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,

  -- Channel tracking
  channels_sent JSONB,
  channels_failed JSONB,
  email_sent BOOLEAN DEFAULT FALSE,   -- For digest support
  email_sent_at TIMESTAMP,

  -- Grouping/Bundling support
  group_key TEXT,                  -- For notification bundling (e.g., "post:123:likes")
  group_count INTEGER DEFAULT 1,   -- Count of bundled notifications

  -- Idempotency
  idempotency_key TEXT UNIQUE,     -- Prevent duplicate notifications

  -- Source tracking
  source_plugin_id TEXT,           -- Which plugin created this notification

  -- Metadata
  priority TEXT DEFAULT 'normal',
  metadata JSONB,                  -- Includes decisionTrace for debugging

  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP             -- For auto-archival
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read);
CREATE INDEX idx_notifications_template ON notifications(template_key);
CREATE INDEX idx_notifications_group ON notifications(group_key);
CREATE INDEX idx_notifications_idempotency ON notifications(idempotency_key);
CREATE INDEX idx_notifications_expires ON notifications(expires_at);

-- Available Channels (Plugin-registered)
CREATE TABLE notification_channels (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,        -- Namespaced: 'in-app' or 'plugin:{pluginId}:{channel}'
  name JSONB NOT NULL,
  description JSONB,
  icon TEXT,
  plugin_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  config_schema JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_channels_plugin ON notification_channels(plugin_id);
```

## Event Flow

### Notification Creation Flow

```
1. Application code calls notificationService.sendFromTemplate()
   │
   ├─► 2. Render template with variables (i18n)
   │
   ├─► 3. Load user preferences
   │
   ├─► 4. Resolve target channels (template defaults ∩ user prefs)
   │
   ├─► 5. Save in-app notification (database)
   │
   └─► 6. Emit event: notification.created
            │
            ├─► Email Plugin (subscribes)
            │     └─► queue.enqueue('notification:email', {...})
            │
            ├─► SMS Plugin (subscribes)
            │     └─► queue.enqueue('notification:sms', {...})
            │
            └─► Push Plugin (subscribes)
                  └─► queue.enqueue('notification:push', {...})
```

### Queue Processing Flow

```
1. Worker process starts
   │
   ├─► 2. Connect to Redis
   │
   ├─► 3. Register job handlers (Core + Plugins)
   │
   └─► 4. Process jobs in loop
            │
            ├─► Success: Mark job complete
            │
            └─► Failure: Retry with exponential backoff
                  │
                  └─► Max retries exceeded: Move to dead-letter queue
```

## Risks / Trade-offs

### Risk 1: Redis Dependency
- **Risk**: Redis failure brings down queue system
- **Mitigation**: Redis Sentinel/Cluster for HA, graceful degradation for non-critical jobs

### Risk 2: Queue Backlog
- **Risk**: High volume causes job backlog
- **Mitigation**: Priority queues, rate limiting per plugin, monitoring alerts

### Risk 3: Plugin Job Failures
- **Risk**: Plugin jobs repeatedly fail, fill dead-letter queue
- **Mitigation**: Max retries config, plugin health monitoring, admin alerts

### Trade-off 1: Complexity vs Reliability
- **Trade-off**: BullMQ adds complexity but provides production reliability
- **Decision**: Accept complexity for reliability (this is production-grade, not MVP)

### Trade-off 2: Separate Worker vs In-Process
- **Trade-off**: Separate process adds deployment complexity but isolates failures
- **Decision**: Separate worker process for isolation

## Migration Plan

### Phase 1: Queue Infrastructure
1. Add `bullmq` and `ioredis` dependencies
2. Create queue service with connection pooling
3. Create worker entry point (`worker.ts`)
4. Update PM2 configuration

### Phase 2: Notification Core
1. Create database schema and migrations
2. Implement NotificationService
3. Implement TemplateService
4. Implement PreferenceService
5. Create tRPC API

### Phase 3: Admin UI
1. Notification center component
2. User preferences settings page
3. Admin template management (optional)

### Phase 4: Plugin Integration
1. Add queue capability to Plugin API
2. Add notification event emission
3. Add channel registration protocol
4. Document plugin integration guide

### Rollback
- Queue system can be disabled via feature flag
- Notifications fall back to direct DB writes (no async channels)
- Worker process can be stopped independently

## Open Questions

1. **Email Digest Frequency** - Should we implement email digests (hourly/daily summaries) in Phase 1 or defer?
   - **Resolution**: Include basic support (hourly/daily flag), full implementation in Phase 2

2. **Admin Template Editor** - Should admins be able to create/edit templates in UI?
   - **Resolution**: Defer to post-MVP. System and plugin templates only for now.

3. **Notification Expiry** - Should notifications auto-archive after X days?
   - **Resolution**: Yes, 90 days default, configurable per tenant.

---

## Appendix A: Hard Contracts (Non-Negotiable)

These contracts are **frozen** and must be enforced at code level.

### Contract 1: Queue Job Namespace

All queue job names MUST follow this pattern:

```
core:{module}:{action}           # Core jobs
plugin:{pluginId}:{action}       # Plugin jobs
```

**Examples**:
```
core:notification:archive        # Core cleanup job
core:notification:digest         # Core digest job
plugin:com.acme.email:send       # Plugin email job
plugin:com.acme.sms:send         # Plugin SMS job
```

**Enforcement**: `QueueService.enqueue()` validates job name format.

---

### Contract 2: Plugin Job Limits

Each plugin is subject to these limits (configurable per plugin):

| Limit | Default | Description |
|-------|---------|-------------|
| `maxConcurrency` | 5 | Max concurrent jobs per plugin |
| `maxRetries` | 3 | Max retry attempts per job |
| `maxJobsPerMinute` | 100 | Rate limit per plugin |
| `maxJobDataSize` | 64KB | Max job payload size |

**Enforcement**: `PluginQueueCapability` enforces limits before enqueue.

**Violation Behavior**:
- Rate limit exceeded → Job rejected with `RATE_LIMIT_EXCEEDED` error
- Payload too large → Job rejected with `PAYLOAD_TOO_LARGE` error

---

### Contract 3: Tenant Isolation

All queue jobs MUST include `tenantId` and it MUST match the plugin context:

```typescript
// Enforced at enqueue time
assert(job.data.tenantId === ctx.tenantId, 'Tenant mismatch');
```

**Cross-tenant job execution is FORBIDDEN.**

---

### Contract 4: Plugin Job Exception Semantics

Plugin job handlers MUST follow these semantics:

| Handler Behavior | Result |
|------------------|--------|
| `return` (success) | Job marked complete |
| `throw Error` | Job retried (up to maxRetries) |
| `throw FatalJobError` | Job moved to dead-letter (no retry) |
| `ctx.queue.fail(reason)` | Job failed with reason (no retry) |

**Example**:
```typescript
ctx.queue.registerHandler('send-email', async (data, ctx) => {
  try {
    await emailService.send(data);
    return; // Success
  } catch (error) {
    if (error.code === 'INVALID_EMAIL') {
      throw new FatalJobError('Invalid email address'); // No retry
    }
    throw error; // Retry
  }
});
```

---

### Contract 5: Event Immutability

Events emitted by Core are **read-only**. Plugins MUST NOT mutate event payloads:

```typescript
// ❌ FORBIDDEN
eventBus.on('notification.created', (event) => {
  event.notification.title = 'Modified'; // VIOLATION
});

// ✅ CORRECT
eventBus.on('notification.created', (event) => {
  const copy = { ...event.notification };
  // Work with copy
});
```

**Enforcement**: Event payloads are frozen with `Object.freeze()` in production.

---

### Contract 6: In-App Notification Immutability

Plugins MUST NOT:
- Prevent Core from creating in-app notifications
- Modify existing in-app notifications
- Delete in-app notifications

**In-app notification is a fact record. Plugins enhance delivery, not modify facts.**

---

### Contract 7: Template Key Stability

Template keys are **public API contracts**:

- ❌ Plugins MUST NOT change template keys after registration
- ❌ Plugins MUST NOT delete templates (only deprecate)
- ✅ Templates MAY have `deprecated: true` flag
- ✅ Templates MAY have `version` field for evolution

**Reason**: User preferences reference template keys. Changing keys breaks preferences.

---

### Contract 8: Channel Key Namespace

Channel keys MUST be namespaced to prevent conflicts:

```
in-app                           # Reserved for Core
plugin:{pluginId}:{channel}      # Plugin channels
```

**Examples**:
```
in-app                           # Core (always available)
plugin:com.acme.email:email      # Email plugin
plugin:com.acme.sms:sms          # SMS plugin
plugin:com.acme.push:web-push    # Push plugin
```

**Enforcement**: `ChannelService.registerChannel()` validates key format.

---

## Appendix B: Worker Process Bootstrap

### Flexible Worker Architecture

The worker supports two modes: **In-Process** (default) and **Standalone** (optional).

---

### Mode 1: In-Process Worker (Default)

Worker runs inside the web server process. Zero configuration required.

```typescript
// apps/server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startInlineWorker } from './queue/worker';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Start worker in same process (unless standalone mode)
  if (process.env.WORKER_MODE !== 'standalone') {
    await startInlineWorker(app);
    console.log('Inline worker started');
  }

  await app.listen(3000);
}

bootstrap();
```

**Characteristics**:
- ✅ Zero-config, works everywhere (Vercel, Railway, Docker)
- ✅ Single process to manage
- ⚠️ Worker crash may affect web server
- ⚠️ Shared CPU/memory resources

---

### Mode 2: Standalone Worker (Production Optional)

For high-load scenarios, worker runs as separate process.

**Environment Setup**:
```bash
# Disable in-process worker on web server
WORKER_MODE=standalone
```

**Standalone Worker Bootstrap**:
```typescript
// apps/server/src/worker.ts
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // 1. Create headless NestJS application (no HTTP server)
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // 2. Initialize database connection
  const db = app.get(DatabaseService);
  await db.connect();

  // 3. Initialize PluginManager (loads all enabled plugins)
  const pluginManager = app.get(PluginManager);
  await pluginManager.scanAndLoadPlugins();

  // 4. Initialize QueueWorker (registers all handlers)
  const queueWorker = app.get(QueueWorkerService);
  await queueWorker.start();

  // 5. Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Worker received SIGTERM, shutting down...');
    await queueWorker.stop(); // Wait for active jobs
    await app.close();
    process.exit(0);
  });

  console.log('Standalone worker started');
}

bootstrap();
```

**Characteristics**:
- ✅ Complete isolation from web server
- ✅ Independent scaling
- ✅ Worker crash doesn't affect web
- ⚠️ Requires additional process management (PM2/Docker/systemd)

---

### Worker-Plugin Handler Registration

When a plugin is enabled, its handlers are registered on startup (both modes):

```typescript
// Plugin onEnable hook (runs in both web and worker on startup)
export async function onEnable(ctx: PluginContext) {
  // This runs in worker process too
  ctx.queue.registerHandler('send', async (data) => {
    // Handler registered as plugin:{pluginId}:send automatically
    await emailService.send(data);
  });
}
```

**Handler Lifecycle** (via process restart):
- Plugin enable → Redis broadcast RELOAD_APP → Process restarts → Handler registered
- Plugin disable → Redis broadcast RELOAD_APP → Process restarts → Handler removed
- Plugin uninstall → Handler removed, pending jobs fail gracefully

---

## Appendix C: Noisy Neighbor Mitigation

### Problem: Multi-tenant Queue Fairness

If Tenant A enqueues 10,000 jobs, Tenant B's single urgent job waits at position 10,001.

### Solution: Job Priorities

BullMQ supports job priorities (lower number = higher priority):

| Priority | Value | Use Case |
|----------|-------|----------|
| `critical` | 1 | System alerts, security notifications |
| `high` | 2 | Password reset, 2FA codes |
| `normal` | 3 | Comments, mentions, likes |
| `low` | 4 | Marketing, digests, bulk |

**Implementation**:
```typescript
// Core maps notification priority to job priority
const priorityMap = {
  urgent: 1,   // critical
  high: 2,     // high
  normal: 3,   // normal
  low: 4,      // low
};

await queue.add('send-email', data, {
  priority: priorityMap[notification.priority],
});
```

**Contract**: Password reset emails MUST use `high` priority.

---

## Appendix D: Database Retention Policy

### Decision: Hard Retention Limits

| Data | Retention | Action |
|------|-----------|--------|
| Unread notifications | 365 days | Archive |
| Read notifications | 90 days | Archive |
| Archived notifications | 30 days | Hard delete |
| Queue job history | 7 days | Auto-purge by BullMQ |

**Implementation**:
- Daily cron job runs `NotificationService.archiveOld()`
- Weekly cron job runs `NotificationService.purgeArchived()`
- BullMQ configured with `removeOnComplete: { age: 7 * 24 * 3600 }`

---

## Appendix E: Digest Implementation Pattern

### Problem: Email Digests

Users may prefer daily/weekly email summaries instead of instant emails.

### Solution: Database-First, Not Queue-Delay

**❌ Wrong Approach**: Delay job for 24 hours
- Server restart loses context
- Job failure loses notifications

**✅ Correct Approach**: Database aggregation

```
1. Notification created → Save to DB (always)
2. If user pref is 'instant' → Enqueue email job immediately
3. If user pref is 'daily' → Do NOT enqueue, just save
4. Daily cron job (per timezone):
   - Query: SELECT * FROM notifications WHERE email_sent = false AND created_at > yesterday
   - Group by user
   - Generate digest email
   - Mark as email_sent = true
```

**Schema Addition**:
```sql
ALTER TABLE notifications ADD COLUMN email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN email_sent_at TIMESTAMP;
```

---

## Appendix F: Decision Trace (Debug Support)

### Feature: Preference Resolution Trace

When resolving notification channels, output a decision trace for debugging:

```typescript
interface ChannelDecision {
  channel: string;
  included: boolean;
  reason: string;
}

interface NotificationDecisionTrace {
  templateKey: string;
  resolvedChannels: string[];
  decisions: ChannelDecision[];
}

// Example output
{
  "templateKey": "comment.new",
  "resolvedChannels": ["in-app", "email"],
  "decisions": [
    { "channel": "in-app", "included": true, "reason": "always enabled" },
    { "channel": "email", "included": true, "reason": "user preference" },
    { "channel": "sms", "included": false, "reason": "quiet hours active" },
    { "channel": "push", "included": false, "reason": "user disabled" }
  ]
}
```

**Storage**: Trace stored in `notifications.metadata.decisionTrace` for debugging.

**Use Cases**:
- User support: "Why didn't I get an email?"
- Admin debugging: "Why was SMS skipped?"
- Plugin debugging: "Why wasn't my channel called?"
