# Core Messaging System

This document describes the architecture and usage of the Core Messaging System, which provides:
- BullMQ-based queue for async task processing
- In-app notification storage and delivery
- Event bus for plugin enhancement
- User notification preferences
- **Unified notification contract for SaaS + Social scenarios**
- **Aggregation and grouping for social-style notifications**
- **Pin/Timeline display model**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin UI                                 │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │ NotificationCenter│  │ NotificationPreferencesPage    │  │
│  │ (Pin + Timeline) │  │                                 │  │
│  └────────┬─────────┘  └──────────────┬──────────────────┘  │
└───────────│───────────────────────────│─────────────────────┘
            │                           │
            ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     tRPC API                                │
│  notification.list        notification.markAsRead           │
│  notification.listGrouped notification.markGroupAsRead      │
│  notification.unreadCount notification.markAllAsRead        │
│  notification.pin         notification.unpin                │
│  notificationPreferences.get/update                         │
└───────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Notification Service                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ Template    │  │ Preference  │  │ Channel Service      │ │
│  │ Service     │  │ Service     │  │                      │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ View Strategy (Inbox / SocialFeed)                      ││
│  └─────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Scheduled Tasks                          │
│  NotificationCleanupTask (daily @ 3 AM)                     │
│  - Category-based retention cleanup                         │
│  - Batch deletion for performance                           │
└───────────────────────────────────────────────────────────┘

## Queue System

### Job Naming Convention

BullMQ does not allow colons (`:`) in queue or job names. All names use underscores (`_`):

- **Core jobs**: `core_{module}_{action}`
  - Example: `core_notification`, `core_notification_cleanup`

- **Plugin jobs**: `plugin_{pluginId}_{action}`
  - Example: `plugin_analytics_track`, `plugin_hello-world_send_email`

### Job Priority Levels

| Priority | Value | Use Case |
|----------|-------|----------|
| critical | 1 | System alerts, security events |
| high | 2 | Important user actions |
| normal | 3 | Default for most jobs |
| low | 4 | Background tasks, cleanup |

### Plugin Job Limits

| Limit | Value | Description |
|-------|-------|-------------|
| maxConcurrency | 5 | Max concurrent jobs per plugin |
| maxRetries | 3 | Retry attempts on failure |
| maxJobsPerMinute | 100 | Rate limit per plugin |
| maxJobDataSize | 64KB | Maximum payload size |

### Usage Example

```typescript
import { QueueService } from '../queue';

// Enqueue a core job
await queueService.enqueue('core_notification', {
  tenantId: 'tenant-123',
  userId: 'user-456',
  data: { ... }
});

// Enqueue a plugin job (with automatic namespace)
await queueService.enqueueForPlugin('analytics', 'track-event', {
  tenantId: 'tenant-123',
  event: 'page_view',
});
```

## Notification Service

### Creating Notifications

```typescript
import { NotificationService } from '../notifications';

const result = await notificationService.createNotification({
  userId: 'user-123',
  tenantId: 'tenant-456',
  templateKey: 'comment.new',
  variables: {
    commenterName: 'Alice',
    postTitle: 'My Post',
  },
  type: 'info',
  link: '/posts/123',
  actorId: 'user-789',
  entityId: 'comment-456',
  entityType: 'comment',
  idempotencyKey: 'comment:456:new:789',
});
```

### Notification Types

| Type | Color | Use Case |
|------|-------|----------|
| info | Blue | General information |
| success | Green | Successful actions |
| warning | Yellow | Warnings, attention needed |
| error | Red | Errors, failures |

### Priority Levels

| Priority | Description |
|----------|-------------|
| low | Non-urgent, can be batched |
| normal | Standard notifications |
| high | Important, timely delivery |
| urgent | Critical, bypasses quiet hours |

## Event System

### Standard Events

| Event | Description | Payload |
|-------|-------------|---------|
| `notification.created` | New notification created | `NotificationCreatedEvent` |
| `notification.read` | Notification marked as read | `{ notificationId, userId }` |
| `notification.archived` | Notification archived | `{ notificationId, userId }` |

### Subscribing to Events

```typescript
import { EventBus } from '../events';

eventBus.on('notification.created', async (event) => {
  console.log('Notification created:', event.notification.id);
  // Handle event (e.g., send to external service)
});
```

## Template System

### Template Structure

```typescript
{
  key: 'comment.new',
  name: 'New Comment',
  title: {
    'en-US': 'New comment on your post',
    'zh-CN': '您的帖子有新评论',
  },
  message: {
    'en-US': '{{commenterName}} commented on "{{postTitle}}"',
    'zh-CN': '{{commenterName}} 评论了 "{{postTitle}}"',
  },
  variables: ['commenterName', 'postTitle'],
  defaultChannels: ['in-app', 'email'],
  priority: 'normal',
}
```

