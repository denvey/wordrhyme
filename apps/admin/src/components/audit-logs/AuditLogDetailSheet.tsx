/**
 * Audit Log Detail Sheet
 *
 * Side panel showing detailed information about a single audit event
 * including actor info, changes diff, and metadata.
 */
import { format } from 'date-fns';
import {
    User,
    Bot,
    Puzzle,
    Key,
    Clock,
    Globe,
    Monitor,
    Hash,
    FileJson,
    History,
} from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    Badge,
    Separator,
    ScrollArea,
} from '@wordrhyme/ui';
import { JsonDiffViewer } from './JsonDiffViewer';

interface AuditEvent {
    id: string;
    entityType: string;
    entityId?: string | null;
    action: string;
    actorId: string;
    actorType: 'user' | 'system' | 'plugin' | 'api-token';
    actorIp?: string | null;
    userAgent?: string | null;
    traceId?: string | null;
    requestId?: string | null;
    sessionId?: string | null;
    createdAt: Date | string;
    changes?: { old?: unknown; new?: unknown } | null;
    metadata?: Record<string, unknown> | null;
}

interface AuditLogDetailSheetProps {
    event: AuditEvent | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const ACTOR_TYPE_CONFIG = {
    user: { icon: User, label: 'User', color: 'text-blue-500' },
    system: { icon: Bot, label: 'System', color: 'text-gray-500' },
    plugin: { icon: Puzzle, label: 'Plugin', color: 'text-purple-500' },
    'api-token': { icon: Key, label: 'API Token', color: 'text-amber-500' },
};

export function AuditLogDetailSheet({ event, open, onOpenChange }: AuditLogDetailSheetProps) {
    if (!event) return null;

    const actorConfig = ACTOR_TYPE_CONFIG[event.actorType] || ACTOR_TYPE_CONFIG.user;
    const ActorIcon = actorConfig.icon;
    const createdAt = typeof event.createdAt === 'string' ? new Date(event.createdAt) : event.createdAt;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Audit Event Details
                    </SheetTitle>
                    <SheetDescription>
                        {event.entityType} - {event.action}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
                    <div className="space-y-6 py-4">
                        {/* Event Info */}
                        <section>
                            <h3 className="text-sm font-medium mb-3 text-muted-foreground">Event Information</h3>
                            <div className="space-y-3">
                                <InfoRow
                                    icon={<Clock className="h-4 w-4" />}
                                    label="Timestamp"
                                    value={format(createdAt, 'yyyy-MM-dd HH:mm:ss.SSS')}
                                    mono
                                />
                                <InfoRow
                                    icon={<FileJson className="h-4 w-4" />}
                                    label="Entity Type"
                                    value={event.entityType}
                                />
                                {event.entityId && (
                                    <InfoRow
                                        icon={<Hash className="h-4 w-4" />}
                                        label="Entity ID"
                                        value={event.entityId}
                                        mono
                                    />
                                )}
                                <InfoRow
                                    icon={<History className="h-4 w-4" />}
                                    label="Action"
                                    value={
                                        <Badge variant="secondary">{event.action}</Badge>
                                    }
                                />
                            </div>
                        </section>

                        <Separator />

                        {/* Actor Info */}
                        <section>
                            <h3 className="text-sm font-medium mb-3 text-muted-foreground">Actor Information</h3>
                            <div className="space-y-3">
                                <InfoRow
                                    icon={<ActorIcon className={`h-4 w-4 ${actorConfig.color}`} />}
                                    label="Actor Type"
                                    value={
                                        <Badge variant="outline">
                                            {actorConfig.label}
                                        </Badge>
                                    }
                                />
                                <InfoRow
                                    icon={<User className="h-4 w-4" />}
                                    label="Actor ID"
                                    value={event.actorId}
                                    mono
                                />
                                {event.actorIp && (
                                    <InfoRow
                                        icon={<Globe className="h-4 w-4" />}
                                        label="IP Address"
                                        value={event.actorIp}
                                        mono
                                    />
                                )}
                                {event.userAgent && (
                                    <InfoRow
                                        icon={<Monitor className="h-4 w-4" />}
                                        label="User Agent"
                                        value={event.userAgent}
                                        truncate
                                    />
                                )}
                            </div>
                        </section>

                        <Separator />

                        {/* Tracing Info */}
                        {(event.traceId || event.requestId || event.sessionId) && (
                            <>
                                <section>
                                    <h3 className="text-sm font-medium mb-3 text-muted-foreground">Tracing</h3>
                                    <div className="space-y-3">
                                        {event.traceId && (
                                            <InfoRow
                                                icon={<Hash className="h-4 w-4" />}
                                                label="Trace ID"
                                                value={event.traceId}
                                                mono
                                            />
                                        )}
                                        {event.requestId && (
                                            <InfoRow
                                                icon={<Hash className="h-4 w-4" />}
                                                label="Request ID"
                                                value={event.requestId}
                                                mono
                                            />
                                        )}
                                        {event.sessionId && (
                                            <InfoRow
                                                icon={<Hash className="h-4 w-4" />}
                                                label="Session ID"
                                                value={event.sessionId}
                                                mono
                                            />
                                        )}
                                    </div>
                                </section>
                                <Separator />
                            </>
                        )}

                        {/* Changes */}
                        {event.changes && (event.changes.old || event.changes.new) && (
                            <section>
                                <h3 className="text-sm font-medium mb-3 text-muted-foreground">Changes</h3>
                                <JsonDiffViewer
                                    oldValue={event.changes.old}
                                    newValue={event.changes.new}
                                />
                            </section>
                        )}

                        {/* Metadata */}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <>
                                <Separator />
                                <section>
                                    <h3 className="text-sm font-medium mb-3 text-muted-foreground">Metadata</h3>
                                    <pre className="p-3 rounded-md bg-muted/50 border overflow-auto text-xs font-mono">
                                        {JSON.stringify(event.metadata, null, 2)}
                                    </pre>
                                </section>
                            </>
                        )}

                        {/* Event ID */}
                        <section>
                            <div className="text-xs text-muted-foreground font-mono">
                                Event ID: {event.id}
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

/**
 * Info Row Component
 */
function InfoRow({
    icon,
    label,
    value,
    mono = false,
    truncate = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode | string;
    mono?: boolean | undefined;
    truncate?: boolean | undefined;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="text-muted-foreground mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div
                    className={`text-sm ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`}
                    title={typeof value === 'string' ? value : undefined}
                >
                    {value}
                </div>
            </div>
        </div>
    );
}
