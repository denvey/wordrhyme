## Purpose
Define the notification domain model, type system, presentation strategies, and aggregation behavior for platform and plugin notifications.

## Requirements

### Requirement: Unified Notification Data Model

The system SHALL provide a unified notification data model that supports both SaaS business notifications and Social interaction notifications using the Actor-Action-Object pattern.

#### Scenario: SaaS system notification
- **WHEN** a system event occurs (e.g., export ready, task assigned)
- **THEN** a notification is created with source='system', category='system'
- **AND** the actor is set to system with appropriate icon

#### Scenario: Social interaction notification
- **WHEN** a user interacts with content (e.g., like, comment, follow)
- **THEN** a notification is created with source='user', category='social'
- **AND** the actor contains user information including avatar

#### Scenario: Plugin notification
- **WHEN** a plugin creates a notification
- **THEN** the notification has source='plugin' and sourcePluginId set
- **AND** the type MUST use plugin namespace prefix

### Requirement: NotificationType Strong Enum

The system SHALL enforce a strong enum for notification types to prevent arbitrary type pollution.

#### Scenario: Valid notification type
- **WHEN** creating a notification with a registered type
- **THEN** the notification is created successfully

#### Scenario: Invalid notification type
- **WHEN** creating a notification with an unregistered type
- **THEN** the system rejects the notification with validation error

#### Scenario: Plugin type registration
- **WHEN** a plugin registers a notification type
- **THEN** the type MUST use format 'plugin:{pluginId}:{action}'
- **AND** the type is added to the allowed types registry

### Requirement: View Strategy System

The system SHALL provide a View Strategy abstraction layer that determines how notifications are displayed based on product context.

#### Scenario: Inbox strategy (SaaS default)
- **WHEN** using inbox strategy
- **THEN** all non-archived notifications are visible
- **AND** unread notifications have higher priority
- **AND** no aggregation is applied

#### Scenario: Social feed strategy
- **WHEN** using social-feed strategy
- **THEN** unread notifications are always visible
- **AND** read notifications older than 7 days are hidden
- **AND** like/follow notifications are aggregated by entity

#### Scenario: Strategy selection
- **WHEN** querying notifications with strategy parameter
- **THEN** the specified strategy is applied to filter and sort results

### Requirement: Notification Aggregation

The system SHALL support aggregating similar notifications for social scenarios.

#### Scenario: Like aggregation
- **WHEN** multiple users like the same post
- **THEN** notifications are grouped with groupKey='post:{id}:like'
- **AND** groupInfo contains count and latestActors

#### Scenario: Aggregated notification display
- **WHEN** displaying an aggregated notification
- **THEN** title shows "Alice and 4 others liked your post"
- **AND** latestActors provides avatar URLs for stacked display

#### Scenario: Aggregation limit
- **WHEN** aggregation count exceeds 99
- **THEN** display shows "99+" instead of exact count

### Requirement: Aggregated Notification Read Semantics

The system SHALL mark all notifications within a group as read when user clicks on an aggregated notification.

#### Scenario: Click aggregated notification
- **WHEN** user clicks on an aggregated notification with groupKey
- **THEN** all notifications with the same groupKey are marked as read
- **AND** only affects current visible notifications, not future ones

#### Scenario: New notification after group read
- **WHEN** a new notification arrives after group was marked as read
- **THEN** the new notification appears as unread
- **AND** a new aggregation is formed if applicable

#### Scenario: Partial group read
- **WHEN** user clicks on aggregated notification
- **THEN** only non-archived notifications in the group are marked as read
- **AND** archived notifications remain unchanged

### Requirement: Notification Retention Policy

The system SHALL implement category-based retention policies with different TTL for different notification types.

#### Scenario: System notification retention
- **WHEN** a system notification is created
- **THEN** it is retained forever until manually archived
- **AND** cleanup job does not delete system notifications

#### Scenario: Collaboration notification retention
- **WHEN** a collaboration notification (mention, reply) is created
- **THEN** it is retained for 30 days if read
- **AND** retained for 37 days if unread (extra 7 days grace period)

#### Scenario: Social notification retention
- **WHEN** a social notification (like, follow) is created
- **THEN** it is retained for 7 days if read
- **AND** retained for 14 days if unread (extra 7 days grace period)

