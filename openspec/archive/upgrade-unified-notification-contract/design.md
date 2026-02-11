## Context

当前通知系统基于简单的 Inbox 模式，适合 SaaS 业务通知。但随着产品演进，需要支持 Social 社交互动场景（点赞、评论、@提及等），这类通知具有高频、低价值单条、需要聚合的特点。

本设计采用 **"Actor - Action - Object" (主-谓-宾)** 模式，并预留 **Aggregation (聚合)** 字段，实现 SaaS + Social 统一 Contract。

## Goals / Non-Goals

### Goals
- 统一数据模型，前端不需要写两套列表逻辑
- 兼容现有 SaaS 通知，无破坏性变更
- 支持 Social 聚合（"张三等5人点赞"）
- View Strategy 抽象，支持不同展示策略
- 插件可安全扩展，不破坏系统语义

### Non-Goals
- 实时推送（WebSocket）- 后续迭代
- 插件自定义 UI 渲染
- 跨租户通知

---

## Decisions

### Decision 1: NotificationType 强枚举

**选择**: 使用强枚举而非自由字符串

```typescript
enum NotificationType {
  // System / SaaS
  SYSTEM_ALERT = 'system_alert',
  SYSTEM_WARNING = 'system_warning',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  EXPORT_READY = 'export_ready',

  // Collaboration
  COMMENT_ADDED = 'comment_added',
  COMMENT_REPLIED = 'comment_replied',
  MENTIONED = 'mentioned',

  // Social (预埋)
  POST_LIKED = 'post_liked',
  POST_COMMENTED = 'post_commented',
  USER_FOLLOWED = 'user_followed',
}
```

**理由**:
- 防止插件随意注册类型污染系统
- 便于前端根据类型渲染不同 UI
- 便于 View Strategy 判断聚合规则

**替代方案**: 自由字符串 + 前缀约定 → 拒绝，难以维护

### Decision 2: View Strategy 抽象

**选择**: 策略模式，数据层统一，视图层可变

```typescript
type NotificationViewStrategy = {
  id: 'inbox' | 'social-feed'
  isVisible(n: Notification, ctx: ViewContext): boolean
  priority(n: Notification): number
  canGroup(n: Notification): boolean
  groupKey?(n: Notification): string
}
```

**理由**:
- SaaS 和 Social 的展示逻辑差异大
- 策略可组合、可切换
- 不污染数据模型

### Decision 3: 聚合在后端完成

**选择**: 后端返回聚合后的数据，前端直接渲染

**理由**:
- 减少前端复杂度
- 聚合逻辑统一，避免前后端不一致
- 便于分页和性能优化

### Decision 4: Actor-Action-Object 结构

**选择**: API 返回结构遵循 Actor-Action-Object 模式

```typescript
interface NotificationItem {
  id: string
  type: NotificationType

  // Actor - 谁触发的
  actor: {
    id: string
    type: 'user' | 'system'
    name: string
    avatarUrl?: string
  }

  // Action - 做了什么（已渲染）
  title: string
  body?: string

  // Object - 目标对象
  target: {
    type: string
    id: string
    url: string
    previewImage?: string
  }

  // Aggregation - 聚合信息
  groupInfo?: {
    key: string
    count: number
    latestActors?: string[]
  }
}
```

---

## Critical Design Decisions (已确认)

### Decision 5: 聚合通知的已读状态

**结论**: 点击聚合通知 → 使用 `groupKey` 批量标记组内所有通知为已读

**核心原则**:
- 聚合只是 View 层，已读状态属于每一条原始通知
- 只影响当前聚合内的可见通知，不影响未来新增通知
- 状态可解释、可回放

**实现规则**:
```typescript
// 当用户点击聚合通知
async function markGroupAsRead(groupKey: string, userId: string, tenantId: string) {
  await db.update(notifications)
    .set({ read: true })
    .where(and(
      eq(notifications.groupKey, groupKey),
      eq(notifications.userId, userId),
      eq(notifications.tenantId, tenantId),
      eq(notifications.read, false),
      eq(notifications.archived, false)
    ));
}
```

**UX 行为**:
- 展示：「Alice 和其他 4 人赞了你的帖子」
- 点击后：进入帖子，聚合通知消失
- 新点赞：再次出现新的聚合通知（正常）

### Decision 6: 通知保留策略（分层 TTL）

