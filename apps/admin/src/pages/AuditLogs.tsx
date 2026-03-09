/**
 * Audit Logs Page
 *
 * Uses AutoCrudTable for list/filter/sort/pagination.
 * Stats cards and export are custom (not part of auto-crud).
 *
 * @reason Uses auto-crud for standard CRUD, hand-written for aggregation (GROUP BY/DISTINCT)
 */
import { useState, useCallback } from 'react';
import { History, Download, Copy, Check, Info } from 'lucide-react';
import { createSelectSchema } from 'drizzle-zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { auditEvents } from '@wordrhyme/db/schema';
import {
    Button,
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { AuditLogDetailSheet } from '../components/audit-logs/AuditLogDetailSheet';

// Schema derived from Drizzle table — single source of truth
const auditSchema = createSelectSchema(auditEvents);

interface ExportResult {
    format: 'json' | 'csv';
    data: Record<string, unknown>[];
    filename: string;
}

const ElegantJsonCell = ({ getValue }: any) => {
    const value = getValue();
    const [copied, setCopied] = useState(false);

    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
        return <span className="text-muted-foreground">-</span>;
    }

    // Generate summary
    let summary = '';
    let extraCount = 0;

    if (value.old !== undefined || value.new !== undefined) {
        // Change object { old: ..., new: ... }
        const oldVal = value.old;
        const newVal = value.new;

        if (oldVal !== null && typeof oldVal !== 'object' && newVal !== null && typeof newVal !== 'object') {
            summary = `${String(oldVal)} → ${String(newVal)}`;
        } else if (newVal && typeof newVal === 'object' && !oldVal) {
            summary = `Created: ${Object.keys(newVal)[0]}`;
            extraCount = Object.keys(newVal).length - 1;
        } else {
            summary = 'Updated';
            extraCount = Object.keys(newVal || {}).length;
        }
    } else {
        // Generic metadata
        const keys = Object.keys(value);
        if (keys.length > 0) {
            const firstKey = keys[0];
            const firstVal = value[firstKey];
            summary = `${firstKey}: ${typeof firstVal === 'object' ? '{...}' : String(firstVal)}`;
            extraCount = keys.length - 1;
        }
    }

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(value, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-pointer hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors group">
                    <span
                        className="text-xs truncate max-w-[140px] font-medium text-foreground/80 group-hover:text-foreground"
                        title={summary}
                    >
                        {summary}
                    </span>
                    {extraCount > 0 && (
                        <Badge variant="secondary" className="px-1 text-[9px] h-3.5 min-w-4 flex justify-center opacity-70">
                            +{extraCount}
                        </Badge>
                    )}
                    <Info className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden shadow-xl border-muted-foreground/20">
                <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Raw Data</span>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 border rounded hover:bg-background"
                        onClick={handleCopy}
                    >
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                </div>
                <div className="p-3">
                    <pre className="text-[10px] font-mono leading-relaxed overflow-auto max-h-60 custom-scrollbar">
                        {JSON.stringify(value, null, 2)}
                    </pre>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export function AuditLogsPage() {
    const [selectedEvent, setSelectedEvent] = useState<any>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Auto-crud resource for list/get
    const resource = useAutoCrudResource({
        router: trpc.audit as any,
        schema: auditSchema,
    });

    // Custom queries (aggregation — not part of auto-crud)
    const { data: stats } = trpc.audit.stats.useQuery();

    // Export mutation
    const exportMutation = trpc.audit.export.useMutation({
        onSuccess: (result: ExportResult) => {
            const blob = new Blob(
                [
                    result.format === 'json'
                        ? JSON.stringify(result.data, null, 2)
                        : convertToCSV(result.data),
                ],
                { type: result.format === 'json' ? 'application/json' : 'text/csv' }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Export completed');
        },
        onError: (error: { message: string }) => {
            toast.error(`Export failed: ${error.message}`);
        },
    });

    const handleExport = useCallback((format: 'json' | 'csv') => {
        exportMutation.mutate({ format, limit: 10000 });
    }, [exportMutation]);

    const handleRowClick = useCallback((row: any) => {
        setSelectedEvent(row);
        setSheetOpen(true);
    }, []);

    return (
        <div className="container mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <History className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">Audit Logs</h1>
                        <p className="text-muted-foreground">
                            View and query system audit events
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Total Events
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Last 24 Hours
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.last24Hours.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Top Entity Type
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    {stats.byEntityType[0]?.entityType ?? 'N/A'}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                    {stats.byEntityType[0]?.count?.toLocaleString() ?? 0}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Top Action
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                    {stats.byAction[0]?.action ?? 'N/A'}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                    {stats.byAction[0]?.count?.toLocaleString() ?? 0}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Auto-CRUD Table */}
            <AutoCrudTable
                title="Audit Events"
                schema={auditSchema}
                resource={resource}
                permissions={{
                    can: { create: false, update: false, delete: false },
                }}
                fields={{
                    id: { hidden: true },
                    organizationId: { filter: false },
                    changes: { filter: false },
                    metadata: { filter: false },
                    userAgent: { filter: false },
                    requestId: { filter: false },
                    sessionId: { filter: false },
                    createdAt: { label: 'Time' },
                    entityType: { label: 'Entity' },
                    entityId: { label: 'Entity ID', table: { hidden: true } },
                    action: { label: 'Action' },
                    actorId: { label: 'Actor' },
                    actorType: {
                        label: 'Actor Type',
                        table: {
                            meta: {
                                variant: 'select',
                                options: [
                                    { label: 'User', value: 'user' },
                                    { label: 'System', value: 'system' },
                                    { label: 'Plugin', value: 'plugin' },
                                    { label: 'API Token', value: 'api-token' },
                                ],
                            },
                        },
                    },
                    traceId: { label: 'Trace ID' },
                    actorIp: { label: 'IP Address' },
                }}
                table={{
                    filterModes: ['simple', 'advanced'],
                    defaultSort: [{ id: 'createdAt', desc: true }],
                    overrides: {
                        changes: {
                            cell: ElegantJsonCell,
                        },
                        metadata: {
                            cell: ElegantJsonCell,
                        },
                    },
                }}
                slots={{
                    rowActions: (row: any) => [
                        {
                            label: 'View Details',
                            onClick: () => handleRowClick(row),
                        },
                    ],
                }}
            />

            {/* Detail Sheet */}
            <AuditLogDetailSheet
                event={selectedEvent}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
            />
        </div>
    );
}

/**
 * Convert array to CSV string
 */
function convertToCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const firstRow = data[0];
    if (!firstRow) return '';

    const headers = Object.keys(firstRow);
    const rows = data.map((row) =>
        headers.map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}
