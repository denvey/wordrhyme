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
 * Notification data in events
 */
export interface NotificationEventData {
  id: string;
  userId: string;
  tenantId: string;
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
 * All event types in the system
 */
export interface EventMap {
  'notification.created': NotificationCreatedEvent;
}

/**
 * Event names
 */
export type EventName = keyof EventMap;

/**
 * Event handler type
 */
export type EventHandler<T> = (event: Readonly<T>) => void | Promise<void>;