#### Scenario: Cleanup job execution
- **WHEN** cleanup job runs daily at 3 AM
- **THEN** expired read notifications are deleted
- **AND** expired unread notifications (past grace period) are deleted
- **AND** system notifications are never deleted

### Requirement: Notification Sorting and Display

The system SHALL sort notifications by time with visual priority differentiation.

#### Scenario: Default sorting order
- **WHEN** fetching notifications
- **THEN** results are sorted by: pinned DESC, read ASC, created_at DESC
- **AND** pinned notifications always appear first

#### Scenario: Visual priority high
- **WHEN** displaying mention or reply notification
- **THEN** icon color is blue/green (high visibility)
- **AND** background is highlighted when unread

#### Scenario: Visual priority low
- **WHEN** displaying like or follow notification
- **THEN** icon color is gray (low visibility)
- **AND** background is subtle even when unread

#### Scenario: Pinned notification
- **WHEN** a system alert is marked as pinned
- **THEN** it appears at the top of the list
- **AND** user can manually dismiss the pin

### Requirement: Actor-Action-Object Response Structure

The system SHALL return notifications in Actor-Action-Object structure for consistent frontend rendering.

#### Scenario: Response structure
- **WHEN** fetching notifications via API
- **THEN** each notification includes actor, title, body, target, and optional groupInfo
- **AND** actor contains id, type, name, and optional avatarUrl
- **AND** target contains type, id, url, and optional previewImage

#### Scenario: System actor
- **WHEN** notification source is 'system'
- **THEN** actor.type is 'system'
- **AND** actor.name is 'System'
- **AND** actor.avatarUrl is system icon URL

### Requirement: Notification Categories

The system SHALL categorize notifications for filtering, retention, and display purposes.

#### Scenario: System category
- **WHEN** notification is system alert, warning, or task-related
- **THEN** category is 'system'
- **AND** retention is forever

#### Scenario: Collaboration category
- **WHEN** notification is comment, reply, or mention
- **THEN** category is 'collaboration'
- **AND** retention is 30 days

#### Scenario: Social category
- **WHEN** notification is like, follow, or social interaction
- **THEN** category is 'social'
- **AND** retention is 7 days

#### Scenario: Category filtering
- **WHEN** querying notifications with category filter
- **THEN** only notifications of specified category are returned

### Requirement: Backward Compatibility

The system SHALL maintain backward compatibility with existing notification consumers.

#### Scenario: Existing fields preserved
- **WHEN** upgrading to new contract
- **THEN** all existing fields (id, userId, type, title, message, read, archived) remain available
- **AND** existing API endpoints continue to work

#### Scenario: New fields optional
- **WHEN** creating notifications without new fields
- **THEN** default values are applied (source='system', category='system')
- **AND** notification is created successfully

### Requirement: Plugin Notification Contract

The system SHALL provide a controlled API for plugins to send notifications while maintaining platform governance over aggregation, retention, and display.

#### Scenario: Plugin manifest declaration
- **WHEN** a plugin wants to send notifications
- **THEN** it MUST declare notification types in plugin.json manifest
- **AND** each type MUST specify category and aggregation strategy
- **AND** the plugin MUST declare 'notification:send' permission

#### Scenario: Plugin sends notification
- **WHEN** a plugin calls the notification send API
- **THEN** the platform validates the type against manifest declaration
- **AND** the platform applies rate limiting checks
- **AND** the platform auto-generates groupKey based on aggregation strategy
- **AND** the notification is created with source='plugin' and sourcePluginId set

#### Scenario: Plugin type validation
- **WHEN** a plugin attempts to send an undeclared notification type
- **THEN** the request is rejected with validation error
- **AND** the error message indicates the type is not declared in manifest

#### Scenario: Plugin rate limiting
- **WHEN** a plugin exceeds its rate limit
- **THEN** the request is rejected with RATE_LIMIT_EXCEEDED error
- **AND** the response includes retryAfter and remaining quota information

### Requirement: Plugin Aggregation Strategy

The system SHALL provide predefined aggregation strategies for plugins to choose from, without allowing custom aggregation rules.

