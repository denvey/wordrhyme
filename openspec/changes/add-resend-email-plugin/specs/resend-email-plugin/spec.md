## ADDED Requirements

### Requirement: Resend Email Plugin Identity

The system SHALL provide a Resend email plugin with the following identity:

- pluginId: `com.wordrhyme.email-resend`
- version: `0.1.0`
- vendor: `WordRhyme`
- runtime: `node`
- surfaces: `server`, `admin`

#### Scenario: Plugin manifest validation
- **WHEN** the plugin is loaded
- **THEN** the manifest is validated against the plugin schema
- **AND** the plugin is registered with status `enabled`

#### Scenario: Plugin version compatibility
- **WHEN** the plugin declares `engines.wordrhyme: "^0.1.0"`
- **AND** Core version is `0.1.x`
- **THEN** the plugin is loaded successfully

---

### Requirement: Resend API Key Configuration

The plugin SHALL store the Resend API Key securely using the Settings Capability with encryption.

#### Scenario: API Key configuration
- **WHEN** admin configures the API key via Admin UI
- **THEN** the key is stored using `ctx.settings.set('api_key', value, { encrypted: true })`
- **AND** the key is encrypted at rest in the database

#### Scenario: API Key retrieval
- **WHEN** the plugin loads
- **THEN** it retrieves the API key using `ctx.settings.get('api_key')`
- **AND** the decrypted value is used to initialize Resend SDK

#### Scenario: Missing API Key
- **WHEN** the API key is not configured
- **THEN** email sending operations fail with descriptive error
- **AND** the error is logged for debugging

---

### Requirement: Notification Email Channel Registration

The plugin SHALL register an email notification channel that users can enable in their notification preferences.

#### Scenario: Channel registration on enable
- **WHEN** the plugin's `onEnable` hook is called
- **THEN** it registers a channel with key `plugin:com.wordrhyme.email-resend:email`
- **AND** the channel has i18n names: `{ "en-US": "Email", "zh-CN": "邮件" }`
- **AND** the channel is available in user notification preferences

#### Scenario: Channel unregistration on disable
- **WHEN** the plugin's `onDisable` hook is called
- **THEN** it unregisters the email channel
- **AND** users can no longer select this channel for notifications

---

### Requirement: Plugin Architecture Constraint

The plugin SHALL NOT expose direct email sending API to other plugins. All email sending MUST go through the Core notification system.

#### Scenario: Unified notification flow
- **WHEN** another plugin wants to send an email
- **THEN** it MUST call `ctx.notifications.send()` with the notification content
- **AND** the Core notification system determines which channels to use based on user preferences
- **AND** the email plugin receives the event only if the user enabled the email channel

#### Scenario: Direct email API prohibited
- **WHEN** another plugin attempts to directly call email plugin's send method
- **THEN** no such API is exposed
- **AND** the plugin MUST use the notification system instead

#### Scenario: User preference respected
- **WHEN** a notification is sent via Core notification system
- **AND** the user has disabled the email channel in preferences
- **THEN** no email is sent
- **AND** the email plugin does not receive the event

---

### Requirement: Notification Email Sending

The plugin SHALL send emails when notifications are created and the user has enabled the email channel.

#### Scenario: Email sent on notification
- **WHEN** a notification is created
- **AND** the user has enabled `plugin:com.wordrhyme.email-resend:email` channel
- **AND** the user has a valid email address
- **THEN** an email is sent via Resend API
- **AND** the email subject contains the notification title
- **AND** the email body contains the notification message

#### Scenario: Email not sent when channel disabled
- **WHEN** a notification is created
- **AND** the user has NOT enabled the email channel
- **THEN** no email is sent
- **AND** no error is logged

#### Scenario: Email sending failure
- **WHEN** Resend API returns an error
- **THEN** the error is logged with context
- **AND** the notification creation is NOT affected
- **AND** the email sending may be retried based on queue configuration

---

### Requirement: Admin UI Settings Page

The plugin SHALL provide an Admin UI page for configuring email settings.

#### Scenario: Settings page access
- **WHEN** admin navigates to plugin settings
- **THEN** the settings page is displayed
- **AND** current configuration is loaded

#### Scenario: Save configuration
- **WHEN** admin modifies settings and clicks Save
- **THEN** settings are validated
- **AND** valid settings are saved to the database
- **AND** success feedback is displayed

