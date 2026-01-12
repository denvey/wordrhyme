# Change: Add Core Messaging System

## Why

WordRhyme needs foundational messaging infrastructure to support:

1. **Async Task Processing** - Email sending, image processing, data exports cannot block user requests
2. **User Notifications** - Users need to receive in-app notifications for comments, mentions, system alerts
3. **Plugin Ecosystem** - Plugins need reliable async task execution with retries
4. **Multi-Channel Delivery** - Notifications should be deliverable via email, SMS, push (via plugins)

Currently, there is no queue system or notification infrastructure. The design documents (Decision 27, 28) reserved interfaces but deferred implementation. This change implements the full production-grade system.

## What Changes

### Core Infrastructure (Not Plugins)

1. **Queue System** (BullMQ + Redis)
   - Job queuing with priorities
   - Automatic retries with exponential backoff
   - Failed job handling and dead-letter queue
   - Worker process model (separate from web process)
   - Plugin capability to enqueue jobs

2. **Notification System** (Core Built-in)
   - In-app notification storage (database)
   - Notification templates with i18n support
   - User preference management (channel selection, quiet hours)
   - Event emission for plugin enhancement
   - Notification center API

### Plugin Enhancement Points

3. **Notification Channel Plugins** (via Event Subscription)
   - `notification.created` event for plugins to subscribe
   - Plugins can add channels: email, SMS, push, webhook
   - Plugins use Core queue for async delivery
   - Channel registration protocol

### Database Schema

4. **New Tables**
   - `notifications` - In-app notification storage
   - `notification_templates` - Configurable templates
   - `notification_preferences` - User channel preferences
   - `notification_channels` - Plugin-registered channels
   - `queue_jobs` - BullMQ persistence (Redis, but with status tracking)

## Impact

- **Affected specs**:
  - NEW: `queue-system` - Queue infrastructure capability
  - NEW: `notification-system` - Notification capability
  - MODIFIED: `plugin-api` - Add queue and notification capabilities

- **Affected code**:
  - `apps/server/src/queue/` - NEW: Queue service and workers
  - `apps/server/src/notifications/` - NEW: Notification service
  - `apps/server/src/db/schema/` - NEW: Notification tables
  - `apps/server/src/trpc/routers/notifications.ts` - NEW: tRPC API
  - `apps/server/src/events/` - NEW: Event bus for plugin integration
  - `apps/admin/src/pages/Notifications.tsx` - NEW: Notification center UI
  - `apps/admin/src/pages/Settings/NotificationPreferences.tsx` - NEW: User preferences UI
  - `packages/plugin/src/capabilities/` - MODIFIED: Add queue/notification types
  - `PM2 ecosystem.config.js` - MODIFIED: Add worker process

- **Dependencies added**:
  - `bullmq` - Redis-based job queue
  - `ioredis` - Redis client (may already exist)

- **Infrastructure required**:
  - Redis (already required for cluster coordination)

## Critical Safeguards

1. **Queue Isolation** - Each plugin's jobs are namespaced to prevent conflicts
2. **Rate Limiting** - Prevent plugins from overwhelming the queue
3. **Tenant Scoping** - All notifications are tenant-scoped, no cross-tenant leaks
4. **Graceful Degradation** - If queue unavailable, critical notifications still saved to DB
5. **Template Security** - Variable injection is sanitized to prevent XSS
