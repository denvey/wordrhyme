/**
 * Hooks Page
 *
 * Hook system monitoring and management for administrators.
 * View all hooks, their handlers, and circuit breaker status.
 */
import { useState } from 'react';
import { Webhook, ChevronRight, RotateCcw, Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';
import {
    Button,
    Badge,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

type HookType = 'action' | 'filter';
type CircuitState = 'closed' | 'open' | 'half-open';

interface HookItem {
    id: string;
    type: HookType;
    description: string;
    defaultTimeout: number;
    handlerCount: number;
}

interface Handler {
    id: string;
    hookId: string;
    pluginId: string;
    functionName: string;
    priority: number;
    timeout: number;
    enabled: boolean;
    stats: {
        callCount: number;
        errorCount: number;
        avgDuration: number;
        lastRunAt: string | null;
    };
    circuitBreaker: {
        state: CircuitState;
        threshold: number;
        cooldownMs: number;
        trippedAt: string | null;
    };
}

// Group hooks by category
function groupHooks(hooks: HookItem[]): Record<string, HookItem[]> {
    const groups: Record<string, HookItem[]> = {};
    for (const hook of hooks) {
        const category = hook.id.split('.')[0] ?? 'other';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(hook);
    }
    return groups;
}

// Category display names
const categoryNames: Record<string, string> = {
    content: 'Content',
    user: 'User & Auth',
    product: 'Product',
    inventory: 'Inventory',
    cart: 'Cart',
    checkout: 'Checkout',
    payment: 'Payment',
    order: 'Order',
    media: 'Media',
    system: 'System',
    db: 'Database',
    plugin: 'Plugin',
    webhook: 'Webhook',
    api: 'API',
    audit: 'Audit',
    security: 'Security',
};

function CircuitBadge({ state }: { state: CircuitState }) {
    if (state === 'closed') {
        return (
            <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Healthy
            </Badge>
        );
    }
    if (state === 'open') {
        return (
            <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Tripped
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="text-yellow-600">
            <Activity className="h-3 w-3 mr-1" />
            Half-Open
        </Badge>
    );
}

export function HooksPage() {
    const [selectedHookId, setSelectedHookId] = useState<string | null>(null);

    // Fetch hooks list
    const { data: hooks, isLoading } = trpc.hooks.list.useQuery();

    // Fetch stats
    const { data: stats } = trpc.hooks.stats.useQuery();

    // Fetch hook detail when selected
    const { data: hookDetail, isLoading: isLoadingDetail } = trpc.hooks.getHandlers.useQuery(
        { hookId: selectedHookId! },
        { enabled: !!selectedHookId }
    );

    // Reset circuit breaker mutation
    const resetMutation = trpc.hooks.resetCircuitBreaker.useMutation({
        onSuccess: () => {
            toast.success('Circuit breaker reset successfully');
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to reset circuit breaker');
        },
    });

    const groupedHooks = hooks ? groupHooks(hooks) : {};

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Webhook className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Hooks</h1>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="text-2xl font-bold">{stats.totalHooks}</div>
                        <div className="text-sm text-muted-foreground">Total Hooks</div>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                        <div className="text-2xl font-bold">{stats.totalHandlers}</div>
                        <div className="text-sm text-muted-foreground">Active Handlers</div>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                        <div className="text-2xl font-bold text-green-600">{stats.circuitBreakerStats.closed}</div>
                        <div className="text-sm text-muted-foreground">Healthy</div>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                        <div className="text-2xl font-bold text-red-600">{stats.circuitBreakerStats.open}</div>
                        <div className="text-sm text-muted-foreground">Tripped</div>
                    </div>
                </div>
            )}

            {/* Hooks List */}
            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">Hook Definitions</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        View all registered hooks and their handlers. Click to see details.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : !hooks || hooks.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No hooks registered.</p>
                    </div>
                ) : (
                    <Accordion type="multiple" className="w-full">
                        {Object.entries(groupedHooks).map(([category, categoryHooks]) => (
                            <AccordionItem key={category} value={category}>
                                <AccordionTrigger className="px-6 hover:no-underline">
                                    <div className="flex items-center gap-3">
                                        <span className="font-medium">
                                            {categoryNames[category] || category}
                                        </span>
                                        <Badge variant="secondary">{categoryHooks.length}</Badge>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="divide-y divide-border">
                                        {categoryHooks.map((hook) => (
                                            <div
                                                key={hook.id}
                                                className="px-6 py-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                                                onClick={() => setSelectedHookId(hook.id)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-sm font-mono">{hook.id}</code>
                                                            <Badge variant={hook.type === 'filter' ? 'default' : 'secondary'}>
                                                                {hook.type}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            {hook.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {hook.handlerCount > 0 && (
                                                        <Badge variant="outline">
                                                            {hook.handlerCount} handler{hook.handlerCount !== 1 ? 's' : ''}
                                                        </Badge>
                                                    )}
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                )}
            </div>

            {/* Hook Detail Dialog */}
            <Dialog open={!!selectedHookId} onOpenChange={(open) => !open && setSelectedHookId(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono">{selectedHookId}</DialogTitle>
                        <DialogDescription>
                            {hookDetail?.hook.description}
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingDetail ? (
                        <div className="py-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        </div>
                    ) : hookDetail?.handlers.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            <p>No handlers registered for this hook.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                            {hookDetail?.handlers.map((handler: Handler) => (
                                <div key={handler.id} className="rounded-lg border p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{handler.pluginId}</span>
                                            <code className="text-xs bg-muted px-1 rounded">
                                                {handler.functionName}
                                            </code>
                                        </div>
                                        <CircuitBadge state={handler.circuitBreaker.state} />
                                    </div>

                                    <div className="grid grid-cols-4 gap-4 text-sm mt-3">
                                        <div>
                                            <div className="text-muted-foreground">Priority</div>
                                            <div className="font-medium">{handler.priority}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Calls</div>
                                            <div className="font-medium">{handler.stats.callCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Errors</div>
                                            <div className="font-medium">{handler.stats.errorCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg Duration</div>
                                            <div className="font-medium">{handler.stats.avgDuration.toFixed(1)}ms</div>
                                        </div>
                                    </div>

                                    {handler.circuitBreaker.state !== 'closed' && (
                                        <div className="mt-3 pt-3 border-t flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">
                                                Tripped at: {handler.circuitBreaker.trippedAt
                                                    ? new Date(handler.circuitBreaker.trippedAt).toLocaleString()
                                                    : 'N/A'}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => resetMutation.mutate({ handlerId: handler.id })}
                                                disabled={resetMutation.isPending}
                                            >
                                                <RotateCcw className="h-3 w-3 mr-1" />
                                                Reset
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