#### Scenario: Test email sending
- **WHEN** admin enters a test email address and clicks Send Test
- **THEN** a test email is sent to the specified address
- **AND** success/failure feedback is displayed

---

### Requirement: Email Send Rate Limiting

The plugin SHALL respect rate limits to prevent abuse and comply with Resend API limits.

#### Scenario: Queue rate limiting
- **WHEN** email sending rate exceeds 100 emails/minute
- **THEN** excess emails are queued for later delivery
- **AND** no emails are dropped

#### Scenario: Resend API rate limit
- **WHEN** Resend API returns rate limit error (429)
- **THEN** the email is retried with exponential backoff
- **AND** the error is logged with retry information

---

## Resolved Constraints (Zero-Decision Implementation Parameters)

以下约束已确认，实施时直接使用，无需再做决策：

### Email Content Format
- **格式**: 纯文本 (Plain Text)
- **主题**: 使用通知的 `title` 字段
- **正文**: 使用通知的 `message` 字段
- **不使用**: HTML 模板（MVP 阶段）

### Retry Strategy
- **重试次数**: 3 次
- **退避策略**: 指数退避 (Exponential Backoff)
- **初始延迟**: 1000ms
- **最大延迟**: 30000ms
- **失败后**: 记录日志，不再重试

### Permission Requirements
- **查看配置权限**: 需要 `plugin:com.wordrhyme.email-resend:settings.read` 权限
- **修改配置权限**: 需要 `plugin:com.wordrhyme.email-resend:settings.write` 权限
- **发送测试邮件权限**: 需要 `plugin:com.wordrhyme.email-resend:test.send` 权限

**权限继承规则**:
- 组织 Owner 默认拥有所有插件权限（无需显式授予）
- `settings.write` 权限持有者可以修改配置，但不能发送测试邮件
- `test.send` 是独立权限，可单独授予（用于只允许测试但不能改配置的场景）

### Settings Keys (Exact)
| Key | Type | Encrypted | Required | Default |
|-----|------|-----------|----------|---------|
| `api_key` | string | ✅ | ✅ | - |
| `from_address` | string | ❌ | ✅ | - |
| `from_name` | string | ❌ | ❌ | "WordRhyme" |
| `reply_to` | string | ❌ | ❌ | null |

### Channel Key (Exact)
- `plugin:com.wordrhyme.email-resend:email`

### Rate Limits
- **Queue Rate**: 100 jobs/minute (Core default)
- **Resend API**: Respect API limits (100 emails/day free tier)

---

## Property-Based Testing (PBT) Properties

### INVARIANT: API Key Security
- **Property**: API Key is NEVER exposed in logs, responses, or Admin UI (except masked input)
- **Falsification**: Search all log outputs for patterns matching `re_[a-zA-Z0-9]+`
- **Boundary**: API key must be 32+ characters, prefix `re_`

### INVARIANT: Channel Registration Idempotency
- **Property**: Multiple `onEnable` calls result in exactly one channel registration
- **Falsification**: Call `onEnable` 3 times, query channels, expect count = 1
- **Boundary**: Channel key must be unique

### INVARIANT: Notification Independence
- **Property**: Email sending failure does NOT affect notification creation success
- **Falsification**: Force Resend API to fail, verify notification still created
- **Boundary**: Error isolation between notification service and email service

### INVARIANT: User Preference Respect
- **Property**: Email is sent IFF user has enabled email channel
- **Falsification**: Create notification with channel disabled, verify no email sent
- **Boundary**: Channel preference is checked BEFORE email enqueue

### INVARIANT: Retry Monotonicity
- **Property**: Retry count never exceeds configured maximum (3)
- **Falsification**: Force 10 consecutive failures, verify only 3 retry attempts
- **Boundary**: attempts ∈ [0, 3]

### INVARIANT: Settings Encryption Round-Trip
- **Property**: `settings.set(key, value, {encrypted: true})` → `settings.get(key)` returns original value
- **Falsification**: Set API key, restart plugin, get API key, compare
- **Boundary**: Encryption/decryption must be lossless

### INVARIANT: Rate Limit Queue Ordering
- **Property**: Emails are delivered in FIFO order within same priority
- **Falsification**: Enqueue 100 emails rapidly, verify delivery order matches enqueue order
- **Boundary**: Order preserved when queue is not at capacity

