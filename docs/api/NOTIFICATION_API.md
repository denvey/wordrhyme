# Notification API

> 通知系统 API 文档

## 概述

Notification API 提供统一的通知管理功能，支持 SaaS 和社交场景，包含模板驱动通知、多渠道投递、分组聚合和用户偏好设置。

## 基础信息

- **路由前缀**: `trpc.notifications.*`
- **认证**: 需要登录（protectedProcedure）
- **多租户**: 通知自动绑定到当前租户

---

## 核心概念

### 通知类别

| 类别 | 说明 | 典型场景 |
|------|------|----------|
| `system` | 系统通知 | 安全警告、账单提醒、系统公告 |
| `collaboration` | 协作通知 | 任务分配、评论回复、审批请求 |
| `social` | 社交通知 | 点赞、关注、分享 |

### 通知类型

| 类型 | 颜色 | 用途 |
|------|------|------|
| `info` | 蓝色 | 一般信息 |
| `success` | 绿色 | 操作成功 |
| `warning` | 黄色 | 警告提示 |
| `error` | 红色 | 错误告警 |

### 通知优先级

| 优先级 | 说明 |
|--------|------|
| `low` | 低优先级，可延迟处理 |
| `normal` | 正常优先级 |
| `high` | 高优先级，优先展示 |
| `urgent` | 紧急，立即通知所有渠道 |

---

## API 端点

### notifications.list

列出当前用户的通知

```typescript
// 请求
{
  strategy?: 'inbox' | 'social-feed';  // 展示策略
  category?: 'system' | 'collaboration' | 'social';  // 类别过滤
  unreadOnly?: boolean;      // 仅未读
  includeArchived?: boolean; // 包含已归档
  limit?: number;            // 每页数量，默认 20，最大 100
  cursor?: string;           // 分页游标
}

// 响应
{
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    link: string | null;
    isRead: boolean;
    isPinned: boolean;
    isArchived: boolean;
    category: 'system' | 'collaboration' | 'social';
    groupKey: string | null;
    actorId: string | null;
    entityId: string | null;
    entityType: string | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

**示例**:
```typescript
// 获取未读系统通知
const result = await trpc.notifications.list.query({
  category: 'system',
  unreadOnly: true,
  limit: 20,
});

result.notifications.forEach(n => {
  console.log(`[${n.type}] ${n.title}`);
  console.log(`  ${n.message}`);
});
```

---

### notifications.listGrouped

列出分组聚合的通知

> 适用于社交场景，将同类通知聚合展示（如 "张三等 5 人点赞了你的文章"）。

```typescript
// 请求
{
  strategy?: 'inbox' | 'social-feed';
  category?: 'system' | 'collaboration' | 'social';
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

// 响应
{
  groups: Array<{
    groupKey: string;
    latestNotification: Notification;
    count: number;
    unreadCount: number;
    actors: string[];         // 相关用户 ID 列表
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

**示例**:
```typescript
const result = await trpc.notifications.listGrouped.query({
  category: 'social',
});

result.groups.forEach(group => {
  if (group.count > 1) {
    console.log(`${group.actors[0]} 等 ${group.count} 人 ${group.latestNotification.title}`);
  } else {
    console.log(group.latestNotification.title);
  }
});
```

---

### notifications.get

获取单个通知详情

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  isPinned: boolean;
  isArchived: boolean;
  category: string;
  priority: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
}
```

---

### notifications.markAsRead

标记通知为已读

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  isRead: true;
  readAt: Date;
}
```

---

### notifications.markAllAsRead

标记所有通知为已读

```typescript
// 请求
{
  category?: 'system' | 'collaboration' | 'social';  // 可选类别过滤
}

// 响应
{
  count: number;             // 标记数量
}
```

**示例**:
```typescript
// 标记所有通知为已读
const result = await trpc.notifications.markAllAsRead.mutate();
console.log(`已标记 ${result.count} 条通知为已读`);

// 仅标记社交通知
const social = await trpc.notifications.markAllAsRead.mutate({
  category: 'social',
});
```

---

### notifications.markGroupAsRead

标记分组内所有通知为已读

```typescript
// 请求
{
  groupKey: string;
}

// 响应
{
  count: number;
}
```

---

### notifications.archive

归档通知

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  isArchived: true;
}
```

---

### notifications.unreadCount

获取未读数量

```typescript
// 请求
// 无参数

// 响应
{
  count: number;             // 原始未读数
  groupedCount: number;      // 分组后未读数
}
```

**示例**:
```typescript
const { count, groupedCount } = await trpc.notifications.unreadCount.query();

// 用于通知图标角标
console.log(`未读: ${count} 条 (${groupedCount} 组)`);
```

---

### notifications.pin

置顶通知

> 仅系统类别通知可置顶。

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  isPinned: true;
}
```

---

### notifications.unpin

取消置顶

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  isPinned: false;
}
```

---

### notifications.create

创建通知（内部使用）

```typescript
// 请求
{
  userId: string;            // 接收用户 ID
  templateKey: string;       // 模板键
  variables: Record<string, unknown>;  // 模板变量
  type?: 'info' | 'success' | 'warning' | 'error';
  link?: string;             // 跳转链接
  actorId?: string;          // 发起者 ID
  entityId?: string;         // 关联实体 ID
  entityType?: string;       // 关联实体类型
  groupKey?: string;         // 分组键
  idempotencyKey?: string;   // 幂等键
  priorityOverride?: 'low' | 'normal' | 'high' | 'urgent';
  channelOverrides?: string[];  // 渠道覆盖
  locale?: string;           // 语言
}

// 响应
{
  id: string;
  // ... 完整通知对象
}
```

---

### notifications.sendTest

发送测试通知

```typescript
// 请求
{
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  toAllMembers?: boolean;    // 发送给所有成员
}

// 响应
{
  success: true;
  count: number;
  notifications: Array<{
    userId: string;
    notificationId: string;
  }>;
}
```

---

## 展示策略

### inbox

传统收件箱模式：
- 按时间倒序
- 未读置顶
- 适合 SaaS 场景

### social-feed

社交动态模式：
- 分组聚合同类通知
- 展示参与者头像
- 适合社交场景

---

## 通知模板

通知通过模板驱动，支持多语言：

```typescript
// 模板定义示例
{
  key: 'content.published',
  category: 'system',
  priority: 'normal',
  title: {
    'en-US': '{{title}} has been published',
    'zh-CN': '《{{title}}》已发布',
  },
  message: {
    'en-US': 'Your content is now live.',
    'zh-CN': '您的内容已上线。',
  },
}
```

---

## 多渠道投递

通知可通过多个渠道投递：

| 渠道 | 说明 |
|------|------|
| `in-app` | 应用内通知 |
| `email` | 邮件通知 |
| `push` | 推送通知 |
| `sms` | 短信通知 |
| `webhook` | Webhook 回调 |

渠道由模板优先级和用户偏好决定。

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | 缺少租户上下文 |
| `NOT_FOUND` | 通知不存在 |

---

## 最佳实践

1. **使用模板**: 始终通过模板创建通知，便于多语言和一致性
2. **合理分组**: 使用 `groupKey` 聚合同类通知
3. **设置优先级**: 根据重要性设置优先级
4. **幂等键**: 使用 `idempotencyKey` 避免重复通知
5. **关联实体**: 设置 `entityId` 和 `entityType` 便于跳转
6. **尊重偏好**: 检查用户渠道偏好设置

