# Change: Upgrade to Unified Notification Contract

## Why

当前通知系统仅支持 SaaS 业务通知（Inbox 模式），无法满足未来 Social 社交互动场景的需求。需要设计一个统一的 Notification Contract，同时支持：
- **SaaS 通知**：强可追溯、Inbox/Archive、管理型行为
- **Social 通知**：高频低价值、强聚合、快速感知

核心原则：**数据层统一，视图层可变**

## What Changes

### 1. 数据模型升级
- **ADDED** `NotificationType` 强枚举（替代简单的 info/success/warning/error）
- **ADDED** `source` 字段区分来源（system/plugin/user）
- **ADDED** `category` 字段区分类别（system/collaboration/social）
- **MODIFIED** `groupKey` 支持社交聚合（如 "张三等5人点赞"）
- **ADDED** `latestActors` 字段存储最近互动用户（用于堆叠头像）

### 2. View Strategy 抽象层
- **ADDED** `NotificationViewStrategy` 接口
- **ADDED** `InboxStrategy` - SaaS 默认策略（当前行为）
- **ADDED** `SocialFeedStrategy` - 社交策略（聚合、时效、优先级）

### 3. API Contract 升级
- **MODIFIED** `notification.list` 支持 strategy 参数
- **ADDED** `notification.listGrouped` 返回聚合后的通知
- **MODIFIED** 返回结构增加 `actor`、`target`、`group_info` 字段

### 4. 前端组件升级
- **MODIFIED** `NotificationCenter` 支持 strategy 切换
- **MODIFIED** `NotificationItem` 支持聚合显示和堆叠头像
- **ADDED** `Notifications` 页面支持多 Tab 筛选

## Impact

- Affected specs: notification-system (new)
- Affected code:
  - `apps/server/src/db/schema/notifications.ts`
  - `apps/server/src/notifications/notification.service.ts`
  - `apps/server/src/trpc/routers/notifications.ts`
  - `apps/admin/src/components/NotificationCenter.tsx`
  - `apps/admin/src/components/NotificationItem.tsx`
  - `apps/admin/src/pages/Notifications.tsx`

## Non-Goals (v1)

- 插件自定义 NotificationCenter UI
- 插件决定通知展示时效
- 插件绕过 View Strategy
- 实时推送（WebSocket）- 后续迭代
