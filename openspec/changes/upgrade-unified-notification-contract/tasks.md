## 1. Database Schema

- [x] 1.1 Add `source` field to notifications table (system/plugin/user)
- [x] 1.2 Add `category` field to notifications table (system/collaboration/social)
- [x] 1.3 Add `latest_actors` JSONB field for aggregation
- [x] 1.4 Add `pinned` boolean field for system alerts
- [x] 1.5 Add `visual_priority` field (high/medium/low)
- [x] 1.6 Create migration file with new indexes
- [x] 1.7 Update Drizzle schema types

## 2. NotificationType Enum & Constants

- [x] 2.1 Create `NotificationType` enum with all types (system/collaboration/social)
- [x] 2.2 Create `NotificationCategory` enum
- [x] 2.3 Create `RETENTION_POLICIES` constant
- [x] 2.4 Create `DISPLAY_CONFIGS` constant for visual priority
- [x] 2.5 Create type guards and validation functions
- [x] 2.6 Add plugin type registration mechanism

## 3. View Strategy System

- [x] 3.1 Define `NotificationViewStrategy` interface
- [x] 3.2 Implement `InboxStrategy` (current behavior, no aggregation)
- [x] 3.3 Implement `SocialFeedStrategy` (aggregation, time-based visibility)
- [x] 3.4 Create strategy registry and factory
- [x] 3.5 Add strategy selection to list API

## 4. Aggregation Logic

- [x] 4.1 Implement `groupKey` generation logic
- [x] 4.2 Implement `latestActors` tracking on notification creation
- [x] 4.3 Create `listGrouped` query with aggregation
- [x] 4.4 Implement aggregated title generation ("Alice and 4 others...")
- [x] 4.5 Add aggregation count limit (99+)

## 5. Read Semantics

- [x] 5.1 Update `markAsRead` to support single notification
- [x] 5.2 Add `markGroupAsRead` for aggregated notifications
- [x] 5.3 Update `markAllAsRead` to support category filter
- [x] 5.4 Implement unread count calculation (raw vs grouped)
- [x] 5.5 Add tests for read semantics

## 6. Retention & Cleanup

- [x] 6.1 Create `NotificationCleanupService` (implemented in NotificationService)
- [x] 6.2 Implement category-based retention logic
- [x] 6.3 Add grace period for unread notifications (+7 days)
- [x] 6.4 Create Cron job for daily cleanup (3 AM)
- [x] 6.5 Add batch deletion to avoid long transactions
- [x] 6.6 Add cleanup metrics/logging

## 7. Sorting & Pinning

- [x] 7.1 Update list query with new sort order (pinned, read, created_at)
- [x] 7.2 Add `pin` mutation for system notifications
- [x] 7.3 Add `unpin` mutation
- [x] 7.4 Restrict pinning to system category only

## 8. Backend API Updates

- [x] 8.1 Update `notification.list` to support strategy parameter
- [x] 8.2 Add `notification.listGrouped` endpoint
- [x] 8.3 Update response structure with actor/target/groupInfo
- [x] 8.4 Add `notification.markGroupAsRead` endpoint
- [x] 8.5 Add `notification.pin` / `notification.unpin` endpoints
- [x] 8.6 Add category filter to list endpoints
- [x] 8.7 Add unit tests for new endpoints

## 9. Frontend Components

- [x] 9.1 Create `NotificationDisplayConfig` type
- [x] 9.2 Update `NotificationItem` with visual priority styles
- [x] 9.3 Add `StackedAvatars` component for aggregation
- [x] 9.4 Update `NotificationCenter` to handle grouped notifications
- [x] 9.5 Add pinned notification display at top
- [x] 9.6 Update `Notifications` page with category tabs (replaced with "只看未读" toggle and pinned/timeline sections)
- [x] 9.7 Add preview image support for social notifications

## 10. Data Migration

- [x] 10.1 Write migration script for existing notifications
- [x] 10.2 Set default source='system' for existing data
- [x] 10.3 Set default category='system' for existing data
- [ ] 10.4 Verify migration in staging

## 11. Testing

