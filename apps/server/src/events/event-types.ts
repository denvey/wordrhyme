/**
 * Notification priority levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Channel decision for debugging
 */
export interface ChannelDecision {
  channel: string;
  included: boolean;
  reason: string;
}

/**
 * Notification data in events (simplified view)
 */
export interface NotificationEventData {
  id: string;
  userId: string;
  organizationId: string;
  templateKey?: string | undefined;
  templateVariables?: Record<string, unknown> | undefined;
  type: string;
  title: string;
  message: string;
  link?: string | undefined;
  priority: NotificationPriority;
  actorId?: string | undefined;
  entityId?: string | undefined;
  entityType?: string | undefined;
  groupKey?: string | undefined;
  sourcePluginId?: string | undefined;
  source?: string | undefined;
  target?: { type: string; id: string; url?: string } | null | undefined;
}

/**
 * User preference data in events
 */
export interface UserPreferenceData {
  enabledChannels: string[];
  templateOverrides: Record<string, string[]>;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  } | undefined;
  emailFrequency: 'instant' | 'hourly' | 'daily';
}

/**
 * User data in events
 */
export interface UserEventData {
  id: string;
  email?: string | undefined;
  preferences: UserPreferenceData;
}

/**
 * notification.created event payload
 */
export interface NotificationCreatedEvent {
  notification: NotificationEventData;
  user: UserEventData;
  channels: string[];
  decisionTrace: ChannelDecision[];
}

/**
 * Plugin notification event payload
 */
export interface PluginNotificationActionEvent {
  event: 'clicked' | 'archived';
  notificationId: string;
  userId: string;
  organizationId: string;
  pluginId: string;
  type: string;
  target: { type: string; id: string; url?: string | undefined };
  timestamp: string;
}

/**
 * Notification clicked event
 */
export interface NotificationClickedEvent {
  notification: NotificationEventData;
  user: UserEventData;
}

/**
 * Notification archived event
 */
export interface NotificationArchivedEvent {
  notification: NotificationEventData;
  user: UserEventData;
}

/**
 * Plugin notification template register event
 */
export interface PluginTemplateRegisterEvent {
  pluginId: string;
  organizationId: string | undefined;
  template: {
    key: string;
    [key: string]: unknown;
  };
}

/**
 * Plugin notification channel register event
 */
export interface PluginChannelRegisterEvent {
  pluginId: string;
  organizationId: string | undefined;
  channel: {
    key: string;
    [key: string]: unknown;
  };
}

/**
 * All event types in the system
 */
export interface EventMap {
  'notification.created': NotificationCreatedEvent;
  'notification.clicked': NotificationClickedEvent;
  'notification.archived': NotificationArchivedEvent;
  'notification.plugin.clicked': PluginNotificationActionEvent;
  'notification.plugin.archived': PluginNotificationActionEvent;
  'plugin.notification.template.register': PluginTemplateRegisterEvent;
  'plugin.notification.channel.register': PluginChannelRegisterEvent;
}

/**
 * Event names
 */
export type EventName = keyof EventMap;

/**
 * Event handler type
 */
export type EventHandler<T> = (event: Readonly<T>) => void | Promise<void>;
