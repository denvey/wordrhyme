## Context

WordRhyme CMS 需要邮件发送能力，选择 Resend 作为邮件服务提供商。本设计遵循现有的 Plugin Contract 和 Notification System 架构。

## Goals

1. 提供完整的邮件发送插件，支持在线安装
2. 作为通知系统的邮件渠道，自动发送通知邮件
3. 提供 Admin UI 进行配置和测试

## Non-Goals

1. 不支持 SMTP 协议（仅 Resend API）
2. 暂不支持 i18n 邮件模板（后续迭代）
3. 不支持邮件模板在线编辑（使用代码模板）
4. 不支持邮件统计分析（使用 Resend Dashboard）
5. **不提供独立邮件发送 API**（其他插件必须通过 Core 通知系统发送）

## Decisions

### 1. 插件结构

```
plugins/email-resend/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   ├── server/
│   │   ├── index.ts           # Plugin entry point
│   │   ├── resend.service.ts  # Resend SDK wrapper
│   │   └── channel.handler.ts # Notification channel handler
│   └── admin/
│       ├── index.tsx          # Admin entry point
│       └── components/
│           ├── SettingsPage.tsx
│           └── TestEmailForm.tsx
└── dist/
```

**Rationale**: 遵循 storage-s3 插件的目录结构模式，保持一致性。

### 2. Manifest 设计

```json
{
  "pluginId": "com.wordrhyme.email-resend",
  "version": "0.1.0",
  "name": "Resend Email",
  "description": "Send emails via Resend API",
  "vendor": "WordRhyme",
  "runtime": "node",
  "engines": {
    "wordrhyme": "^0.1.0"
  },
  "capabilities": {
    "ui": { "adminPage": true, "settingsTab": true }
  },
  "server": {
    "entry": "./dist/server/index.js",
    "hooks": ["onEnable", "onDisable"]
  },
  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "menus": [{
      "label": "Email Settings",
      "path": "/plugins/email-resend/settings",
      "icon": "Mail"
    }]
  }
}
```

**Rationale**: 使用标准 manifest 格式，声明必要的 capabilities。

### 3. 设置存储

使用 Settings Capability 存储配置：

| Key | Type | Encrypted | Description |
|-----|------|-----------|-------------|
| `api_key` | string | ✅ | Resend API Key |
| `from_address` | string | ❌ | 默认发件人地址 |
| `from_name` | string | ❌ | 默认发件人名称 |
| `reply_to` | string | ❌ | 默认回复地址 |

**Rationale**: API Key 必须加密存储，其他配置不需要加密。

### 4. 通知渠道集成

1. 在 `onEnable` 中注册渠道：
```typescript
await ctx.notifications?.registerChannel({
  key: 'plugin:com.wordrhyme.email-resend:email',
  name: { 'en-US': 'Email', 'zh-CN': '邮件' },
  icon: 'mail',
});
```

2. 监听 `notification.created` 事件：
```typescript
ctx.notifications?.onNotificationCreated(async (event) => {
  if (event.channels.includes('plugin:com.wordrhyme.email-resend:email')) {
    await sendEmail(event);
  }
});
```

**Rationale**: 遵循 Plugin API Spec 中定义的通知渠道模式。

### 5. 邮件发送服务

使用 Resend Node.js SDK：

```typescript
import { Resend } from 'resend';

export class ResendEmailService {
  private resend: Resend;

  async initialize(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(params: EmailParams): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (error) throw new Error(error.message);
    return data.id;
  }
}
```

### 6. 异步处理

邮件发送通过 Queue 异步处理：

1. 事件监听器仅负责入队
2. Worker 负责实际发送
3. 失败时自动重试（Queue 默认策略）

**Rationale**: 避免阻塞通知创建流程，支持重试机制。

## Alternatives Considered

### 1. 直接在 Core 中实现邮件发送

- ❌ 违反 Modular Monolith 原则
- ❌ Core 不应依赖特定邮件服务商
- ❌ 用户无法选择邮件服务商

### 2. 支持多个邮件服务商

- ❌ MVP 阶段过于复杂
- ❌ 可以后续添加其他邮件插件

### 3. 使用 React Email 模板

- ⚠️ 增加复杂度和依赖
- ⚠️ 可以作为后续迭代添加

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Resend API 故障 | 邮件发送失败 | 重试机制 + 告警 |
| API Key 泄露 | 安全风险 | 加密存储 + 权限控制 |
| 发送频率限制 | 邮件堆积 | Rate limiting + 用户提示 |

## Migration Plan

1. 发布插件到插件市场
2. 用户通过 Admin UI 安装插件
3. 配置 API Key 和发件人信息
4. 用户在通知偏好中启用邮件渠道

**Rollback**: 禁用/卸载插件即可，不影响 Core 功能。

## Open Questions

1. ~~邮件模板是否需要 i18n 支持？~~ → 暂不支持，后续迭代
2. ~~是否需要邮件发送日志？~~ → 使用 Core Observability
3. ~~是否需要 Webhook 接收邮件状态？~~ → MVP 不需要
4. ~~邮件内容格式？~~ → 纯文本（使用 notification.title 和 notification.message）
5. ~~重试策略？~~ → 3 次重试，指数退避
6. ~~测试邮件权限？~~ → 需要 settings.write 权限

---

## Resolved Technical Parameters (Zero-Decision)

以下参数已确定，实施时直接使用：

### Resend SDK Integration
```typescript
// 初始化
import { Resend } from 'resend';
const resend = new Resend(apiKey);

// 发送（纯文本格式）
await resend.emails.send({
  from: `${fromName} <${fromAddress}>`,  // e.g., "WordRhyme <noreply@example.com>"
  to: userEmail,
  subject: notification.title,
  text: notification.message,
  // 不使用 html 参数（MVP）
});
```

### Queue Job Configuration
```typescript
await ctx.queue.addJob('send_email', payload, {
  priority: 'normal',
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 2s, 4s
  },
  removeOnComplete: true,
  removeOnFail: false,  // 保留失败记录用于调试
});
```

### Permission Definitions (manifest.json)
```json
{
  "permissions": {
    "definitions": [
      { "key": "settings.read", "description": "View email settings" },
      { "key": "settings.write", "description": "Modify email settings" },
      { "key": "test.send", "description": "Send test emails" }
    ]
  }
}
```

**权限说明**:
- `settings.read`: 查看 API Key（masked）、发件人地址等配置
- `settings.write`: 修改配置并保存
- `test.send`: 发送测试邮件（独立权限，可单独授予）
- 组织 Owner 自动拥有所有权限（Core 权限系统保证）

### Admin UI Form Validation
```typescript
// Zod schema for settings form
const settingsSchema = z.object({
  api_key: z.string().min(1).startsWith('re_'),
  from_address: z.string().email(),
  from_name: z.string().min(1).max(100).default('WordRhyme'),
  reply_to: z.string().email().optional().or(z.literal('')),
});
```

### Error Handling Pattern
```typescript
try {
  const { data, error } = await resend.emails.send(params);
  if (error) {
    logger.error('Resend API error', {
      error: error.message,
      notificationId,
      // NEVER log API key
    });
    throw new ResendError(error.message);
  }
  logger.info('Email sent', { emailId: data.id, notificationId });
} catch (err) {
  // Let queue handle retry
  throw err;
}
```

