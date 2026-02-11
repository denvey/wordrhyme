/**
 * Notification Constants
 *
 * Retention policies and display configurations for the notification system.
 */

import type { NotificationCategory } from '@wordrhyme/db';

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
  { category: 'system', retentionDays: 90 },
  { category: 'collaboration', retentionDays: 30 },
  { category: 'social', retentionDays: 14 },
];

/**
 * Display configuration for notifications
 */
export interface DisplayConfig {
  category: NotificationCategory;
  icon: string;
  color: string;
  defaultExpanded: boolean;
}

/**
 * Default display configurations for notifications
 */
export const DISPLAY_CONFIGS: DisplayConfig[] = [
  { category: 'system', icon: 'bell', color: 'blue', defaultExpanded: true },
  { category: 'collaboration', icon: 'users', color: 'green', defaultExpanded: true },
  { category: 'social', icon: 'heart', color: 'red', defaultExpanded: false },
];
