## ADDED Requirements

### Requirement: In-App Notification Storage

The system SHALL store in-app notifications in the database for each user.

Notifications SHALL contain:
- Unique identifier
- User ID and Tenant ID (scoping)
- Type (info, success, warning, error)
- Title and message content
- Optional link
- Read/unread status
- Creation timestamp
- Optional template reference and variables

#### Scenario: Create notification
- **GIVEN** a user exists in the system
- **WHEN** `notificationService.send()` is called with user ID and content
- **THEN** a notification record is created in the database
- **AND** the notification has `read: false` status
- **AND** `notification.created` event is emitted

#### Scenario: List user notifications
- **GIVEN** a user has multiple notifications
- **WHEN** `notificationService.list(userId)` is called
- **THEN** notifications are returned ordered by creation time (newest first)
- **AND** results can be paginated

#### Scenario: Mark notification as read
- **GIVEN** a user has an unread notification
- **WHEN** `notificationService.markAsRead(notificationId, userId)` is called
- **THEN** the notification's `read` status is set to `true`

---

### Requirement: Actor and Entity Tracking

Notifications SHALL support actor and entity references for rich UI rendering.

Notifications MAY contain:
- Actor ID (who performed the action)
- Entity ID (what entity is involved)
- Entity type (e.g., 'comment', 'order', 'post')

#### Scenario: Notification with actor
- **GIVEN** user Alice comments on user Bob's post
- **WHEN** notification is created for Bob
- **THEN** `actorId` is set to Alice's user ID
- **AND** `entityId` is set to the comment ID
- **AND** `entityType` is set to 'comment'

#### Scenario: UI rendering with actor
- **GIVEN** a notification has actor and entity references
- **WHEN** the notification is displayed in UI
- **THEN** the system can render actor avatar and link to entity

---

### Requirement: Notification Idempotency

The system SHALL prevent duplicate notifications using idempotency keys.

#### Scenario: Duplicate notification prevention
- **GIVEN** a notification with idempotency key `comment:123:like:456` exists
- **WHEN** the same notification is attempted again
- **THEN** the duplicate is rejected
- **AND** the original notification is returned

#### Scenario: Idempotency key format
- **GIVEN** an action that should trigger a notification
- **WHEN** the notification is created
- **THEN** idempotency key follows format: `{entityType}:{entityId}:{action}:{actorId}`

---

### Requirement: Notification Bundling

The system SHALL support bundling similar notifications to reduce noise.

#### Scenario: Bundle multiple likes
- **GIVEN** a post receives 10 likes in 5 minutes
- **WHEN** notifications are processed
- **THEN** a single bundled notification is shown: "Alice and 9 others liked your post"
- **AND** `groupKey` is set to `post:123:likes`
- **AND** `groupCount` is set to 10

#### Scenario: Unbundled urgent notification
- **GIVEN** a notification with priority `urgent`
- **WHEN** the notification is created
- **THEN** it is NOT bundled with other notifications

---

### Requirement: Source Plugin Tracking

The system SHALL track which plugin created each notification.

#### Scenario: Plugin-sourced notification
- **GIVEN** an email plugin creates a notification
- **WHEN** the notification is saved
- **THEN** `sourcePluginId` is set to the plugin's ID
- **AND** the source can be queried for debugging

#### Scenario: Core-sourced notification
- **GIVEN** Core creates a system notification
- **WHEN** the notification is saved
- **THEN** `sourcePluginId` is NULL

---

### Requirement: Notification Templates

The system SHALL support notification templates with i18n and variable interpolation.

Templates SHALL contain:
- Unique key (e.g., `comment.new`, `order.shipped`)
- Multi-language title and message (JSONB)
- Variable definitions
- Default channels
- Priority level
- Optional plugin ID (for plugin-registered templates)
- Version number (for evolution)
- Deprecated flag (for safe deprecation)

#### Scenario: Render template with variables
- **GIVEN** a template with key `comment.new` exists
- **AND** template message is `"{userName} commented on your post"`
- **WHEN** `templateService.renderTemplate('comment.new', { userName: 'Alice' }, 'en-US')` is called
- **THEN** rendered message is `"Alice commented on your post"`

#### Scenario: i18n fallback
- **GIVEN** a template exists with `en-US` and `zh-CN` translations
- **WHEN** template is rendered with locale `fr-FR` (not available)
- **THEN** the system falls back to `en-US` translation

#### Scenario: Plugin registers template
- **GIVEN** a plugin is enabled
- **WHEN** plugin calls `ctx.notifications.registerTemplate()` with template definition
- **THEN** template is stored with `pluginId` reference
- **AND** template is available for use

