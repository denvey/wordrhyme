/**
 * Audit Logs Page
 *
 * Admin panel for viewing and querying audit events.
 * Provides filtering, pagination, and detailed view functionality.
 */
import { useState, useCallback } from 'react';
import { History, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle } from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { AuditFilterBar } from '../components/audit-logs/AuditFilterBar';
import { AuditLogTable } from '../components/audit-logs/AuditLogTable';
import { AuditLogDetailSheet } from '../components/audit-logs/AuditLogDetailSheet';

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

interface ExportResult {
    format: 'json' | 'csv';
    data: Record<string, unknown>[];
    filename: string;
}

interface Filters {
    entityType?: string | undefined;
    action?: string | undefined;
    actorType?: string | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    traceId?: string | undefined;
}

const PAGE_SIZE = 20;

export function AuditLogsPage() {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState<Filters>({});
    const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Fetch entity types for filter dropdown
    const { data: entityTypes = [] } = trpc.audit.entityTypes.useQuery();

    // Fetch actions for filter dropdown
    const { data: actions = [] } = trpc.audit.actions.useQuery();

    // Fetch audit stats
    const { data: stats } = trpc.audit.stats.useQuery();

    // Fetch audit events with filters
    const {
        data: auditData,
        isLoading,
        refetch,
    } = trpc.audit.list.useQuery({
        page,
        pageSize: PAGE_SIZE,
        entityType: filters.entityType,
        action: filters.action,
        actorType: filters.actorType as 'user' | 'system' | 'plugin' | 'api-token' | undefined,
        startTime: filters.startTime,
        endTime: filters.endTime,
        traceId: filters.traceId,
    });

    // Export mutation
    const exportMutation = trpc.audit.export.useMutation({
        onSuccess: (result: ExportResult) => {
            // Create download
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

    const handleFiltersChange = useCallback((newFilters: Filters) => {
        setFilters(newFilters);
        setPage(1); // Reset to first page when filters change
    }, []);

    const handleReset = useCallback(() => {
        setFilters({});
        setPage(1);
    }, []);

    const handleRowClick = useCallback((event: AuditEvent) => {
        setSelectedEvent(event);
        setSheetOpen(true);
    }, []);

    const handleExport = useCallback((format: 'json' | 'csv') => {
        exportMutation.mutate({
            format,
            filters: {
                entityType: filters.entityType,
                action: filters.action,
                startTime: filters.startTime,
                endTime: filters.endTime,
            },
            limit: 10000,
        });
    }, [exportMutation, filters]);

    const pagination = auditData?.pagination;
    const events = (auditData?.data as AuditEvent[] | undefined) ?? [];

    return (
        <div className="space-y-6">
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
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExport('json')}
                        disabled={exportMutation.isPending}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export JSON
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExport('csv')}
                        disabled={exportMutation.isPending}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
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

            {/* Main Content */}
            <div className="rounded-xl border border-border bg-card">
                {/* Filter Bar */}
                <div className="p-4 border-b border-border">
                    <AuditFilterBar
                        entityTypes={entityTypes}
                        actions={actions}
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        onReset={handleReset}
                    />
                </div>

                {/* Table */}
                <AuditLogTable
                    data={events}
                    isLoading={isLoading}
                    onRowClick={handleRowClick}
                />

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
                            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                            {pagination.total.toLocaleString()} events
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1 || isLoading}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                                disabled={page === pagination.totalPages || isLoading}
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

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
            // Escape quotes and wrap in quotes if contains comma or quote
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}
