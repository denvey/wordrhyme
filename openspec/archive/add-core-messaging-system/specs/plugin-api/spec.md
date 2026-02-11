## MODIFIED Requirements

### Requirement: Plugin Context Extensions

The PluginContext SHALL be extended with queue and notification capabilities.

Extended PluginContext interface:
```typescript
interface PluginContext {
  // ... existing properties ...

  /** Queue capability for async job processing */
  queue: PluginQueueCapability;

  /** Notification capability for sending notifications */
  notifications: PluginNotificationCapability;
}
```

#### Scenario: Plugin accesses queue capability
- **GIVEN** a plugin is enabled
- **WHEN** plugin's `onEnable` hook is called
- **THEN** `ctx.queue` is available
- **AND** plugin can enqueue jobs and register handlers

#### Scenario: Plugin accesses notification capability
- **GIVEN** a plugin is enabled
- **WHEN** plugin's `onEnable` hook is called
- **THEN** `ctx.notifications` is available
- **AND** plugin can register templates and channels

---

## ADDED Requirements

### Requirement: Plugin Queue Capability

Plugins SHALL have access to a scoped queue capability via PluginContext.

PluginQueueCapability interface:
```typescript
interface PluginQueueCapability {
  /**
   * Enqueue a job. Job name is automatically namespaced to plugin:{pluginId}:{name}
   */
  enqueue(name: string, data: unknown, options?: JobOptions): Promise<string>;

  /**
   * Register a job handler. Handler name is automatically namespaced.
   */
  registerHandler(name: string, handler: JobHandler): void;

  /**
   * Explicitly fail a job with reason (no retry).
   */
  fail(reason: string): never;
}

interface JobOptions {
  priority?: 'critical' | 'high' | 'normal' | 'low';
  delay?: number;  // milliseconds
  attempts?: number;  // override default retries
}
```

#### Scenario: Plugin enqueues job with automatic namespace
- **GIVEN** plugin `com.acme.email` calls `ctx.queue.enqueue('send', data)`
- **WHEN** the job is created
- **THEN** job name is `plugin:com.acme.email:send`
- **AND** `data.tenantId` is automatically set to current tenant

#### Scenario: Plugin registers handler with automatic namespace
- **GIVEN** plugin `com.acme.email` calls `ctx.queue.registerHandler('send', handler)`
- **WHEN** the handler is registered
- **THEN** handler is registered for `plugin:com.acme.email:send`

#### Scenario: Plugin rate limit enforced
- **GIVEN** plugin has default limit of 100 jobs/minute
- **WHEN** plugin exceeds limit
- **THEN** `ctx.queue.enqueue()` throws `RateLimitExceededError`

#### Scenario: Plugin payload size enforced
- **GIVEN** plugin has default limit of 64KB payload
- **WHEN** plugin enqueues job with 128KB data
- **THEN** `ctx.queue.enqueue()` throws `PayloadTooLargeError`

---

### Requirement: Plugin Notification Capability

Plugins SHALL have access to a scoped notification capability via PluginContext.

PluginNotificationCapability interface:
```typescript
interface PluginNotificationCapability {
  /**
   * Register a notification template.
   */
  registerTemplate(template: TemplateDefinition): Promise<void>;

  /**
   * Deprecate a template (cannot delete).
   */
  deprecateTemplate(key: string): Promise<void>;

  /**
   * Register a notification channel.
   */
  registerChannel(channel: ChannelDefinition): Promise<void>;

  /**
   * Unregister a channel (on plugin disable).
   */
  unregisterChannel(key: string): Promise<void>;
}

interface TemplateDefinition {
  key: string;  // Plugin templates auto-prefixed: plugin:{pluginId}:{key}
  title: Record<string, string>;  // i18n
  message: Record<string, string>;  // i18n
  variables: string[];
  defaultChannels: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

interface ChannelDefinition {
  key: string;  // Must follow: plugin:{pluginId}:{channel}
  name: Record<string, string>;  // i18n
  description?: Record<string, string>;
  icon?: string;
  configSchema?: ZodSchema;  // User configuration schema
}
```

#### Scenario: Plugin registers template
- **GIVEN** plugin `com.acme.email` registers template with key `welcome`
- **WHEN** the template is stored
- **THEN** template key is `plugin:com.acme.email:welcome`
- **AND** template is available for notifications

#### Scenario: Plugin registers channel with valid namespace
- **GIVEN** plugin `com.acme.email` registers channel `plugin:com.acme.email:email`
- **WHEN** the channel is stored
- **THEN** channel becomes available to users
- **AND** channel appears in notification preferences

#### Scenario: Plugin channel namespace validation
- **GIVEN** plugin `com.acme.email` tries to register channel `email` (no namespace)
- **WHEN** `registerChannel()` is called
- **THEN** registration is rejected with `InvalidChannelKeyError`
- **AND** error message indicates required format: `plugin:{pluginId}:{channel}`

#### Scenario: Plugin cannot modify Core channels
- **GIVEN** plugin tries to register channel `in-app`
- **WHEN** `registerChannel()` is called
- **THEN** registration is rejected with `ReservedChannelKeyError`

---

### Requirement: Plugin Event Subscription

Plugins SHALL be able to subscribe to Core notification events.

Available events:
- `notification.created` - Emitted after in-app notification is saved

Event payload (read-only):
```typescript
interface NotificationCreatedEvent {
  readonly notification: {
    id: string;
    userId: string;
    tenantId: string;
    templateKey: string;
    title: string;
    message: string;
    priority: string;
    channels: string[];  // Resolved channels for this notification
  };
  readonly user: {
    id: string;
    email?: string;
    preferences: NotificationPreference;
  };
  readonly decisionTrace: ChannelDecision[];
}
```

#### Scenario: Plugin subscribes to notification event
- **GIVEN** email plugin subscribes to `notification.created`
- **WHEN** a notification is created with `plugin:com.acme.email:email` in channels
- **THEN** email plugin receives the event
- **AND** event payload is frozen (read-only)

#### Scenario: Plugin cannot mutate event
- **GIVEN** plugin receives `notification.created` event
- **WHEN** plugin tries to modify `event.notification.title`
- **THEN** modification throws error (Object.freeze in production)

#### Scenario: Multiple plugins receive same event
- **GIVEN** email plugin and SMS plugin both subscribe to `notification.created`
- **WHEN** a notification is created with both channels
- **THEN** both plugins receive independent event copies
- **AND** plugins process asynchronously without blocking each other
