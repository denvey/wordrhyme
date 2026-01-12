/**
 * NotificationCenter Component
 *
 * Dropdown/popover for displaying user notifications with
 * unread badge, infinite scroll loading, mark as read actions,
 * and support for grouped/aggregated notifications.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Loader2, Pin, Clock } from 'lucide-react';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    ScrollArea,
    Badge,
    Separator,
    Switch,
    Label,
} from '@wordrhyme/ui';
import { trpc } from '../lib/trpc';
import { NotificationItem, type NotificationData } from './NotificationItem';

const NOTIFICATIONS_PER_PAGE = 10;

export function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [allNotifications, setAllNotifications] = useState<NotificationData[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const prevCursorRef = useRef<string | undefined>(undefined);

    // Query unread count
    const { data: unreadData, refetch: refetchUnread } =
        trpc.notification.unreadCount.useQuery(undefined, {
            refetchInterval: 30000, // Poll every 30 seconds
        });

    // Query notifications list
    const {
        data: notificationsData,
        isLoading,
        isFetching,
        refetch: refetchList,
    } = trpc.notification.list.useQuery(
        { limit: NOTIFICATIONS_PER_PAGE, cursor },
        {
            enabled: open,
            staleTime: 0, // Always refetch when opened
            refetchOnMount: 'always',
        }
    );

    // Mark as read mutation
    const markAsReadMutation = trpc.notification.markAsRead.useMutation({
        onSuccess: () => {
            refetchUnread();
            refetchList();
        },
    });

    // Mark group as read mutation
    const markGroupAsReadMutation = trpc.notification.markGroupAsRead.useMutation({
        onSuccess: () => {
            refetchUnread();
            refetchList();
        },
    });

    // Mark all as read mutation
    const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
        onSuccess: () => {
            refetchUnread();
            refetchList();
            setAllNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        },
    });

    // Pin mutation
    const pinMutation = trpc.notification.pin.useMutation({
        onSuccess: () => {
            refetchList();
        },
    });

    // Unpin mutation
    const unpinMutation = trpc.notification.unpin.useMutation({
        onSuccess: () => {
            refetchList();
        },
    });

    // Update notifications when data changes
    useEffect(() => {
        if (notificationsData?.notifications) {
            const isPaginating = cursor !== undefined && prevCursorRef.current !== cursor;

            if (isPaginating) {
                // Append for pagination (cursor changed)
                setAllNotifications((prev) => [
                    ...prev,
                    ...(notificationsData.notifications as NotificationData[]),
                ]);
            } else {
                // Replace for initial load or refetch
                setAllNotifications(notificationsData.notifications as NotificationData[]);
            }
            setHasMore(!!notificationsData.nextCursor);
            prevCursorRef.current = cursor;
        }
    }, [notificationsData, cursor]);

    // Reset on open change
    useEffect(() => {
        if (open) {
            // Reset pagination state when opening
            setCursor(undefined);
            prevCursorRef.current = undefined;
            setHasMore(true);
            // Don't clear allNotifications here - let the new data replace it
            // This prevents the flash of "No notifications" while loading
        }
    }, [open]);

    // Load more on scroll
    const handleScroll = useCallback(() => {
        if (!scrollRef.current || !hasMore || isFetching) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            if (notificationsData?.nextCursor) {
                setCursor(notificationsData.nextCursor);
            }
        }
    }, [hasMore, isFetching, notificationsData?.nextCursor]);

    const handleMarkAsRead = (id: string) => {
        markAsReadMutation.mutate({ id });
        setAllNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    };

    const handleMarkGroupAsRead = (groupKey: string) => {
        markGroupAsReadMutation.mutate({ groupKey });
        setAllNotifications((prev) =>
            prev.map((n) =>
                n.groupInfo?.key === groupKey ? { ...n, read: true } : n
            )
        );
    };

    const handleMarkAllAsRead = () => {
        markAllAsReadMutation.mutate({});
    };

    const handlePin = (id: string) => {
        pinMutation.mutate({ id });
        // Pin also marks as read (per Implicit Read Contract)
        const notification = allNotifications.find((n) => n.id === id);
        if (notification && !notification.read) {
            markAsReadMutation.mutate({ id });
        }
        setAllNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, pinned: true, read: true } : n))
        );
    };

    const handleUnpin = (id: string) => {
        unpinMutation.mutate({ id });
        // Unpin also marks as read (per design: "处理完了就取消置顶")
        const notification = allNotifications.find((n) => n.id === id);
        if (notification && !notification.read) {
            markAsReadMutation.mutate({ id });
        }
        setAllNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, pinned: false, read: true } : n))
        );
    };

    const unreadCount = unreadData?.count ?? 0;

    // Filter notifications based on unreadOnly toggle
    const displayedNotifications = unreadOnly
        ? allNotifications.filter((n) => !n.read)
        : allNotifications;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="Notifications"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                        >
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h4 className="font-semibold">Notifications</h4>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <Switch
                                id="unread-only"
                                checked={unreadOnly}
                                onCheckedChange={setUnreadOnly}
                                className="h-4 w-7"
                            />
                            <Label htmlFor="unread-only" className="text-xs text-muted-foreground cursor-pointer">
                                只看未读
                            </Label>
                        </div>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleMarkAllAsRead}
                                disabled={markAllAsReadMutation.isPending}
                            >
                                {markAllAsReadMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCheck className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                <ScrollArea
                    className="h-80"
                    ref={scrollRef}
                    onScrollCapture={handleScroll}
                >
                    {(isLoading || isFetching) && allNotifications.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : displayedNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2" />
                            <p className="text-sm">{unreadOnly ? '没有未读通知' : '没有通知'}</p>
                        </div>
                    ) : (
                        <div>
                            {/* Pinned Section */}
                            {displayedNotifications.filter((n) => n.pinned).length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                                        <Pin className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs font-medium text-muted-foreground">
                                            置顶 ({displayedNotifications.filter((n) => n.pinned).length})
                                        </span>
                                    </div>
                                    <div className="divide-y">
                                        {displayedNotifications
                                            .filter((n) => n.pinned)
                                            .map((notification) => (
                                                <NotificationItem
                                                    key={notification.id}
                                                    notification={notification}
                                                    onMarkAsRead={handleMarkAsRead}
                                                    onMarkGroupAsRead={handleMarkGroupAsRead}
                                                    onPin={handlePin}
                                                    onUnpin={handleUnpin}
                                                />
                                            ))}
                                    </div>
                                </div>
                            )}
                            {/* Timeline Section */}
                            {displayedNotifications.filter((n) => !n.pinned).length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs font-medium text-muted-foreground">
                                            最近
                                        </span>
                                    </div>
                                    <div className="divide-y">
                                        {displayedNotifications
                                            .filter((n) => !n.pinned)
                                            .map((notification) => (
                                                <NotificationItem
                                                    key={notification.id}
                                                    notification={notification}
                                                    onMarkAsRead={handleMarkAsRead}
                                                    onMarkGroupAsRead={handleMarkGroupAsRead}
                                                    onPin={handlePin}
                                                    onUnpin={handleUnpin}
                                                />
                                            ))}
                                    </div>
                                </div>
                            )}
                            {isFetching && (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                <Separator />
                <div className="p-2">
                    <Button
                        variant="ghost"
                        className="w-full text-sm"
                        onClick={() => {
                            setOpen(false);
                            // Navigate to full notifications page if needed
                        }}
                    >
                        View all notifications
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