#### Scenario: No aggregation strategy
- **WHEN** plugin declares aggregation='none'
- **THEN** each notification is displayed individually
- **AND** no groupKey is generated

#### Scenario: By-target aggregation strategy
- **WHEN** plugin declares aggregation='by_target'
- **THEN** notifications with same target are grouped together
- **AND** groupKey is generated as 'plugin:{pluginId}:{type}:{targetId}'

#### Scenario: By-actor aggregation strategy
- **WHEN** plugin declares aggregation='by_actor'
- **THEN** notifications from same actor are grouped together
- **AND** groupKey is generated as 'plugin:{pluginId}:{type}:{actorId}'

#### Scenario: By-type aggregation strategy
- **WHEN** plugin declares aggregation='by_type'
- **THEN** all notifications of same type are grouped together
- **AND** groupKey is generated as 'plugin:{pluginId}:{type}'

### Requirement: Plugin Event Webhooks

The system SHALL provide async webhook callbacks for plugins to receive notification events.

#### Scenario: Notification clicked webhook
- **WHEN** user clicks on a plugin notification
- **THEN** platform sends async POST to plugin's onClicked webhook URL
- **AND** payload includes notificationId, userId, tenantId, type, target, timestamp

#### Scenario: Notification archived webhook
- **WHEN** user archives a plugin notification
- **THEN** platform sends async POST to plugin's onArchived webhook URL
- **AND** payload includes notificationId, userId, tenantId, type, target, timestamp

#### Scenario: Webhook failure handling
- **WHEN** webhook delivery fails
- **THEN** platform retries with exponential backoff
- **AND** after max retries, the event is logged and dropped
- **AND** plugin functionality is not affected

### Requirement: Plugin Rate Limiting and Circuit Breaker

The system SHALL enforce rate limits on plugin notifications to prevent abuse and protect system resources.

#### Scenario: Plugin-level rate limit
- **WHEN** plugin sends notifications
- **THEN** platform enforces per-minute, per-hour, and per-day limits
- **AND** default limits are 100/min, 1000/hour, 10000/day

#### Scenario: User-level rate limit
- **WHEN** plugin sends notifications to a specific user
- **THEN** platform enforces per-user limits to prevent harassment
- **AND** default limits are 10/min, 50/hour per user

#### Scenario: Circuit breaker activation
- **WHEN** plugin notification failures exceed threshold
- **THEN** circuit breaker activates and rejects new requests
- **AND** after cooldown period, circuit breaker allows test requests
- **AND** if test succeeds, normal operation resumes

### Requirement: Plugin Notification Permissions

The system SHALL enforce permission checks for plugin notification operations.

#### Scenario: Send permission check
- **WHEN** plugin attempts to send notification
- **THEN** platform verifies plugin has 'notification:send' permission
- **AND** platform verifies plugin is enabled in target tenant
- **AND** platform verifies target user belongs to tenant

#### Scenario: Batch send permission
- **WHEN** plugin attempts to send batch notifications
- **THEN** platform verifies plugin has 'notification:send:batch' permission
- **AND** batch size is limited to prevent abuse

#### Scenario: Read own notifications
- **WHEN** plugin queries its sent notifications
- **THEN** platform verifies plugin has 'notification:read:own' permission
- **AND** only notifications with matching sourcePluginId are returned

### Requirement: Plugin Notification Hard Bans

The system SHALL enforce strict boundaries on what plugins cannot do with notifications.

#### Scenario: Custom aggregation rule attempt
- **WHEN** plugin attempts to provide custom aggregation logic
- **THEN** the request is rejected
- **AND** plugin MUST use predefined aggregation strategies

#### Scenario: Cross-plugin notification access
- **WHEN** plugin attempts to read or modify another plugin's notifications
- **THEN** the request is rejected with permission error

#### Scenario: System notification modification
- **WHEN** plugin attempts to modify system notifications
- **THEN** the request is rejected
- **AND** only platform can manage system notifications

#### Scenario: Rate limit bypass attempt
- **WHEN** plugin attempts to bypass rate limiting
- **THEN** the request is rejected
- **AND** repeated attempts may trigger circuit breaker