#### Scenario: Template deprecation
- **GIVEN** a template with key `order.legacy` exists
- **WHEN** plugin marks template as deprecated
- **THEN** template `deprecated` flag is set to `true`
- **AND** existing user preferences continue to work
- **AND** new preference selections show deprecation warning

#### Scenario: Template version evolution
- **GIVEN** a template with key `comment.new` version 1 exists
- **WHEN** plugin updates template with new fields
- **THEN** template `version` is incremented to 2
- **AND** old notifications rendered with version 1 remain unchanged

#### Scenario: Variable sanitization
- **GIVEN** a template with variable `{userInput}`
- **WHEN** user input contains `<script>alert('xss')</script>`
- **THEN** the variable is HTML-escaped before interpolation
- **AND** XSS attack is prevented

---

### Requirement: User Notification Preferences

The system SHALL allow users to configure their notification preferences.

Preferences SHALL include:
- Enabled notification channels (global)
- Per-template channel overrides
- Quiet hours (do not disturb)
- Email frequency (instant, hourly, daily)

#### Scenario: User enables email channel
- **GIVEN** a user's default enabled channels are `['in-app']`
- **WHEN** user updates preferences to include `['in-app', 'email']`
- **THEN** future notifications are sent to both in-app and email

#### Scenario: Template-specific override
- **GIVEN** user has global channels `['in-app', 'email']`
- **AND** user sets override for `order.urgent` to `['in-app', 'email', 'sms']`
- **WHEN** an `order.urgent` notification is created
- **THEN** notification is sent to in-app, email, AND sms

#### Scenario: Quiet hours enforcement
- **GIVEN** user has quiet hours enabled from 22:00 to 08:00
- **AND** current time is 23:00 in user's timezone
- **WHEN** a normal priority notification is created
- **THEN** external channels (email, sms) are skipped
- **AND** in-app notification is still created

#### Scenario: Urgent bypasses quiet hours
- **GIVEN** user has quiet hours enabled
- **WHEN** an urgent priority notification is created
- **THEN** notification is sent to all enabled channels regardless of quiet hours

---

### Requirement: Notification Channel Registration

Plugins SHALL be able to register notification channels.

Channel registration SHALL include:
- Unique channel key following namespace pattern
- Display name (i18n)
- Icon
- Plugin ID
- User configuration schema (for user-specific settings like email address)

Channel key namespace:
- `in-app` - Reserved for Core
- `plugin:{pluginId}:{channel}` - Plugin channels

#### Scenario: Plugin registers email channel
- **GIVEN** email plugin is enabled
- **WHEN** plugin calls `channelService.registerChannel({ key: 'plugin:com.acme.email:email', ... })`
- **THEN** `email` channel becomes available to users
- **AND** channel appears in user preference settings

#### Scenario: Channel key validation
- **GIVEN** a plugin tries to register channel with key `email` (no namespace)
- **WHEN** `channelService.registerChannel()` is called
- **THEN** registration is rejected with validation error
- **AND** error message indicates proper namespace format

#### Scenario: Plugin uninstall removes channel
- **GIVEN** email plugin has registered `email` channel
- **WHEN** email plugin is uninstalled
- **THEN** `email` channel is removed from available channels
- **AND** users' preferences referencing `email` are cleaned up

#### Scenario: Channel requires user configuration
- **GIVEN** email channel requires user's email address
- **WHEN** user tries to enable email channel
- **THEN** user is prompted to configure email address
- **AND** channel is only enabled after valid configuration

---

### Requirement: Notification Event Emission

The system SHALL emit events when notifications are created, allowing plugins to enhance delivery.

Events SHALL include:
- `notification.created` - Emitted after in-app notification is saved
- Event payload includes notification, user, resolved channels, user preferences

#### Scenario: Plugin receives notification event
- **GIVEN** email plugin subscribes to `notification.created`
- **WHEN** a notification is created with email in resolved channels
- **THEN** email plugin receives the event
- **AND** plugin can enqueue email delivery job

#### Scenario: Multiple plugins receive event
- **GIVEN** email plugin AND sms plugin both subscribe to `notification.created`
- **WHEN** a notification is created with both channels enabled
- **THEN** both plugins receive the event
- **AND** both can process independently

---

### Requirement: Notification API

The system SHALL expose tRPC API for notification management.

