/**
 * Audit Log Table
 *
 * Displays audit events in a table format with pagination.
 */
import { format } from 'date-fns';
import { ExternalLink, User, Bot, Puzzle, Key } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Button,
} from '@wordrhyme/ui';

interface AuditEvent {
    id: string;
    entityType: string;
    entityId?: string | null;
    action: string;
    actorId: string;
    actorType: 'user' | 'system' | 'plugin' | 'api-token';
    actorIp?: string | null;
    traceId?: string | null;
    createdAt: Date | string;
    changes?: { old?: unknown; new?: unknown } | null;
    metadata?: Record<string, unknown> | null;
}

interface AuditLogTableProps {
    data: AuditEvent[];
    isLoading: boolean;
    onRowClick: (event: AuditEvent) => void;
}

const ACTOR_TYPE_ICONS = {
    user: User,
    system: Bot,
    plugin: Puzzle,
    'api-token': Key,
};

const ACTOR_TYPE_COLORS = {
    user: 'default',
    system: 'secondary',
    plugin: 'outline',
    'api-token': 'destructive',
} as const;

function formatAction(action: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    const lowerAction = action.toLowerCase();

    if (lowerAction.includes('create') || lowerAction.includes('add')) {
        return { label: action, variant: 'default' };
    }
    if (lowerAction.includes('update') || lowerAction.includes('modify')) {
        return { label: action, variant: 'secondary' };
    }
    if (lowerAction.includes('delete') || lowerAction.includes('remove')) {
        return { label: action, variant: 'destructive' };
    }
    return { label: action, variant: 'outline' };
}

export function AuditLogTable({ data, isLoading, onRowClick }: AuditLogTableProps) {
    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <ExternalLink className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit events found</p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-44">Time</TableHead>
                    <TableHead className="w-32">Entity</TableHead>
                    <TableHead className="w-40">Action</TableHead>
                    <TableHead className="w-32">Actor</TableHead>
                    <TableHead className="w-28">Actor Type</TableHead>
                    <TableHead>Trace ID</TableHead>
                    <TableHead className="w-20"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((event) => {
                    const ActorIcon = ACTOR_TYPE_ICONS[event.actorType] || User;
                    const actionFormat = formatAction(event.action);
                    const createdAt = typeof event.createdAt === 'string'
                        ? new Date(event.createdAt)
                        : event.createdAt;

                    return (
                        <TableRow
                            key={event.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => onRowClick(event)}
                        >
                            <TableCell className="font-mono text-xs">
                                {format(createdAt, 'yyyy-MM-dd HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{event.entityType}</span>
                                    {event.entityId && (
                                        <span className="text-xs text-muted-foreground font-mono truncate max-w-24">
                                            {event.entityId}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={actionFormat.variant}>
                                    {actionFormat.label}
                                </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs truncate max-w-32">
                                {event.actorId}
                            </TableCell>
                            <TableCell>
                                <Badge variant={ACTOR_TYPE_COLORS[event.actorType]}>
                                    <ActorIcon className="h-3 w-3 mr-1" />
                                    {event.actorType}
                                </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-32">
                                {event.traceId || '-'}
                            </TableCell>
                            <TableCell>
                                <Button variant="ghost" size="sm">
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