**结论**: 按类别分层，不同类型不同保留时长

| 类别 | 类型示例 | 保留时长 | 理由 |
|------|---------|---------|------|
| **System** | 系统警告、任务完成、导出完成 | **永久** | 高价值，需要追溯 |
| **Collaboration** | @提及、评论回复 | **30天** | 中价值，用户可能休假 |
| **Social** | 点赞、关注 | **7天** | 低价值，48小时后价值骤降 |

**实现**:
```typescript
type RetentionPolicy = {
  category: NotificationCategory
  retentionDays: number | 'forever'
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  { category: 'system', retentionDays: 'forever' },
  { category: 'collaboration', retentionDays: 30 },
  { category: 'social', retentionDays: 7 },
]
```

**清理规则**:
- 每天 Cron Job 清理过期的**已读**通知
- **未读**通知额外保留 7 天（防止用户流失）
- 物理删除或归档到 `notifications_archive` 表

### Decision 7: 排序策略（时间倒序 + 视觉权重）

**结论**: 严格时间倒序，用视觉样式区分重要性

**为什么不��优先级排序**:
- 时间乱序会让用户困惑（"刚才明明有新消息，怎么顶上是昨天的？"）
- 时间倒序是最可预测的排序方式
- Tab 筛选可以解决优先级问题

**排序规则**:
```typescript
// NotificationCenter 排序
ORDER BY
  pinned DESC,           -- 置顶优先
  read ASC,              -- 未读优先
  created_at DESC        -- 时间倒序
```

**视觉权重配置**:
```typescript
type NotificationDisplayConfig = {
  type: NotificationType
  visualPriority: 'high' | 'medium' | 'low'
  iconColor: string
  backgroundColor: {
    unread: string
    read: string
  }
  canPin: boolean  // 是否支持置顶（仅 System 类）
}

const DISPLAY_CONFIGS: NotificationDisplayConfig[] = [
  // 高优 - 彩色图标，高亮背景
  { type: 'mentioned', visualPriority: 'high', iconColor: 'blue', canPin: false },
  { type: 'comment_replied', visualPriority: 'high', iconColor: 'green', canPin: false },

  // 中优 - 彩色图标，普通背景
  { type: 'comment_added', visualPriority: 'medium', iconColor: 'gray', canPin: false },

  // 低优 - 灰色图标，弱化背景
  { type: 'post_liked', visualPriority: 'low', iconColor: 'gray', canPin: false },
  { type: 'user_followed', visualPriority: 'low', iconColor: 'gray', canPin: false },

  // System - 支持置顶
  { type: 'system_alert', visualPriority: 'high', iconColor: 'red', canPin: true },
  { type: 'system_warning', visualPriority: 'high', iconColor: 'orange', canPin: true },
]
```

**置顶规则**:
- 仅 System 类紧急通知支持置顶（账单逾期、安全警告）
- 置顶通知始终显示在列表最上方
- 用户可手动关闭置顶

---

## Plugin Notification Contract (Decision 8)

### 设计原则

**核心理念**: 插件只负责"发送意图"，平台负责"执行策略"

```
插件 → 声明能力 + 发送请求 → 平台 → 聚合/限流/渲染/清理
```

### Plugin Manifest 声明

```typescript
// plugin.json
{
  "id": "my-plugin",
  "notifications": {
    // 声明插件可发送的通知类型
    "types": [
      {
        "id": "task_reminder",
        "category": "collaboration",  // 决定保留策略
        "aggregation": "none",        // 聚合策略枚举
        "i18n": {
          "en-US": { "title": "Task Reminder", "description": "..." },
          "zh-CN": { "title": "任务提醒", "description": "..." }
        }
      },
      {
        "id": "content_liked",
        "category": "social",
        "aggregation": "by_target",   // 按目标聚合
        "i18n": {
          "en-US": { "title": "Content Liked", "description": "..." },
          "zh-CN": { "title": "内容被点赞", "description": "..." }
        }
      }
    ],
    // 权限声明
    "permissions": ["notification:send"],
    // 限流配置（平台可覆盖）
    "rateLimit": {
      "maxPerMinute": 100,
      "maxPerDay": 10000
    }
  }
}
```

### 聚合策略枚举 (AggregationStrategy)

**选择**: 使用预定义枚举，不允许插件自定义聚合规则

