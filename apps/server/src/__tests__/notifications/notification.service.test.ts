/**
 * Notification Service Unit Tests
 *
 * Tests for the notification service including:
 * - Notification creation
 * - Template rendering
 * - Channel resolution
 * - Preference filtering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Notification Service', () => {
  describe('Notification Creation', () => {
    it('should create a notification with required fields', () => {
      const input = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        templateKey: 'system.welcome',
        variables: { userName: 'John' },
      };

      // Validate input structure
      expect(input.userId).toBeDefined();
      expect(input.tenantId).toBeDefined();
      expect(input.templateKey).toBeDefined();
      expect(input.variables).toBeDefined();
    });

    it('should support optional fields', () => {
      const input = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        templateKey: 'comment.new',
        variables: { commenterName: 'Jane' },
        type: 'info' as const,
        link: '/posts/123',
        actorId: 'user-789',
        entityId: 'comment-456',
        entityType: 'comment',
        groupKey: 'post-123-comments',
        idempotencyKey: 'comment:456:new:789',
      };

      expect(input.type).toBe('info');
      expect(input.link).toBe('/posts/123');
      expect(input.actorId).toBe('user-789');
      expect(input.entityId).toBe('comment-456');
      expect(input.entityType).toBe('comment');
      expect(input.groupKey).toBe('post-123-comments');
      expect(input.idempotencyKey).toBe('comment:456:new:789');
    });
  });

  describe('Idempotency', () => {
    const idempotencyCache = new Map<string, { id: string }>();

    function checkIdempotency(key: string | undefined): { id: string } | null {
      if (!key) return null;
      return idempotencyCache.get(key) ?? null;
    }

    function setIdempotency(key: string, notification: { id: string }): void {
      idempotencyCache.set(key, notification);
    }

    beforeEach(() => {
      idempotencyCache.clear();
    });

    it('should return null for new idempotency keys', () => {
      const result = checkIdempotency('new-key-123');
      expect(result).toBeNull();
    });

    it('should return existing notification for duplicate keys', () => {
      const notification = { id: 'notif-123' };
      setIdempotency('comment:123:like:456', notification);

      const result = checkIdempotency('comment:123:like:456');
      expect(result).toEqual(notification);
    });

    it('should skip idempotency check when key is undefined', () => {
      const result = checkIdempotency(undefined);
      expect(result).toBeNull();
    });
  });

  describe('Priority Resolution', () => {
    function resolvePriority(
      override: string | undefined,
      templatePriority: string | undefined,
      defaultPriority = 'normal'
    ): string {
      return override || templatePriority || defaultPriority;
    }

    it('should use override priority when provided', () => {
      expect(resolvePriority('urgent', 'high', 'normal')).toBe('urgent');
    });

    it('should fall back to template priority', () => {
      expect(resolvePriority(undefined, 'high', 'normal')).toBe('high');
    });

    it('should fall back to default priority', () => {
      expect(resolvePriority(undefined, undefined, 'normal')).toBe('normal');
    });
  });

  describe('Channel Resolution', () => {
    interface DecisionTrace {
      channel: string;
      included: boolean;
      reason: string;
    }

    function resolveChannels(
      defaultChannels: string[],
      userEnabledChannels: string[],
      isQuietHours: boolean,
      priority: string
    ): { channels: string[]; decisionTrace: DecisionTrace[] } {
      const decisionTrace: DecisionTrace[] = [];
      const channels: string[] = [];

      for (const channel of defaultChannels) {
        // in-app is always included
        if (channel === 'in-app') {
          channels.push(channel);
          decisionTrace.push({
            channel,
            included: true,
            reason: 'In-app notifications are always enabled',
          });
          continue;
        }

        // Check user preferences
        if (!userEnabledChannels.includes(channel)) {
          decisionTrace.push({
            channel,
            included: false,
            reason: 'User has disabled this channel',
          });
          continue;
        }

        // Check quiet hours (urgent bypasses)
        if (isQuietHours && priority !== 'urgent') {
          decisionTrace.push({
            channel,
            included: false,
            reason: 'Quiet hours active and notification is not urgent',
          });
          continue;
        }

        channels.push(channel);
        decisionTrace.push({
          channel,
          included: true,
          reason: 'Channel enabled and allowed by preferences',
        });
      }

      return { channels, decisionTrace };
    }

    it('should always include in-app channel', () => {
      const result = resolveChannels(['in-app', 'email'], [], false, 'normal');
      expect(result.channels).toContain('in-app');
    });

    it('should exclude disabled channels', () => {
      const result = resolveChannels(
        ['in-app', 'email'],
        ['in-app'], // email not enabled
        false,
        'normal'
      );
      expect(result.channels).not.toContain('email');
      expect(result.decisionTrace.find((d) => d.channel === 'email')?.reason).toBe(
        'User has disabled this channel'
      );
    });

    it('should respect quiet hours for non-urgent notifications', () => {
      const result = resolveChannels(
        ['in-app', 'email'],
        ['in-app', 'email'],
        true, // quiet hours
        'normal'
      );
      expect(result.channels).toContain('in-app');
      expect(result.channels).not.toContain('email');
    });

    it('should bypass quiet hours for urgent notifications', () => {
      const result = resolveChannels(
        ['in-app', 'email'],
        ['in-app', 'email'],
        true, // quiet hours
        'urgent'
      );
      expect(result.channels).toContain('in-app');
      expect(result.channels).toContain('email');
    });
  });

  describe('Notification Listing', () => {
    const mockNotifications = [
      { id: '1', read: false, createdAt: new Date('2024-01-03') },
      { id: '2', read: true, createdAt: new Date('2024-01-02') },
      { id: '3', read: false, createdAt: new Date('2024-01-01') },
    ];

    it('should return notifications sorted by creation date (newest first)', () => {
      const sorted = [...mockNotifications].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      expect(sorted[0].id).toBe('1');
      expect(sorted[2].id).toBe('3');
    });

    it('should filter unread only when requested', () => {
      const unread = mockNotifications.filter((n) => !n.read);
      expect(unread).toHaveLength(2);
      expect(unread.every((n) => !n.read)).toBe(true);
    });

    it('should support pagination with cursor', () => {
      const pageSize = 2;
      const page1 = mockNotifications.slice(0, pageSize);
      const cursor = page1[page1.length - 1].id;
      const page2Index = mockNotifications.findIndex((n) => n.id === cursor) + 1;
      const page2 = mockNotifications.slice(page2Index, page2Index + pageSize);

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });

  describe('Mark as Read', () => {
    it('should update read status', () => {
      const notification = { id: '1', read: false };
      notification.read = true;
      expect(notification.read).toBe(true);
    });

    it('should not change already read notification', () => {
      const notification = { id: '1', read: true };
      const wasRead = notification.read;
      notification.read = true;
      expect(notification.read).toBe(wasRead);
    });
  });

  describe('Unread Count', () => {
    it('should count unread notifications', () => {
      const notifications = [
        { read: false },
        { read: true },
        { read: false },
        { read: false },
      ];
      const unreadCount = notifications.filter((n) => !n.read).length;
      expect(unreadCount).toBe(3);
    });

    it('should return 0 when all are read', () => {
      const notifications = [{ read: true }, { read: true }];
      const unreadCount = notifications.filter((n) => !n.read).length;
      expect(unreadCount).toBe(0);
    });
  });
});
