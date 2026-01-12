/**
 * Audit Filter Bar
 *
 * Filter controls for audit log queries including entity type,
 * action, actor, and date range filters.
 */
import { Search, X, CalendarIcon } from 'lucide-react';
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
} from '@wordrhyme/ui';
import { format } from 'date-fns';

interface AuditFilters {
    entityType?: string | undefined;
    action?: string | undefined;
    actorType?: string | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    traceId?: string | undefined;
}

interface AuditFilterBarProps {
    entityTypes: string[];
    actions: string[];
    filters: AuditFilters;
    onFiltersChange: (filters: AuditFilters) => void;
    onReset: () => void;
}

const ACTOR_TYPES = [
    { value: 'user', label: 'User' },
    { value: 'system', label: 'System' },
    { value: 'plugin', label: 'Plugin' },
    { value: 'api-token', label: 'API Token' },
];

export function AuditFilterBar({
    entityTypes,
    actions,
    filters,
    onFiltersChange,
    onReset,
}: AuditFilterBarProps) {
    const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Entity Type Filter */}
            <Select
                value={filters.entityType ?? '__all__'}
                onValueChange={(value) =>
                    onFiltersChange({ ...filters, entityType: value === '__all__' ? undefined : value })
                }
            >
                <SelectTrigger className="w-40">
                    <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__">All Entities</SelectItem>
                    {entityTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                            {type}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Action Filter */}
            <Select
                value={filters.action ?? '__all__'}
                onValueChange={(value) =>
                    onFiltersChange({ ...filters, action: value === '__all__' ? undefined : value })
                }
            >
                <SelectTrigger className="w-40">
                    <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__">All Actions</SelectItem>
                    {actions.map((action) => (
                        <SelectItem key={action} value={action}>
                            {action}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Actor Type Filter */}
            <Select
                value={filters.actorType ?? '__all__'}
                onValueChange={(value) =>
                    onFiltersChange({ ...filters, actorType: value === '__all__' ? undefined : value })
                }
            >
                <SelectTrigger className="w-32">
                    <SelectValue placeholder="Actor" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__">All Actors</SelectItem>
                    {ACTOR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                            {type.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
                <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="date"
                        value={filters.startTime ? format(new Date(filters.startTime), 'yyyy-MM-dd') : ''}
                        onChange={(e) =>
                            onFiltersChange({
                                ...filters,
                                startTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                            })
                        }
                        className="pl-9 w-36"
                        placeholder="Start Date"
                    />
                </div>
                <span className="text-muted-foreground">to</span>
                <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="date"
                        value={filters.endTime ? format(new Date(filters.endTime), 'yyyy-MM-dd') : ''}
                        onChange={(e) =>
                            onFiltersChange({
                                ...filters,
                                endTime: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                            })
                        }
                        className="pl-9 w-36"
                        placeholder="End Date"
                    />
                </div>
            </div>

            {/* Trace ID Search */}
            <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by Trace ID..."
                    value={filters.traceId ?? ''}
                    onChange={(e) =>
                        onFiltersChange({ ...filters, traceId: e.target.value || undefined })
                    }
                    className="pl-9"
                />
            </div>

            {/* Reset Filters */}
            {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={onReset}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                </Button>
            )}
        </div>
    );
}