API SHALL include:
- `notifications.list` - List user's notifications
- `notifications.getUnreadCount` - Get unread count
- `notifications.markAsRead` - Mark single notification as read
- `notifications.markAllAsRead` - Mark all as read
- `notificationPreferences.get` - Get user preferences
- `notificationPreferences.update` - Update preferences
- `notificationPreferences.getAvailableChannels` - List available channels

**Access Control**:
- All endpoints require authentication (`requireAuth()`)
- Users can ONLY access their own notifications (actor = self)
- Admin users with `notifications:admin:read` capability can list other users' notifications within same tenant
- All operations are tenant-scoped (cross-tenant access forbidden)

#### Scenario: List notifications with pagination
- **GIVEN** user has 100 notifications
- **WHEN** `notifications.list({ limit: 20, offset: 0 })` is called
- **THEN** first 20 notifications are returned
- **AND** response includes total count
- **AND** only notifications for current user and tenant are returned

#### Scenario: Get unread count
- **GIVEN** user has 5 unread notifications
- **WHEN** `notifications.getUnreadCount()` is called
- **THEN** response is `{ count: 5 }`

#### Scenario: Update preferences with validation
- **GIVEN** user tries to enable channel `invalid-channel`
- **WHEN** `notificationPreferences.update({ enabledChannels: ['in-app', 'invalid-channel'] })` is called
- **THEN** request is rejected with validation error
- **AND** preferences are not modified

#### Scenario: User cannot access other user's notifications
- **GIVEN** user A tries to list user B's notifications
- **WHEN** `notifications.list({ userId: 'user-b' })` is called without admin capability
- **THEN** request is rejected with `FORBIDDEN` error

#### Scenario: Cross-tenant access forbidden
- **GIVEN** user in tenant A
- **WHEN** user tries to access notifications in tenant B
- **THEN** request is rejected with `FORBIDDEN` error
- **AND** security warning is logged

#### Scenario: Admin lists notifications with capability
- **GIVEN** admin user has `notifications:admin:read` capability
- **WHEN** admin calls `notifications.list({ userId: 'other-user' })`
- **THEN** other user's notifications are returned
- **AND** only within same tenant

---

### Requirement: Notification Expiry

The system SHALL automatically archive old notifications to prevent database bloat.

Archival policy:
- Default expiry: 90 days
- Configurable per tenant
- Archived notifications are soft-deleted (archived: true)
- Hard delete after additional 30 days

#### Scenario: Automatic archival
- **GIVEN** a notification was created 91 days ago
- **WHEN** the archival job runs
- **THEN** the notification's `archived` status is set to `true`

#### Scenario: Hard delete old archived
- **GIVEN** a notification was archived 31 days ago
- **WHEN** the cleanup job runs
- **THEN** the notification is permanently deleted from database

---

### Requirement: Decision Trace

The system SHALL record channel resolution decisions for debugging.

Decision trace SHALL include:
- Template key
- Resolved channels
- Per-channel decision (included/excluded with reason)

#### Scenario: Decision trace stored
- **GIVEN** a notification is created for user with quiet hours enabled
- **WHEN** channel resolution runs
- **THEN** decision trace is stored in `notifications.metadata.decisionTrace`
- **AND** trace shows: `{ channel: 'sms', included: false, reason: 'quiet hours active' }`

#### Scenario: Support debugging
- **GIVEN** a user asks "Why didn't I get an email?"
- **WHEN** support queries the notification
- **THEN** decision trace shows the exact reason (e.g., "user disabled", "quiet hours", "plugin not installed")

---

### Requirement: Event Immutability

Notification events emitted by Core SHALL be read-only.

#### Scenario: Event payload frozen
- **GIVEN** Core emits `notification.created` event
- **WHEN** plugin receives the event
- **THEN** event payload is frozen with `Object.freeze()`
- **AND** any mutation attempt throws error

#### Scenario: Plugin works with copy
- **GIVEN** a plugin needs to modify notification data
- **WHEN** plugin receives `notification.created` event
- **THEN** plugin creates a shallow copy of the data
- **AND** works with the copy, not the original

---

### Requirement: In-App Notification Immutability

Plugins SHALL NOT modify, prevent, or delete Core in-app notifications.

In-app notification is a **fact record** - plugins enhance delivery channels, not modify facts.

#### Scenario: Plugin cannot prevent notification
- **GIVEN** Core decides to create an in-app notification
- **WHEN** a plugin tries to prevent it
- **THEN** the notification is created regardless
- **AND** plugin receives event after the fact

#### Scenario: Plugin cannot delete notification
- **GIVEN** an in-app notification exists
- **WHEN** a plugin tries to delete it
- **THEN** the deletion is rejected
- **AND** only the user or Core can delete notifications
