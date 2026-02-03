# Change: Add Resend Email Sending Plugin

## Why

WordRhyme CMS 目前缺少邮件发送能力。Resend 是一个现代化的开发者友好的邮件 API，支持 HTML/Text 邮件、附件、React Email 模板等功能。

通过开发 Resend 邮件插件，可以：
1. 作为 Core 通知系统的邮件发送渠道（当创建通知时自动发送邮件）
2. 提供独立的邮件发送能力，供其他插件或 Core 直接调用
3. 支持在线安装和配置，无需修改 Core 代码

## What Changes

### 新增插件：`plugins/email-resend`

- **插件标识**: `com.wordrhyme.email-resend`
- **版本**: `0.1.0`
- **类型**: Full-stack (server + admin)

### 核心能力

1. **通知邮件渠道** (Notification Channel)
   - 注册 `plugin:com.wordrhyme.email-resend:email` 渠道
   - 监听 `notification.created` 事件
   - 当用户启用邮件渠道时自动发送邮件

2. **Admin UI 配置**
   - API Key 配置（加密存储）
   - 默认发件人地址
   - 发送域名配置
   - 邮件发送测试

### 调用流程（统一通知模式）

```
其他插件/Core
    ↓
ctx.notifications.send({ type, userId, ... })
    ↓
Core 通知系统创建通知
    ↓
检查用户偏好（启用了哪些渠道）
    ↓
触发 notification.created 事件
    ↓
邮件插件监听事件，检查渠道匹配
    ↓
通过 Resend API 发送邮件
```

**注意**：其他插件**不能直接调用**邮件发送，必须通过 Core 通知系统统一发送。这确保了：
- 用户偏好被尊重（用户可以关闭邮件渠道）
- 权限被统一检查
- 发送频率被统一限制
- 审计日志完整

### 技术实现

- 使用 `resend` Node.js SDK
- API Key 通过 Settings Capability 加密存储
- 邮件发送通过 Queue 异步处理
- 支持 HTML/Text 内容格式

## Impact

- Affected specs: `plugin-api`, `notification-system`
- Affected code: `plugins/email-resend/` (新增)
- No breaking changes to Core

## Constraints Discovered

### Hard Constraints (from PLUGIN_CONTRACT.md)

1. **Capability White-list**: 插件只能使用 manifest 中声明的能力
2. **Notification Channel Format**: 渠道 key 必须是 `plugin:{pluginId}:{channel}` 格式
3. **Settings Encryption**: API Key 必须使用 `encrypted: true` 存储
4. **Lifecycle Hooks**: 只能实现 `onInstall`, `onEnable`, `onDisable`, `onUninstall`
5. **Event Read-Only**: 接收的事件对象是只读的，不能修改

### Soft Constraints

1. **Rate Limiting**: 默认 100 jobs/min, 遵守 Resend API 限制
2. **Payload Size**: 邮件内容限制 64KB（Queue 限制）
3. **Error Isolation**: 邮件发送失败不能影响 Core 通知创建

### Dependencies

- `@wordrhyme/plugin` - Plugin API package
- `resend` - Resend Node.js SDK
- Core Notification System - 用于渠道注册
- Core Queue System - 用于异步邮件发送
- Core Settings System - 用于配置存储

### Risks

1. **Resend API 限制**: 免费版有发送限制，需要在文档中说明
2. **邮件模板**: 暂不支持 i18n 模板，后续迭代添加
3. **发送失败重试**: 依赖 Queue 系统的重试机制

## Success Criteria

1. 插件可以通过 Admin UI 成功安装和配置
2. 配置 API Key 后可以成功发送测试邮件
3. 当创建通知且用户启用邮件渠道时，自动发送邮件
4. 其他插件可以通过 Event/Hook 机制调用邮件发送能力
5. 邮件发送失败时有完整的错误日志和重试机制