### Variable Interpolation

Templates support `{{variable}}` syntax for dynamic content:
- Variables are automatically sanitized to prevent XSS
- Missing variables are preserved as-is
- All variables are cast to strings

## User Preferences

### Preference Structure

```typescript
{
  enabledChannels: ['in-app', 'email'],
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '08:00',
    timezone: 'America/New_York',
  },
  emailFrequency: 'daily', // 'instant' | 'hourly' | 'daily'
  templateOverrides: {
    'comment.new': ['in-app'], // Override channels per template
  },
}
```

### Channel Resolution Logic

1. Start with template's default channels
2. Apply channel overrides if specified
3. Filter by user's enabled channels
4. Check quiet hours (urgent notifications bypass)
5. Return final channel list with decision trace

## Admin UI Components

### NotificationCenter

Header dropdown component showing:
- Unread count badge
- Notification list with infinite scroll
- Mark as read / archive actions
- Real-time polling (30s interval)

### NotificationsPage

Full-page notification list with:
- Filter tabs (All / Unread)
- Mark all as read
- Individual actions
- Pagination

### NotificationPreferencesPage

User preference management:
- Channel toggles (in-app always enabled)
- Email frequency selector
- Quiet hours configuration
- Timezone support

## Database Tables

| Table | Description |
|-------|-------------|
| `notifications` | Notification records |
| `notification_templates` | Template definitions |
| `notification_preferences` | User preferences |
| `notification_channels` | Channel registry |

## Testing

Run notification system tests:

```bash
pnpm --filter @wordrhyme/server test -- --run src/__tests__/queue/
pnpm --filter @wordrhyme/server test -- --run src/__tests__/notifications/
```

## Plugin Integration

Plugins can access the notification capability through `PluginContext`:

```typescript
// In plugin handler
async function handleEvent(ctx: PluginContext) {
  // Send notification
  await ctx.notifications?.send({
    userId: 'user-123',
    templateKey: 'my_template',
    variables: { ... },
  });

  // Enqueue background job
  await ctx.queue?.addJob('process-data', {
    // job data
  });
}
```

See `packages/plugin/src/types.ts` for full capability interfaces.

---

## Unified Notification Contract (v2)

The unified notification contract supports both SaaS (transactional) and Social (engagement) notification scenarios.

### Notification Categories

| Category | Description | Retention | Examples |
|----------|-------------|-----------|----------|
| `system` | System alerts, warnings | Forever | Security alerts, billing notices |
| `collaboration` | Team interactions | 30 days | Comments, mentions, task assignments |
| `social` | Social engagement | 90 days | Likes, follows, shares |

### Notification Source

| Source | Description |
|--------|-------------|
| `system` | Generated by core system |
| `plugin` | Generated by plugins |
| `user` | User-initiated notifications |

### Visual Priority

| Priority | Visual Style | Use Case |
|----------|--------------|----------|
| `high` | Red border, bold text | Errors, urgent alerts |
| `medium` | Blue border, normal text | Standard system notifications |
| `low` | Gray border, muted text | Social interactions |

---

## Pin/Timeline Display Model

The notification UI uses a "Pin + Timeline" model instead of the traditional "Inbox/Archive" pattern.

### Display Sections

1. **Pinned Section**: Important system notifications pinned to the top
2. **Timeline Section**: All other notifications in chronological order

### Pinning Rules

- Only `system` category notifications can be pinned
- Pinning automatically marks the notification as read
- Unpinning also marks the notification as read
- Pinned notifications stay at the top regardless of read status

### Read Behavior (Implicit Read Contract)

| Action | Marks as Read |
|--------|---------------|
| Click on notification | Yes |
| Click "Mark as Read" button | Yes |
| Pin notification | Yes |
| Unpin notification | Yes |
| Mark all as read | Yes |

**Note**: Read notifications only change visual appearance (gray/muted), they do NOT move position in the timeline.

---

## Aggregation & Grouping

For social-style notifications, multiple similar notifications can be aggregated.

### Aggregation Strategies

| Strategy | Group Key Pattern | Example |
|----------|-------------------|---------|
| `none` | No grouping | Individual notifications |
| `by_target` | `{tenantId}:target:{targetId}` | "5 people liked your post" |
| `by_actor` | `{tenantId}:actor:{actorId}` | "Alice did 3 actions" |
| `by_type` | `{tenantId}:type:{type}` | "You have 10 new likes" |

