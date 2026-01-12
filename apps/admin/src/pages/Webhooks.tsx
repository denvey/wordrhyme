/**
 * Webhooks Page
 *
 * Webhook endpoint management for the current organization.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Webhook, Plus, MoreHorizontal, Pencil, Trash2, Eye, TestTube } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Label,
    Input,
    Badge,
    Switch,
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

export function WebhooksPage() {
    const { data: activeOrg } = useActiveOrganization();
    const navigate = useNavigate();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedWebhook, setSelectedWebhook] = useState<WebhookEndpoint | null>(null);
    const [newUrl, setNewUrl] = useState('');
    const [newEvents, setNewEvents] = useState('notification.created');

    const { data: webhooks, isLoading, refetch } = trpc.webhook.list.useQuery(undefined, {
        enabled: !!activeOrg?.id,
    });

    const createMutation = trpc.webhook.create.useMutation({
        onSuccess: () => {
            toast.success('Webhook created successfully');
            setCreateDialogOpen(false);
            setNewUrl('');
            setNewEvents('notification.created');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create webhook');
        },
    });

    const deleteMutation = trpc.webhook.delete.useMutation({
        onSuccess: () => {
            toast.success('Webhook deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedWebhook(null);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete webhook');
        },
    });

    const toggleMutation = trpc.webhook.update.useMutation({
        onSuccess: () => {
            toast.success('Webhook updated');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update webhook');
        },
    });

    const handleCreateWebhook = () => {
        if (!newUrl.trim()) {
            toast.error('URL is required');
            return;
        }
        createMutation.mutate({
            url: newUrl.trim(),
            events: [newEvents],
        });
    };

    const handleDeleteWebhook = () => {
        if (selectedWebhook) {
            deleteMutation.mutate({ id: selectedWebhook.id });
        }
    };

    const handleToggleEnabled = (webhook: WebhookEndpoint, enabled: boolean) => {
        toggleMutation.mutate({
            id: webhook.id,
            enabled,
        });
    };

    const handleViewDetails = (webhook: WebhookEndpoint) => {
        navigate(`/webhooks/${webhook.id}`);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Webhook className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Webhooks</h1>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Webhook
                    </Button>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Webhook</DialogTitle>
                            <DialogDescription>
                                Create a webhook endpoint to receive event notifications.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="url">URL</Label>
                                <Input
                                    id="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://example.com/webhook"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="events">Event Type</Label>
                                <Input
                                    id="events"
                                    value={newEvents}
                                    onChange={(e) => setNewEvents(e.target.value)}
                                    placeholder="notification.created"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateWebhook}
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create Webhook'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">Webhook Endpoints</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage webhook endpoints to receive real-time event notifications.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : !webhooks || webhooks.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No webhooks found.</p>
                        <p className="text-sm mt-1">Create a webhook endpoint to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {webhooks.map((webhook: WebhookEndpoint) => (
                            <div
                                key={webhook.id}
                                className="p-4 flex items-center justify-between hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Webhook className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium">{webhook.url}</h3>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {webhook.events.map((event) => (
                                                <Badge key={event} variant="secondary">
                                                    {event}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={webhook.enabled}
                                            onCheckedChange={(checked) => handleToggleEnabled(webhook, checked)}
                                        />
                                        <span className="text-sm text-muted-foreground">
                                            {webhook.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleViewDetails(webhook)}>
                                                <Eye className="h-4 w-4 mr-2" />
                                                View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => {
                                                    setSelectedWebhook(webhook);
                                                    setDeleteDialogOpen(true);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
                            onClick={handleDeleteWebhook}
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
