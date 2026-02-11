## 1. Dependencies & Setup

- [x] 1.1 Add `bullmq` package to `apps/server/package.json`
- [x] 1.2 Add `ioredis` package (if not already present)
- [x] 1.3 Add queue-related environment variables to `.env.example`
- [x] 1.4 Run `pnpm install` to update lockfile

## 2. Queue Infrastructure

- [x] 2.1 Create `apps/server/src/queue/queue.config.ts` - Redis connection config
- [x] 2.2 Create `apps/server/src/queue/queue.service.ts` - BullMQ service wrapper
- [x] 2.3 Create `apps/server/src/queue/queue.types.ts` - Job type definitions
- [x] 2.4 Create `apps/server/src/queue/queue.module.ts` - NestJS module
- [x] 2.5 Create `apps/server/src/queue/index.ts` - Public exports
- [x] 2.6 Create `apps/server/src/worker.ts` - Worker process entry point
- [x] 2.7 Update `ecosystem.config.js` - Add worker process configuration
- [x] 2.8 Add queue health check endpoint to tRPC

## 3. Event Bus

- [x] 3.1 Create `apps/server/src/events/event-bus.ts` - Core event emitter
- [x] 3.2 Create `apps/server/src/events/event-types.ts` - Event type definitions
- [x] 3.3 Create `apps/server/src/events/index.ts` - Public exports
- [x] 3.4 Document standard events (`notification.created`, etc.)

## 4. Notification Database Schema

- [x] 4.1 Create `apps/server/src/db/schema/notifications.ts` - Notification tables
- [x] 4.2 Create `apps/server/src/db/schema/notification-templates.ts` - Template table
- [x] 4.3 Create `apps/server/src/db/schema/notification-preferences.ts` - Preferences table
- [x] 4.4 Create `apps/server/src/db/schema/notification-channels.ts` - Channels table
- [x] 4.5 Generate Drizzle migration: `pnpm --filter @wordrhyme/server db:generate`
- [x] 4.6 Apply migration to development database
- [x] 4.7 Update `apps/server/src/db/schema/index.ts` exports

## 5. Notification Template Service

- [x] 5.1 Create `apps/server/src/notifications/template.service.ts`
  - `registerTemplate()` - Register new template
  - `getTemplate()` - Get template by key
  - `renderTemplate()` - Render with variables and i18n
  - `listTemplates()` - List available templates
- [x] 5.2 Create system templates seed data
  - `system.welcome` - Welcome notification
  - `comment.new` - New comment notification
  - `mention.user` - User mention notification
  - `invitation.received` - Organization invitation
- [x] 5.3 Add template validation (variable sanitization)

## 6. Notification Preference Service

- [x] 6.1 Create `apps/server/src/notifications/preference.service.ts`
  - `getPreference()` - Get user preference
  - `updatePreference()` - Update user preference
  - `getDefaultPreference()` - Get default preference
  - `shouldSendToChannel()` - Check if should send (quiet hours, enabled)
- [x] 6.2 Implement quiet hours logic with timezone support
- [x] 6.3 Implement email frequency batching logic

## 7. Core Notification Service

- [x] 7.1 Create `apps/server/src/notifications/notification.service.ts`
  - `send()` - Direct notification (no template)
  - `sendFromTemplate()` - Template-based notification
  - `list()` - List user notifications
  - `markAsRead()` - Mark notification as read
  - `markAllAsRead()` - Mark all as read
  - `getUnreadCount()` - Get unread count
  - `archive()` - Archive old notifications
- [x] 7.2 Integrate with event bus (emit `notification.created`)
- [x] 7.3 Integrate with preference service (resolve channels)
- [x] 7.4 Add notification expiry cleanup job

## 8. Channel Registration

- [x] 8.1 Create `apps/server/src/notifications/channel.service.ts`
  - `registerChannel()` - Plugin registers channel
  - `unregisterChannel()` - Plugin unregisters channel
  - `listChannels()` - List available channels
  - `getChannelConfig()` - Get user's channel config
- [x] 8.2 Create default `in-app` channel (always available)
- [x] 8.3 Add channel validation (config schema)

## 9. tRPC API

- [x] 9.1 Create `apps/server/src/trpc/routers/notifications.ts`
  - `notifications.list` - List user notifications
  - `notifications.getUnreadCount` - Get unread count
  - `notifications.markAsRead` - Mark as read
  - `notifications.markAllAsRead` - Mark all as read
  - `notifications.archive` - Archive notification
