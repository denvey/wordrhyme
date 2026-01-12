/**
 * Webhook Detail Page
 *
 * View webhook details, deliveries, and test the endpoint.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Webhook, ArrowLeft, Trash2, Power, TestTube2 } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import {
    Button,
    Label,
    Badge,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

interface WebhookEndpoint {
    id: string;
    url: string;
    secretPreview: string;
    events: string[];
    enabled: boolean;
    retryPolicy: {
        attempts: number;
        backoffMs: number;
        maxBackoffMs?: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

interface WebhookDelivery {
    id: string;
    endpointId: string;
    eventType: string;
    status: 'pending' | 'success' | 'failed';
    attempts: number;
    lastAttemptAt: Date | null;
    responseCode: number | null;
    error: string | null;
    createdAt: Date;
}

export function WebhookDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { data: activeOrg } = useActiveOrganization();
    const navigate = useNavigate();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [testPayload, setTestPayload] = useState('{"test": true}');

    const { data: webhook, isLoading, refetch } = trpc.webhook.get.useQuery(
        { id: id! },
        { enabled: !!activeOrg?.id && !!id }
    );

    const { data: deliveriesData } = trpc.webhook.deliveries.useQuery(
        { id: id!, page: 1, pageSize: 20 },
        { enabled: !!activeOrg?.id && !!id }
    );

    const deleteMutation = trpc.webhook.delete.useMutation({
        onSuccess: () => {
            toast.success('Webhook deleted');
            navigate('/webhooks');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to delete webhook');
        },
    });

    const toggleMutation = trpc.webhook.update.useMutation({
        onSuccess: () => {
            toast.success('Webhook updated');
            refetch();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update webhook');
        },
    });

    const testMutation = trpc.webhook.test.useMutation({
        onSuccess: () => {
            toast.success('Test webhook sent');
            refetch();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to send test webhook');
        },
    });

    const handleDelete = () => {
        if (id) {
            deleteMutation.mutate({ id });
        }
    };

    const handleToggle = (enabled: boolean) => {
        if (id) {
            toggleMutation.mutate({ id, enabled });
        }
    };

    const handleTest = () => {
        if (id) {
            try {
                const payload = JSON.parse(testPayload);
                testMutation.mutate({
                    id,
                    eventType: 'test.event',
                    payload,
                });
            } catch {
                toast.error('Invalid JSON payload');
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!webhook) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Webhook not found</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="icon" onClick={() => navigate('/webhooks')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <Webhook className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">Webhook Details</h1>
                        <p className="text-sm text-muted-foreground">{webhook.url}</p>
                    </div>
                </div>
                <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                </Button>
            </div>

            <Tabs defaultValue="info" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="info">Basic Info</TabsTrigger>
                    <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
                    <TabsTrigger value="test">Test</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-6">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h2 className="font-semibold mb-4">Endpoint Configuration</h2>
                        <div className="space-y-4">
                            <div>
                                <Label>URL</Label>
                                <p className="text-sm mt-1">{webhook.url}</p>
                            </div>
                            <div>
                                <Label>Secret Preview</Label>
                                <p className="text-sm mt-1 font-mono">{webhook.secretPreview}</p>
                            </div>
                            <div>
                                <Label>Events</Label>
                                <div className="flex gap-2 mt-1">
                                    {webhook.events.map((event) => (
                                        <Badge key={event}>{event}</Badge>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label>Status</Label>
                                <div className="flex items-center gap-2 mt-1">
                                    <Switch
                                        checked={webhook.enabled}
                                        onCheckedChange={handleToggle}
                                    />
                                    <span className="text-sm">
                                        {webhook.enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <Label>Retry Policy</Label>
                                <div className="text-sm mt-1 space-y-1">
                                    <p>Max Attempts: {webhook.retryPolicy.attempts}</p>
                                    <p>Backoff: {webhook.retryPolicy.backoffMs}ms</p>
                                    {webhook.retryPolicy.maxBackoffMs && (
                                        <p>Max Backoff: {webhook.retryPolicy.maxBackoffMs}ms</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="deliveries" className="space-y-6">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="p-6 border-b border-border">
                            <h2 className="font-semibold">Delivery History</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Recent webhook delivery attempts
                            </p>
                        </div>
                        {!deliveriesData?.deliveries || deliveriesData.deliveries.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <p>No deliveries yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {deliveriesData.deliveries.map((delivery: WebhookDelivery) => (
                                    <div key={delivery.id} className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{delivery.eventType}</span>
                                                    <Badge
                                                        variant={
                                                            delivery.status === 'success'
                                                                ? 'default'
                                                                : delivery.status === 'failed'
                                                                ? 'destructive'
                                                                : 'secondary'
                                                        }
                                                    >
                                                        {delivery.status}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    {delivery.attempts} attempts
                                                    {delivery.responseCode && ` • ${delivery.responseCode}`}
                                                    {delivery.error && ` • ${delivery.error}`}
                                                </div>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {new Date(delivery.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="test" className="space-y-6">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h2 className="font-semibold mb-4">Test Webhook</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            Send a test event to this webhook endpoint
                        </p>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="payload">Payload (JSON)</Label>
                                <textarea
                                    id="payload"
                                    value={testPayload}
                                    onChange={(e) => setTestPayload(e.target.value)}
                                    rows={8}
                                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                />
                            </div>
                            <Button
                                onClick={handleTest}
                                disabled={testMutation.isPending}
                            >
                                <TestTube2 className="h-4 w-4 mr-2" />
                                {testMutation.isPending ? 'Sending...' : 'Send Test Event'}
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this webhook endpoint?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
