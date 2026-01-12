import { useState } from 'react';
import { Bell, Check, CheckCheck, Loader2, Pin, Clock } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Button, Switch, Label } from '@wordrhyme/ui';
import { cn } from '@wordrhyme/ui';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  pinned?: boolean;
  category?: 'system' | 'collaboration' | 'social';
  createdAt: string;
  actorId?: string;
  entityType?: string;
}

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, refetch } = trpc.notification.list.useQuery({
    unreadOnly,
    limit: 50,
  });

  const { data: unreadData, refetch: refetchUnread } = trpc.notification.unreadCount.useQuery();

  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      refetch();
      refetchUnread();
    },
  });

  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      refetch();
      refetchUnread();
    },
  });

  const pinMutation = trpc.notification.pin.useMutation({
    onSuccess: () => refetch(),
  });

  const unpinMutation = trpc.notification.unpin.useMutation({
    onSuccess: () => refetch(),
  });

  const notifications = (data?.notifications || []) as Notification[];
  const unreadCount = unreadData?.count || 0;

  const pinnedNotifications = notifications.filter((n) => n.pinned);
  const timelineNotifications = notifications.filter((n) => !n.pinned);

  const getTypeStyles = (type: string, read: boolean) => {
    if (read) {
      return 'border-l-muted-foreground/30 bg-muted/30';
    }
    switch (type) {
      case 'success':
        return 'border-l-green-500 bg-green-50 dark:bg-green-950/20';
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
      case 'error':
        return 'border-l-red-500 bg-red-50 dark:bg-red-950/20';
      default:
        return 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handlePin = (id: string) => {
    pinMutation.mutate({ id });
    // Also mark as read when pinning
    const notification = notifications.find((n) => n.id === id);
    if (notification && !notification.read) {
      markAsReadMutation.mutate({ id });
    }
  };

  const handleUnpin = (id: string) => {
    unpinMutation.mutate({ id });
    // Also mark as read when unpinning
    const notification = notifications.find((n) => n.id === id);
    if (notification && !notification.read) {
      markAsReadMutation.mutate({ id });
    }
  };

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate({ id: notification.id });
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const renderNotification = (notification: Notification) => (
    <div
      key={notification.id}
      className={cn(
        'p-4 rounded-lg border-l-4 transition-colors cursor-pointer hover:opacity-80',
        getTypeStyles(notification.type, notification.read),
        notification.pinned && 'ring-1 ring-primary/30'
      )}
      onClick={() => handleClick(notification)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className={cn(
                'font-medium truncate',
                !notification.read ? 'font-semibold' : 'text-muted-foreground'
              )}
            >
              {notification.title}
            </h3>
            {!notification.read && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
            {notification.pinned && (
              <Pin className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>
          <p
            className={cn(
              'text-sm line-clamp-2',
              notification.read ? 'text-muted-foreground/70' : 'text-muted-foreground'
            )}
          >
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatDate(notification.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!notification.read && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                markAsReadMutation.mutate({ id: notification.id });
              }}
              disabled={markAsReadMutation.isPending}
              title="标记已读"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          {notification.category === 'system' && (
            notification.pinned ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnpin(notification.id);
                }}
                disabled={unpinMutation.isPending}
                title="取消置顶"
              >
                <Pin className="h-4 w-4 fill-current text-primary" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePin(notification.id);
                }}
                disabled={pinMutation.isPending}
                title="置顶"
              >
                <Pin className="h-4 w-4" />
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bell className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="unread-only-page"
              checked={unreadOnly}
              onCheckedChange={setUnreadOnly}
            />
            <Label htmlFor="unread-only-page" className="text-sm cursor-pointer">
              只看未读
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate({})}
            disabled={markAllAsReadMutation.isPending || unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        </div>
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{unreadOnly ? '没有未读通知' : '没有通知'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned Section */}
          {pinnedNotifications.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Pin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  置顶 ({pinnedNotifications.length})
                </span>
              </div>
              <div className="space-y-3">
                {pinnedNotifications.map(renderNotification)}
              </div>
            </div>
          )}

          {/* Timeline Section */}
          {timelineNotifications.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  最近
                </span>
              </div>
              <div className="space-y-3">
                {timelineNotifications.map(renderNotification)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Load more */}
      {data?.nextCursor && (
        <div className="mt-6 text-center">
          <Button variant="outline" size="sm">
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