- [x] 9.2 Create `apps/server/src/trpc/routers/notification-preferences.ts`
  - `notificationPreferences.get` - Get user preferences
  - `notificationPreferences.update` - Update preferences
  - `notificationPreferences.getAvailableChannels` - List channels
  - `notificationPreferences.getTemplates` - List templates
- [x] 9.3 Update `apps/server/src/trpc/router.ts` - Add new routers
- [x] 9.4 Add permission checks (`requireAuth()`)

## 10. Plugin API Integration

- [x] 10.1 Create `packages/plugin/src/capabilities/queue.ts` - Queue capability types
- [x] 10.2 Create `packages/plugin/src/capabilities/notification.ts` - Notification capability types
- [x] 10.3 Update `packages/plugin/src/types.ts` - Add to PluginContext
- [x] 10.4 Update `apps/server/src/plugins/capabilities/` - Implement capabilities
- [x] 10.5 Update PluginContext creation to include queue and event access
- [x] 10.6 Document plugin integration in README

## 11. Admin UI - Notification Center

- [x] 11.1 Create `apps/admin/src/components/NotificationCenter.tsx`
  - Dropdown/popover component
  - Notification list with infinite scroll
  - Unread badge
  - Mark as read action
- [x] 11.2 Create `apps/admin/src/components/NotificationItem.tsx` - Single notification
- [x] 11.3 Add NotificationCenter to Layout header
- [x] 11.4 Add real-time update support (polling or WebSocket in future)

## 12. Admin UI - Notification Preferences

- [x] 12.1 Create `apps/admin/src/pages/Settings/NotificationPreferences.tsx`
  - Channel toggle switches
  - Template-specific overrides (accordion)
  - Quiet hours configuration
  - Email frequency selector
- [x] 12.2 Add link from Settings page to Notification Preferences
- [x] 12.3 Add form validation

## 13. Testing

- [x] 13.1 Create `apps/server/src/__tests__/queue/queue.service.test.ts`
  - Job enqueue and process
  - Retry logic
  - Failed job handling
- [x] 13.2 Create `apps/server/src/__tests__/notifications/notification.service.test.ts`
  - Send notification
  - Template rendering
  - Preference resolution
  - Channel filtering
- [x] 13.3 Create `apps/server/src/__tests__/notifications/template.service.test.ts`
  - Variable interpolation
  - i18n fallback
  - XSS prevention
- [x] 13.4 Create integration test for full notification flow
- [x] 13.5 Run all tests: `pnpm --filter @wordrhyme/server test`

## 14. Type Checking & Cleanup

- [x] 14.1 Run type check: `pnpm --filter @wordrhyme/server type-check`
- [x] 14.2 Run type check: `pnpm --filter @wordrhyme/admin type-check`
- [x] 14.3 Fix any type errors
- [x] 14.4 Update JSDoc comments
- [x] 14.5 Remove unused imports

## 15. Documentation

- [x] 15.1 Create `apps/server/NOTIFICATION_SYSTEM.md` - System documentation
- [x] 15.2 Add notification examples to plugin development guide
- [x] 15.3 Document queue job naming conventions
- [x] 15.4 Document event naming conventions

---

## Dependencies

```
Task 1 (Dependencies)
    │
    ├──► Task 2 (Queue) ──┬──► Task 10 (Plugin API)
    │                     │
    └──► Task 3 (Events) ─┘
              │
              ▼
    Task 4 (Schema)
              │
              ├──► Task 5 (Template Service)
              │
              ├──► Task 6 (Preference Service)
              │
              └──► Task 8 (Channel Service)
                        │
                        ▼
                  Task 7 (Notification Service)
                        │
                        ▼
                  Task 9 (tRPC API)
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
    Task 11 (UI Center)    Task 12 (UI Preferences)
              │                   │
              └─────────┬─────────┘
                        ▼
                  Task 13 (Tests)
                        │
                        ▼
              Task 14 (Type Check)
                        │
                        ▼
               Task 15 (Docs)
```

## Parallelizable Work

- Task 2 (Queue) and Task 3 (Events) can run in parallel after Task 1
- Task 5, 6, 8 can run in parallel after Task 4
- Task 11 and 12 can run in parallel after Task 9
- Task 13.1, 13.2, 13.3 can run in parallel
- Task 14 and 15 can run in parallel after Task 13

## Estimated Scope

- **New Files**: ~25-30 files
- **Modified Files**: ~10 files
- **Database Tables**: 4 new tables
- **tRPC Endpoints**: ~10 new endpoints
- **Admin UI Pages**: 2 new pages/components

## Completion Status

All tasks completed on 2026-01-07.
