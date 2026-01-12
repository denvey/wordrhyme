/**
 * NotificationItem Component
 *
 * Single notification display with type-based styling,
 * actor/entity references, aggregation support, and action buttons.
 * Supports unified notification contract for SaaS + Social scenarios.
 */
import { formatDistanceToNow } from 'date-fns';
import {
    Info,
    CheckCircle,
    AlertTriangle,
    XCircle,
    Check,
    ExternalLink,
    Pin,
    Users,
} from 'lucide-react';
import { Button, cn, Avatar, AvatarImage, AvatarFallback } from '@wordrhyme/ui';

/**
 * Actor information for notification
 */
export interface NotificationActor {
    id: string;
    type: 'user' | 'system' | 'plugin';
    name: string;
    avatarUrl?: string;
}

/**
 * Target object for notification
 */
export interface NotificationTarget {
    type: string;
    id: string;
    url: string;
    previewImage?: string;
}

/**
 * Group information for aggregated notifications
 */
export interface GroupInfo {
    key: string;
    count: number;
    latestActors: NotificationActor[];
}

export interface NotificationData {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error' | string;
    title: string;
    message: string;
    read: boolean;
    link?: string | null;
    actorId?: string | null;
    entityId?: string | null;
    entityType?: string | null;
    createdAt: string | Date;
    // New unified contract fields
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

const typeConfig: { [key: string]: { icon: typeof Info; className: string; bgClassName: string } } = {
    info: {
        icon: Info,
        className: 'text-blue-500',
        bgClassName: 'bg-blue-50 dark:bg-blue-950',
    },
    success: {
        icon: CheckCircle,
        className: 'text-green-500',
        bgClassName: 'bg-green-50 dark:bg-green-950',
    },
    warning: {
        icon: AlertTriangle,
        className: 'text-yellow-500',
        bgClassName: 'bg-yellow-50 dark:bg-yellow-950',
    },
    error: {
        icon: XCircle,
        className: 'text-red-500',
        bgClassName: 'bg-red-50 dark:bg-red-950',
    },
    // New notification types
    system_alert: {
        icon: XCircle,
        className: 'text-red-500',
        bgClassName: 'bg-red-50 dark:bg-red-950',
    },
    system_warning: {
        icon: AlertTriangle,
        className: 'text-orange-500',
        bgClassName: 'bg-orange-50 dark:bg-orange-950',
    },
    mentioned: {
        icon: Info,
        className: 'text-blue-500',
        bgClassName: 'bg-blue-50 dark:bg-blue-950',
    },
    comment_replied: {
        icon: CheckCircle,
        className: 'text-green-500',
        bgClassName: 'bg-green-50 dark:bg-green-950',
    },
};

/**
 * Stacked avatars component for aggregated notifications
 */
function StackedAvatars({ actors, maxDisplay = 3 }: { actors: NotificationActor[]; maxDisplay?: number }) {
    const displayed = actors.slice(0, maxDisplay);
    const remaining = actors.length - maxDisplay;

    return (
        <div className="flex -space-x-2">
            {displayed.map((actor, index) => (
                <Avatar key={actor.id} className="h-6 w-6 border-2 border-background" style={{ zIndex: displayed.length - index }}>
                    {actor.avatarUrl ? (
                        <AvatarImage src={actor.avatarUrl} alt={actor.name} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                        {actor.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            ))}
            {remaining > 0 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium">
                    +{remaining}
                </div>
            )}
        </div>
    );
}

export function NotificationItem({
    notification,
    onMarkAsRead,
    onMarkGroupAsRead,
    onPin,
    onUnpin,
}: NotificationItemProps) {
    const config = typeConfig[notification.type] ?? typeConfig['info']!;
    const Icon = config.icon;
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

    // Generate aggregated title
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
            className={cn(
                'flex gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer relative',
                !notification.read && config.bgClassName,
                notification.pinned && 'border-l-2 border-l-primary'
            )}
            onClick={handleClick}
        >
            {/* Pinned indicator */}
            {notification.pinned && (
                <div className="absolute top-1 right-1">
                    <Pin className="h-3 w-3 text-primary" />
                </div>
            )}

            {/* Icon or Stacked Avatars */}
            <div className={cn('flex-shrink-0 mt-0.5', config.className)}>
                {isGrouped && notification.groupInfo?.latestActors.length ? (
                    <StackedAvatars actors={notification.groupInfo.latestActors} />
                ) : notification.actor?.avatarUrl ? (
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={notification.actor.avatarUrl} alt={notification.actor.name} />
                        <AvatarFallback>{notification.actor.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                ) : (
                    <Icon className="h-5 w-5" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <p
                            className={cn(
                                'text-sm font-medium truncate',
                                !notification.read && 'font-semibold'
                            )}
                        >
                            {getDisplayTitle()}
                        </p>
                        {isGrouped && notification.groupInfo && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                {notification.groupInfo.count}
                            </span>
                        )}
                    </div>
                    {!notification.read && (
                        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
                    )}
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                    {notification.message}
                </p>

                {/* Preview image for social notifications */}
                {notification.target?.previewImage && (
                    <img
                        src={notification.target.previewImage}
                        alt=""
                        className="mt-2 h-16 w-auto rounded object-cover"
                    />
                )}

                <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(createdAt, { addSuffix: true })}
                    </span>

                    <div className="flex items-center gap-1">
                        {/* Pin/Unpin for system notifications */}
                        {notification.category === 'system' && (
                            notification.pinned ? (
                                onUnpin && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUnpin(notification.id);
                                        }}
                                        title="Unpin"
                                    >
                                        <Pin className="h-3 w-3 fill-current" />
                                    </Button>
                                )
                            ) : (
                                onPin && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPin(notification.id);
                                        }}
                                        title="Pin"
                                    >
                                        <Pin className="h-3 w-3" />
                                    </Button>
                                )
                            )
                        )}
                        {(notification.link || notification.target?.url) && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(notification.target?.url || notification.link!, '_blank');
                                }}
                            >
                                <ExternalLink className="h-3 w-3" />
                            </Button>
                        )}
                        {!notification.read && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isGrouped && onMarkGroupAsRead && notification.groupInfo) {
                                        onMarkGroupAsRead(notification.groupInfo.key);
                                    } else {
                                        onMarkAsRead(notification.id);
                                    }
                                }}
                            >
                                <Check className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
