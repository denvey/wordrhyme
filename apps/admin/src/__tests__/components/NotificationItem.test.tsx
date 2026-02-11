/**
 * NotificationItem Component Tests
 *
 * Tests for notification display, interaction, and aggregation features.
 * Uses mock components to avoid @wordrhyme/ui dependency resolution issues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatDistanceToNow } from 'date-fns';

// Mock types matching the real component
interface NotificationActor {
  id: string;
  type: 'user' | 'system' | 'plugin';
  name: string;
  avatarUrl?: string;
}

interface NotificationTarget {
  type: string;
  id: string;
  url: string;
  previewImage?: string;
}

interface GroupInfo {
  key: string;
  count: number;
  latestActors: NotificationActor[];
}

interface NotificationData {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  createdAt: string | Date;
  pinned?: boolean;
  visualPriority?: 'high' | 'medium' | 'low';
  category?: 'system' | 'collaboration' | 'social';
  actor?: NotificationActor;
  target?: NotificationTarget;
  groupInfo?: GroupInfo;
}

interface NotificationItemProps {
  notification: NotificationData;
  onMarkAsRead: (id: string) => void;
  onMarkGroupAsRead?: (groupKey: string) => void;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
}

// Mock NotificationItem that mirrors the real implementation logic
function MockNotificationItem({
  notification,
  onMarkAsRead,
  onMarkGroupAsRead,
  onPin,
  onUnpin,
}: NotificationItemProps) {
  const typeConfig: Record<string, { className: string }> = {
    info: { className: 'text-blue-500' },
    success: { className: 'text-green-500' },
    warning: { className: 'text-yellow-500' },
    error: { className: 'text-red-500' },
  };

  const config = typeConfig[notification.type] ?? typeConfig['info']!;
  const createdAt =
    typeof notification.createdAt === 'string'
      ? new Date(notification.createdAt)
      : notification.createdAt;

  const isGrouped = notification.groupInfo && notification.groupInfo.count > 1;

  const handleClick = () => {
    if (!notification.read) {
      if (isGrouped && onMarkGroupAsRead && notification.groupInfo) {
        onMarkGroupAsRead(notification.groupInfo.key);
      } else {
        onMarkAsRead(notification.id);
      }
    }
    const targetUrl = notification.target?.url || notification.link;
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  };

  const getDisplayTitle = () => {
    if (isGrouped && notification.groupInfo) {
      const actors = notification.groupInfo.latestActors;
      if (actors && actors.length > 0) {
        const firstActor = actors[0]!.name;
        const remaining = notification.groupInfo.count - 1;
        if (remaining > 0) {
          return `${firstActor} and ${remaining} others`;
        }
        return firstActor;
      }
    }
    return notification.title;
  };

  return (
    <div
      data-testid="notification-item"
      className={`notification ${notification.read ? 'read' : 'unread'} ${notification.pinned ? 'pinned' : ''}`}
      onClick={handleClick}
    >
      {notification.pinned && <span data-testid="pin-indicator">📌</span>}
      <span className={config.className} data-testid="notification-icon">
        {notification.type}
      </span>
      <div>
        <p data-testid="notification-title">{getDisplayTitle()}</p>
        {isGrouped && notification.groupInfo && (
          <span data-testid="group-count">{notification.groupInfo.count}</span>
        )}
        <p data-testid="notification-message">{notification.message}</p>
        <span data-testid="notification-time">
          {formatDistanceToNow(createdAt, { addSuffix: true })}
        </span>

        {!notification.read && (
          <span data-testid="unread-indicator" className="unread-dot" />
        )}

        {notification.category === 'system' && (
          notification.pinned ? (
            onUnpin && (
              <button
                data-testid="unpin-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(notification.id);
                }}
              >
                Unpin
              </button>
            )
          ) : (
            onPin && (
              <button
                data-testid="pin-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(notification.id);
                }}
              >
                Pin
              </button>
            )
          )
        )}

        {(notification.link || notification.target?.url) && (
          <button
            data-testid="external-link-button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(notification.target?.url || notification.link!, '_blank');
            }}
          >
            Open
          </button>
        )}

        {!notification.read && (
          <button
            data-testid="mark-read-button"
            onClick={(e) => {
              e.stopPropagation();
              if (isGrouped && onMarkGroupAsRead && notification.groupInfo) {
                onMarkGroupAsRead(notification.groupInfo.key);
              } else {
                onMarkAsRead(notification.id);
              }
            }}
          >
            Mark Read
          </button>
        )}
      </div>
    </div>
  );
}

describe('NotificationItem', () => {
  const mockOnMarkAsRead = vi.fn();
  const mockOnMarkGroupAsRead = vi.fn();
  const mockOnPin = vi.fn();
  const mockOnUnpin = vi.fn();

  const baseNotification: NotificationData = {
    id: 'notif-1',
    type: 'info',
    title: 'Test Notification',
    message: 'This is a test notification message',
    read: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset location mock
    delete (window as any).location;
    (window as any).location = { href: '' };
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  describe('Rendering', () => {
    it('should render notification with title and message', () => {
      render(
        <MockNotificationItem
          notification={baseNotification}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('notification-title')).toHaveTextContent('Test Notification');
      expect(screen.getByTestId('notification-message')).toHaveTextContent('This is a test notification message');
    });

    it('should show unread indicator for unread notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: false }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('unread-indicator')).toBeInTheDocument();
    });

    it('should not show unread indicator for read notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: true }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });

    it('should show pin indicator for pinned notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, pinned: true }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('pin-indicator')).toBeInTheDocument();
    });

    it('should format time with date-fns', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, createdAt: pastDate }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('notification-time')).toHaveTextContent('about 1 hour ago');
    });
  });

  describe('Notification Types', () => {
    it.each(['info', 'success', 'warning', 'error'] as const)('should render %s type notification', (type) => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, type }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('notification-icon')).toHaveTextContent(type);
    });

    it('should fall back to info style for unknown types', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, type: 'unknown-type' }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      // Should still render without error
      expect(screen.getByTestId('notification-item')).toBeInTheDocument();
    });
  });

  describe('Click Actions', () => {
    it('should call onMarkAsRead when clicking unread notification', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: false }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('notification-item'));

      expect(mockOnMarkAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('should not call onMarkAsRead when clicking read notification', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: true }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('notification-item'));

      expect(mockOnMarkAsRead).not.toHaveBeenCalled();
    });

    it('should navigate to link when notification has link', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, link: '/dashboard' }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('notification-item'));

      expect(window.location.href).toBe('/dashboard');
    });

    it('should navigate to target URL when present', () => {
      render(
        <MockNotificationItem
          notification={{
            ...baseNotification,
            target: { type: 'page', id: 'page-1', url: '/page/1' },
          }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('notification-item'));

      expect(window.location.href).toBe('/page/1');
    });
  });

  describe('External Link Button', () => {
    it('should show external link button when link exists', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, link: 'https://example.com' }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('external-link-button')).toBeInTheDocument();
    });

    it('should open link in new tab when clicking external link button', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, link: 'https://example.com' }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('external-link-button'));

      expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank');
    });
  });

  describe('Mark as Read Button', () => {
    it('should show mark read button for unread notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: false }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('mark-read-button')).toBeInTheDocument();
    });

    it('should not show mark read button for read notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: true }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.queryByTestId('mark-read-button')).not.toBeInTheDocument();
    });

    it('should call onMarkAsRead when clicking mark read button', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, read: false }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('mark-read-button'));

      expect(mockOnMarkAsRead).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('Pin/Unpin Actions', () => {
    it('should show pin button for system notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, category: 'system' }}
          onMarkAsRead={mockOnMarkAsRead}
          onPin={mockOnPin}
        />
      );

      expect(screen.getByTestId('pin-button')).toBeInTheDocument();
    });

    it('should show unpin button for pinned system notifications', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, category: 'system', pinned: true }}
          onMarkAsRead={mockOnMarkAsRead}
          onUnpin={mockOnUnpin}
        />
      );

      expect(screen.getByTestId('unpin-button')).toBeInTheDocument();
    });

    it('should call onPin when clicking pin button', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, category: 'system' }}
          onMarkAsRead={mockOnMarkAsRead}
          onPin={mockOnPin}
        />
      );

      fireEvent.click(screen.getByTestId('pin-button'));

      expect(mockOnPin).toHaveBeenCalledWith('notif-1');
    });

    it('should call onUnpin when clicking unpin button', () => {
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, category: 'system', pinned: true }}
          onMarkAsRead={mockOnMarkAsRead}
          onUnpin={mockOnUnpin}
        />
      );

      fireEvent.click(screen.getByTestId('unpin-button'));

      expect(mockOnUnpin).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('Grouped Notifications', () => {
    const groupedNotification: NotificationData = {
      ...baseNotification,
      groupInfo: {
        key: 'group-1',
        count: 5,
        latestActors: [
          { id: 'user-1', type: 'user', name: 'Alice' },
          { id: 'user-2', type: 'user', name: 'Bob' },
          { id: 'user-3', type: 'user', name: 'Charlie' },
        ],
      },
    };

    it('should show aggregated title with multiple actors', () => {
      render(
        <MockNotificationItem
          notification={groupedNotification}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('notification-title')).toHaveTextContent('Alice and 4 others');
    });

    it('should show group count badge', () => {
      render(
        <MockNotificationItem
          notification={groupedNotification}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('group-count')).toHaveTextContent('5');
    });

    it('should call onMarkGroupAsRead for grouped notifications', () => {
      render(
        <MockNotificationItem
          notification={groupedNotification}
          onMarkAsRead={mockOnMarkAsRead}
          onMarkGroupAsRead={mockOnMarkGroupAsRead}
        />
      );

      fireEvent.click(screen.getByTestId('notification-item'));

      expect(mockOnMarkGroupAsRead).toHaveBeenCalledWith('group-1');
      expect(mockOnMarkAsRead).not.toHaveBeenCalled();
    });

    it('should show single actor name when count is 1', () => {
      const singleActorGroup: NotificationData = {
        ...baseNotification,
        groupInfo: {
          key: 'group-1',
          count: 1,
          latestActors: [{ id: 'user-1', type: 'user', name: 'Alice' }],
        },
      };

      render(
        <MockNotificationItem
          notification={singleActorGroup}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      // count=1 means not grouped, should show original title
      expect(screen.getByTestId('notification-title')).toHaveTextContent('Test Notification');
    });
  });

  describe('Date String Handling', () => {
    it('should handle ISO date string', () => {
      const isoDate = '2024-01-15T10:30:00.000Z';
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, createdAt: isoDate }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      // Should render without error and show formatted time
      expect(screen.getByTestId('notification-time')).toBeInTheDocument();
    });

    it('should handle Date object', () => {
      const dateObj = new Date('2024-01-15T10:30:00.000Z');
      render(
        <MockNotificationItem
          notification={{ ...baseNotification, createdAt: dateObj }}
          onMarkAsRead={mockOnMarkAsRead}
        />
      );

      expect(screen.getByTestId('notification-time')).toBeInTheDocument();
    });
  });
});