- [x] 11.1 Test aggregation logic
- [x] 11.2 Test group read semantics
- [x] 11.3 Test retention cleanup job
- [x] 11.4 Test visual priority rendering
- [x] 11.5 Test pinning functionality
- [x] 11.6 Integration test for full flow

## 12. Documentation

- [x] 12.1 Update API documentation
- [x] 12.2 Add plugin notification guide
- [x] 12.3 Document retention policies
- [x] 12.4 Document visual priority configuration

## 13. Plugin Notification Contract

- [x] 13.1 Define `AggregationStrategy` enum (none/by_target/by_actor/by_type)
- [x] 13.2 Create plugin manifest notification schema validation
- [x] 13.3 Implement `PluginNotificationAPI.send()` method
- [x] 13.4 Add `source_plugin_id` field to notifications table
- [x] 13.5 Implement groupKey auto-generation based on aggregation strategy
- [x] 13.6 Add plugin type validation against manifest

## 14. Plugin Rate Limiting

- [x] 14.1 Create `PluginRateLimitService`
- [x] 14.2 Implement per-plugin rate limiting (100/min, 1000/hour, 10000/day)
- [x] 14.3 Implement per-user rate limiting (10/min, 50/hour)
- [x] 14.4 Add rate limit response with retryAfter
- [x] 14.5 Implement circuit breaker for repeated failures
- [x] 14.6 Add rate limit metrics/logging

## 15. Plugin Webhooks

- [x] 15.1 Define webhook payload schema
- [x] 15.2 Implement async webhook dispatcher
- [x] 15.3 Add onClicked webhook trigger
- [x] 15.4 Add onArchived webhook trigger
- [x] 15.5 Implement retry with exponential backoff
- [x] 15.6 Add webhook delivery logging

## 16. Plugin Permissions

- [x] 16.1 Define `notification:send` permission
- [x] 16.2 Define `notification:send:batch` permission
- [x] 16.3 Define `notification:read:own` permission
- [x] 16.4 Implement permission checks in send API
- [x] 16.5 Add tenant/user validation for plugin notifications

## 17. Plugin Testing

- [x] 17.1 Test plugin manifest validation
- [x] 17.2 Test aggregation strategy groupKey generation
- [x] 17.3 Test rate limiting enforcement
- [x] 17.4 Test webhook delivery
- [x] 17.5 Test permission checks
- [x] 17.6 Integration test for plugin notification flow

---

## Dependencies

```
Task 1 (Schema)
    │
    ├──► Task 2 (Types/Constants)
    │         │
    │         ├──► Task 3 (View Strategy)
    │         │
    │         ├──► Task 4 (Aggregation)
    │         │
    │         ├──► Task 6 (Retention)
    │         │
    │         └──► Task 13 (Plugin Contract)
    │                   │
    │                   ├──► Task 14 (Rate Limiting)
    │                   │
    │                   ├──► Task 15 (Webhooks)
    │                   │
    │                   └──► Task 16 (Permissions)
    │                             │
    │                             └──► Task 17 (Plugin Testing)
    │
    └──► Task 5 (Read Semantics)
              │
              └──► Task 7 (Sorting/Pinning)
                        │
                        └──► Task 8 (Backend API)
                                  │
                                  └──► Task 9 (Frontend)
                                            │
                                            └──► Task 10 (Migration)
                                                      │
                                                      └──► Task 11 (Testing)
                                                                │
                                                                └──► Task 12 (Docs)
```

## Summary of Key Decisions

| 问题 | 决策 |
|------|------|
| 聚合已读 | 点击聚合 → `groupKey` 批量标记已读 |
| 保留时长 | System 永久 / Collaboration 30天 / Social 7天 |
| 排序方式 | 时间倒序 + 视觉权重 + Tab 筛选 + 置顶 |
| 插件通知 | 声明式 Manifest + 平台统一处理 + 异步 Webhook |
| 聚合策略 | 预定义枚举（none/by_target/by_actor/by_type），不允许自定义 |
| 限流熔断 | 插件级 + 用户级双重限流，熔断保护 |