```typescript
enum AggregationStrategy {
  NONE = 'none',              // 不聚合（默认）
  BY_TARGET = 'by_target',    // 按目标聚合（如：多人点赞同一帖子）
  BY_ACTOR = 'by_actor',      // 按发起者聚合（如：某人的多个操作）
  BY_TYPE = 'by_type',        // 按类型聚合（如：多个系统通知）
}
```

**理由**:
- 聚合逻辑复杂，涉及 groupKey 生成、latestActors 维护、已读语义
- 插件自定义聚合规则会导致不可预测的行为
- 平台统一实现，保证一致性和性能

### Plugin Send API

```typescript
// 插件发送通知的 API
interface PluginNotificationAPI {
  send(params: {
    type: string              // 必须是 manifest 中声明的类型
    userId: string            // 目标用户
    actor?: {                 // 触发者（可选，默认为插件）
      id: string
      type: 'user' | 'plugin'
      name: string
      avatarUrl?: string
    }
    target: {                 // 目标对象
      type: string
      id: string
      url: string
      previewImage?: string
    }
    data?: Record<string, unknown>  // 自定义数据（用于模板渲染）
  }): Promise<{ notificationId: string }>
}
```

### 平台自动处理

插件调用 `send()` 后，平台自动完成：

| 职责 | 平台处理 | 插件不可控 |
|------|---------|-----------|
| 类型验证 | 检查 type 是否在 manifest 中声明 | ✓ |
| 限流检查 | 检查是否超过 rateLimit | ✓ |
| groupKey 生成 | 根据 aggregation 策略自动生成 | ✓ |
| latestActors 维护 | 自动更新聚合通知的 actors 列表 | ✓ |
| 保留策略 | 根据 category 自动设置 TTL | ✓ |
| 视觉权重 | 根据 category 自动设置 visualPriority | ✓ |
| ��染模板 | 使用 i18n 配置渲染 title/body | ✓ |

### 事件回调 (Async Webhook)

**选择**: 异步 Webhook，不使用同步回调

```typescript
// plugin.json
{
  "notifications": {
    "webhooks": {
      // 通知被点击时的回调（异步）
      "onClicked": "https://my-plugin.com/webhooks/notification-clicked",
      // 通知被归档时的回调（异步）
      "onArchived": "https://my-plugin.com/webhooks/notification-archived"
    }
  }
}
```

**Webhook Payload**:
```typescript
interface NotificationWebhookPayload {
  event: 'clicked' | 'archived'
  notificationId: string
  userId: string
  tenantId: string
  type: string
  target: { type: string; id: string }
  timestamp: string
}
```

**理由**:
- 同步回调会阻塞用户操作
- 异步 Webhook 解耦插件和平台
- 插件可以选择性处理（如：更新内部状态）

### 限流与熔断

```typescript
// 平台限流配置
interface PluginRateLimitConfig {
  // 插件级别限流
  perPlugin: {
    maxPerMinute: number      // 默认 100
    maxPerHour: number        // 默认 1000
    maxPerDay: number         // 默认 10000
  }
  // 用户级别限流（防止骚扰）
  perUser: {
    maxPerMinute: number      // 默认 10
    maxPerHour: number        // 默认 50
  }
  // 熔断配置
  circuitBreaker: {
    failureThreshold: number  // 连续失败次数触发熔断
    cooldownSeconds: number   // 熔断冷却时间
  }
}
```

**限流响应**:
```typescript
// 超过限流时返回
{
  error: 'RATE_LIMIT_EXCEEDED',
  retryAfter: 60,  // 秒
  limit: { remaining: 0, reset: '2024-01-01T00:01:00Z' }
}
```

### 权限模型

```typescript
// 插件通知权限
type PluginNotificationPermission =
  | 'notification:send'           // 发送通知
  | 'notification:send:batch'     // 批量发送（需要额外审批）
  | 'notification:read:own'       // 读取自己发送的通知状态
```

**权限检查流程**:
1. 检查插件是否声明了 `notification:send` 权限
2. 检查插件是否在当前租户启用
3. 检查目标用户是否在当前租户
4. 检查限流配额

### Hard Ban（插件禁止行为）

