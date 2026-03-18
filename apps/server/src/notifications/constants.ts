/**
 * Notification Constants
 *
 * Retention policies and display configurations for the notification system.
 * These are business-level constants that don't belong in the schema layer.
 */

import type {
  NotificationCategory,
  NotificationTypeEnumValue,
  NotificationType,
  VisualPriority,
} from '@wordrhyme/db';

/**
 * Retention policy for each notification category
 */
export interface RetentionPolicy {
  category: NotificationCategory;
  retentionDays: number | 'forever';
}

/**
 * Default retention policies for notifications
 */
export const RETENTION_POLICIES: RetentionPolicy[] = [
  { category: 'system', retentionDays: 'forever' },
  { category: 'collaboration', retentionDays: 30 },
  { category: 'social', retentionDays: 90 },
];

/**
 * Visual display configuration for notification types
 */
export interface NotificationDisplayConfig {
  type: NotificationTypeEnumValue | NotificationType;
  visualPriority: VisualPriority;
  iconColor: string;
  backgroundColor: {
    unread: string;
    read: string;
  };
  canPin: boolean;
}

/**
 * Default display configurations for notifications
 */
export const DISPLAY_CONFIGS: NotificationDisplayConfig[] = [
  // High priority - colored icon, highlighted background
  { type: 'mentioned', visualPriority: 'high', iconColor: 'blue', backgroundColor: { unread: 'bg-blue-50', read: 'bg-transparent' }, canPin: false },
  { type: 'comment_replied', visualPriority: 'high', iconColor: 'green', backgroundColor: { unread: 'bg-green-50', read: 'bg-transparent' }, canPin: false },

  // Medium priority - colored icon, normal background
  { type: 'comment_added', visualPriority: 'medium', iconColor: 'gray', backgroundColor: { unread: 'bg-gray-50', read: 'bg-transparent' }, canPin: false },
  { type: 'task_assigned', visualPriority: 'medium', iconColor: 'purple', backgroundColor: { unread: 'bg-purple-50', read: 'bg-transparent' }, canPin: false },
  { type: 'task_completed', visualPriority: 'medium', iconColor: 'green', backgroundColor: { unread: 'bg-green-50', read: 'bg-transparent' }, canPin: false },
  { type: 'export_ready', visualPriority: 'medium', iconColor: 'blue', backgroundColor: { unread: 'bg-blue-50', read: 'bg-transparent' }, canPin: false },

  // Low priority - gray icon, muted background
  { type: 'post_liked', visualPriority: 'low', iconColor: 'gray', backgroundColor: { unread: 'bg-gray-50', read: 'bg-transparent' }, canPin: false },
  { type: 'user_followed', visualPriority: 'low', iconColor: 'gray', backgroundColor: { unread: 'bg-gray-50', read: 'bg-transparent' }, canPin: false },

  // System - supports pinning
  { type: 'system_alert', visualPriority: 'high', iconColor: 'red', backgroundColor: { unread: 'bg-red-50', read: 'bg-transparent' }, canPin: true },
  { type: 'system_warning', visualPriority: 'high', iconColor: 'orange', backgroundColor: { unread: 'bg-orange-50', read: 'bg-transparent' }, canPin: true },

  // Legacy types mapping
  { type: 'info', visualPriority: 'medium', iconColor: 'blue', backgroundColor: { unread: 'bg-blue-50', read: 'bg-transparent' }, canPin: false },
  { type: 'success', visualPriority: 'medium', iconColor: 'green', backgroundColor: { unread: 'bg-green-50', read: 'bg-transparent' }, canPin: false },
  { type: 'warning', visualPriority: 'high', iconColor: 'orange', backgroundColor: { unread: 'bg-orange-50', read: 'bg-transparent' }, canPin: false },
  { type: 'error', visualPriority: 'high', iconColor: 'red', backgroundColor: { unread: 'bg-red-50', read: 'bg-transparent' }, canPin: false },
];
