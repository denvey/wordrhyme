/**
 * Notification View Strategy System
 *
 * Implements the Strategy pattern for different notification display modes:
 * - InboxStrategy: Traditional SaaS inbox (no aggregation, all visible)
 * - SocialFeedStrategy: Social-style feed (aggregated, time-based visibility)
 */

import type {
  Notification,
  NotificationCategory,
  VisualPriority,
} from '@wordrhyme/db';

/**
 * View context for strategy decisions
 */
export interface ViewContext {
  userId: string;
  organizationId: string;
  now: Date;
}

/**
 * Base strategy interface
 */
export interface NotificationViewStrategy {
  id: 'inbox' | 'social-feed';

  /**
   * Determine if a notification should be visible in this view
   */
  isVisible(notification: Notification, ctx: ViewContext): boolean;

  /**
   * Get display priority for sorting (higher = more important)
   */
  priority(notification: Notification): number;

  /**
   * Determine if this notification can be grouped with others
   */
  canGroup(notification: Notification): boolean;

  /**
   * Generate group key for aggregation (optional)
   */
  groupKey?(notification: Notification): string | null;
}

/**
 * Inbox Strategy - Traditional SaaS notification inbox
 *
 * Features:
 * - All notifications visible (no time-based filtering)
 * - No aggregation by default
 * - Priority based on pinned status and read state
 */
export class InboxStrategy implements NotificationViewStrategy {
  readonly id = 'inbox' as const;

  isVisible(notification: Notification, _ctx: ViewContext): boolean {
    // In inbox, all non-archived notifications are visible
    return !notification.archived;
  }

  priority(notification: Notification): number {
    let score = 0;

    // Pinned notifications get highest priority
    if (notification.pinned) score += 1000;

    // Unread notifications get higher priority
    if (!notification.read) score += 100;

    // Visual priority adds additional weight
    const visualPriority = notification.visualPriority as VisualPriority;
    if (visualPriority === 'high') score += 50;
    else if (visualPriority === 'medium') score += 25;

    return score;
  }

  canGroup(_notification: Notification): boolean {
    // Inbox strategy does not group by default
    return false;
  }

  groupKey(_notification: Notification): string | null {
    return null;
  }
}

/**
 * Social Feed Strategy - Social-style notification feed
 *
 * Features:
 * - Time-based visibility (social notifications fade after TTL)
 * - Aggregation by target ("Alice and 4 others liked your post")
 * - Higher priority for mentions and direct interactions
 */
export class SocialFeedStrategy implements NotificationViewStrategy {
  readonly id = 'social-feed' as const;

  // Time-to-live in milliseconds for different categories
  private static readonly CATEGORY_TTL: Record<NotificationCategory, number> = {
    system: Number.POSITIVE_INFINITY, // System notifications never expire in view
    collaboration: 30 * 24 * 60 * 60 * 1000, // 30 days
    social: 90 * 24 * 60 * 60 * 1000, // 90 days
  };

  isVisible(notification: Notification, ctx: ViewContext): boolean {
    if (notification.archived) return false;

    const category = notification.category as NotificationCategory;
    const ttl = SocialFeedStrategy.CATEGORY_TTL[category] || Number.POSITIVE_INFINITY;

    if (ttl === Number.POSITIVE_INFINITY) return true;

    const age = ctx.now.getTime() - notification.createdAt.getTime();
    return age < ttl;
  }

  priority(notification: Notification): number {
    let score = 0;

    // Pinned notifications get highest priority
    if (notification.pinned) score += 1000;

    // Unread notifications get higher priority
    if (!notification.read) score += 100;

    // Category-based priority
    const category = notification.category as NotificationCategory;
    if (category === 'system') score += 75;
    else if (category === 'collaboration') score += 50;
    // social gets no bonus

    // Visual priority
    const visualPriority = notification.visualPriority as VisualPriority;
    if (visualPriority === 'high') score += 30;
    else if (visualPriority === 'medium') score += 15;

    return score;
  }

  canGroup(notification: Notification): boolean {
    // Social and collaboration notifications can be grouped
    const category = notification.category as NotificationCategory;
    return category === 'social' || category === 'collaboration';
  }

  groupKey(notification: Notification): string | null {
    if (!this.canGroup(notification)) return null;

    // Group by aggregation strategy
    const strategy = notification.aggregationStrategy;
    const target = notification.target as { type?: string; id?: string } | null;

    switch (strategy) {
      case 'by_target':
        // Group by target (e.g., all likes on the same post)
        if (target?.type && target?.id) {
          return `${notification.type}:${target.type}:${target.id}`;
        }
        return null;

      case 'by_actor':
        // Group by actor (e.g., all actions by the same user)
        if (notification.actorId) {
          return `${notification.type}:actor:${notification.actorId}`;
        }
        return null;

      case 'by_type':
        // Group by type (e.g., all system notifications)
        return `${notification.type}:${notification.category}`;

      case 'none':
      default:
        return null;
    }
  }
}

/**
 * Strategy Registry - Factory for getting strategies
 */
export class ViewStrategyRegistry {
  private static strategies: Map<string, NotificationViewStrategy> = new Map();

  static {
    this.strategies.set('inbox', new InboxStrategy());
    this.strategies.set('social-feed', new SocialFeedStrategy());
  }

  static get(id: 'inbox' | 'social-feed'): NotificationViewStrategy {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      throw new Error(`Unknown view strategy: ${id}`);
    }
    return strategy;
  }

  static getDefault(): NotificationViewStrategy {
    return this.get('inbox');
  }

  static register(strategy: NotificationViewStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }
}

/**
 * Type guard for checking strategy type
 */
export function isInboxStrategy(
  strategy: NotificationViewStrategy
): strategy is InboxStrategy {
  return strategy.id === 'inbox';
}

export function isSocialFeedStrategy(
  strategy: NotificationViewStrategy
): strategy is SocialFeedStrategy {
  return strategy.id === 'social-feed';
}