| 禁止行为 | 理由 |
|---------|------|
| 自定义聚合规则 | 聚合逻辑复杂，平台统一处理 |
| 修改其他插件的通知 | 数据隔离 |
| 绕过限流 | 防止滥用 |
| 发送未声明的类型 | 类型安全 |
| 同步阻塞回调 | 性能保护 |
| 跨租户发送 | 租户隔离 |
| 修改系统通知 | 系统通知由平台管理 |

---

## Database Schema Changes

```sql
-- 新增字段
ALTER TABLE notifications ADD COLUMN source TEXT DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN category TEXT DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN latest_actors JSONB DEFAULT '[]';
ALTER TABLE notifications ADD COLUMN pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN visual_priority TEXT DEFAULT 'medium';

-- 新增索引
CREATE INDEX idx_notifications_category ON notifications(category);
CREATE INDEX idx_notifications_source ON notifications(source);
CREATE INDEX idx_notifications_pinned ON notifications(pinned) WHERE pinned = TRUE;
CREATE INDEX idx_notifications_cleanup ON notifications(category, read, created_at);
```

---

## Notification Read Semantics

### 单条通知已读
```typescript
// 点击单条通知
markAsRead(notificationId)
```

### 聚合通知已读
```typescript
// 点击聚合通知 → 批量标记
markGroupAsRead(groupKey)
```

### 全部已读
```typescript
// 点击"全部已读"
markAllAsRead(userId, tenantId, { category?: string })
```

### 未读数计算
```typescript
// Badge 显示的未读数
const unreadCount = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(notifications)
  .where(and(
    eq(notifications.userId, userId),
    eq(notifications.tenantId, tenantId),
    eq(notifications.read, false),
    eq(notifications.archived, false)
  ));

// 聚合后的未读数（用于 Social Feed）
const groupedUnreadCount = await db
  .select({ count: sql<number>`count(DISTINCT group_key)::int` })
  .from(notifications)
  .where(and(
    eq(notifications.userId, userId),
    eq(notifications.tenantId, tenantId),
    eq(notifications.read, false),
    eq(notifications.archived, false),
    isNotNull(notifications.groupKey)
  ));
```

---

## Retention & Cleanup Job

### Cron Job 配置
```typescript
// 每天凌晨 3 点执行
@Cron('0 3 * * *')
async cleanupExpiredNotifications() {
  const now = new Date();

  for (const policy of RETENTION_POLICIES) {
    if (policy.retentionDays === 'forever') continue;

    const cutoffDate = subDays(now, policy.retentionDays);
    const unreadCutoffDate = subDays(now, policy.retentionDays + 7); // 未读额外保留7天

    // 删除已读的过期通知
    await db.delete(notifications).where(and(
      eq(notifications.category, policy.category),
      eq(notifications.read, true),
      lt(notifications.createdAt, cutoffDate)
    ));

    // 删除未读但超过额外保留期的通知
    await db.delete(notifications).where(and(
      eq(notifications.category, policy.category),
      eq(notifications.read, false),
      lt(notifications.createdAt, unreadCutoffDate)
    ));
  }
}
```

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 聚合查询性能 | 使用 group_key 索引，限制聚合数量 |
| 类型枚举膨胀 | 严格审核新类型，插件只能用 plugin:* 前缀 |
| 前端兼容性 | 保持现有字段，新字段可选 |
| 清理 Job 性能 | 分批删除，避免长事务 |
| 置顶滥用 | 仅 System 类支持，需要权限 |

---

## Migration Plan

1. **Phase 1**: 添加新字段，保持向后兼容
2. **Phase 2**: 实现 View Strategy，默认使用 InboxStrategy
3. **Phase 3**: 实现保留策略和清理 Job
4. **Phase 4**: 前端支持新 Contract（视觉权重、置顶）
5. **Phase 5**: 迁移现有数据（设置 source/category）

---

## Summary

| 问题 | 决策 |
|------|------|
| 聚合已读 | 点击聚合 → `groupKey` 批量标记已读 |
| 保留时长 | System 永久 / Collaboration 30天 / Social 7天 |
| 排序方式 | 时间倒序 + 视觉权重 + Tab 筛选 + 置顶 |
| 插件通知 | 声明式 Manifest + 平台统一处理 + 异步 Webhook |
| 聚合策略 | 预定义枚举（none/by_target/by_actor/by_type），不允许自定义 |
| 限流熔断 | 插件级 + 用户级双重限流，熔断保护 |