### Group Display

- **Aggregated Title**: "Alice and 4 others liked your post"
- **Stacked Avatars**: Shows up to 3 avatars with "+N" overflow
- **Count Badge**: Shows total count (max "99+")
- **Group Read**: Clicking marks ALL notifications in the group as read

### API Usage

```typescript
// List grouped notifications
const { notifications } = await trpc.notification.listGrouped.query({
  strategy: 'social-feed',
  category: 'social',
});

// Mark entire group as read
await trpc.notification.markGroupAsRead.mutate({
  groupKey: 'tenant-123:target:post-456',
});
```

---

## Retention & Cleanup

Notifications are automatically cleaned up based on retention policies.

### Retention Policies

| Category | Read Notifications | Unread Notifications |
|----------|-------------------|---------------------|
| System | Never deleted | Never deleted |
| Collaboration | 30 days | 30 + 7 days (grace period) |
| Social | 90 days | 90 + 7 days (grace period) |

### Cleanup Task

The `NotificationCleanupTask` runs daily at 3 AM:

```typescript
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async handleCleanup() {
  // Batch deletes notifications past retention
  // Uses batching (1000 per batch) to avoid long transactions
  // Logs per-category statistics
}
```

### Manual Cleanup

```typescript
// Trigger manual cleanup
const cleanupTask = app.get(NotificationCleanupTask);
const results = await cleanupTask.runManualCleanup();
// Returns: [{ category, readDeleted, unreadDeleted, totalDeleted, batches, durationMs }]
```

---

## API Reference

### List Notifications

```typescript
// Basic list
notification.list.query({
  limit: 20,
  cursor: 'cursor-123',
  unreadOnly: true,
  category: 'system', // Optional filter
});

// Grouped list (for social feed)
notification.listGrouped.query({
  strategy: 'social-feed',
  category: 'social',
  limit: 20,
});
```

### Read Operations

```typescript
// Single notification
notification.markAsRead.mutate({ id: 'notif-123' });

// Entire group
notification.markGroupAsRead.mutate({ groupKey: 'group-key' });

// All notifications (with optional category filter)
notification.markAllAsRead.mutate({ category: 'collaboration' });
```

### Pin Operations

```typescript
// Pin (system category only)
notification.pin.mutate({ id: 'notif-123' });
// Returns pinned notification, also marks as read

// Unpin
notification.unpin.mutate({ id: 'notif-123' });
// Returns unpinned notification, also marks as read
```

### Unread Count

```typescript
const { count, groupedCount } = await notification.unreadCount.query();
// count: raw number of unread notifications
// groupedCount: number of unique groups with unread notifications
```

---

## Plugin Notification Guide

Plugins can send notifications through the `PluginContext.notifications` capability.

### Basic Usage

```typescript
async function handleEvent(ctx: PluginContext) {
  await ctx.notifications?.send({
    userId: 'user-123',
    templateKey: 'my_plugin.event_occurred',
    variables: {
      eventName: 'Something happened',
      details: 'More information here',
    },
    // Optional: aggregation settings
    groupKey: 'my_plugin:user-123:events',
    aggregationStrategy: 'by_type',
  });
}
```

### Plugin Notification Fields

| Field | Required | Description |
|-------|----------|-------------|
| `userId` | Yes | Target user |
| `templateKey` | Yes | Template identifier (namespaced) |
| `variables` | Yes | Template variables |
| `type` | No | `info`, `success`, `warning`, `error` |
| `link` | No | Click-through URL |
| `groupKey` | No | For aggregation |
| `aggregationStrategy` | No | `none`, `by_target`, `by_actor`, `by_type` |

### Plugin Notification Source

All plugin notifications are automatically tagged with:
- `source: 'plugin'`
- `sourcePluginId: '{pluginId}'`

This allows filtering and analytics by plugin origin.

### Rate Limiting (Future)

Plugin notifications will be rate-limited:
- Per-plugin: 100/min, 1000/hour, 10000/day
- Per-user from plugin: 10/min, 50/hour

---

## Testing

Run notification system tests:

```bash
# All notification tests
pnpm --filter @wordrhyme/server test -- --run src/__tests__/notifications/

# Specific test files
pnpm --filter @wordrhyme/server test -- --run src/__tests__/notifications/read-semantics.test.ts
pnpm --filter @wordrhyme/server test -- --run src/__tests__/notifications/notification-router.test.ts
pnpm --filter @wordrhyme/server test -- --run src/__tests__/notifications/notification-integration.test.ts
```
