/**
 * API Tokens Page
 *
 * API token management for the current organization.
 */
import { useState } from 'react';
import { Key, Plus, MoreHorizontal, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Checkbox,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

interface ApiToken {
    id: string;
    name: string | null;
    prefix: string | null;
    capabilities: string[];
    createdAt: Date;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    enabled: boolean;
}

// Expiration options in seconds
const EXPIRATION_OPTIONS = [
    { label: '30 days', value: 30 * 24 * 60 * 60 },
    { label: '90 days', value: 90 * 24 * 60 * 60 },
    { label: '1 year', value: 365 * 24 * 60 * 60 },
    { label: 'Never', value: 0 },
];

export function ApiTokensPage() {
    const { data: activeOrg } = useActiveOrganization();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedToken, setSelectedToken] = useState<ApiToken | null>(null);

    // Create dialog state
    const [dialogStage, setDialogStage] = useState<'config' | 'reveal'>('config');
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenExpiration, setNewTokenExpiration] = useState<number>(90 * 24 * 60 * 60);
    const [newTokenCapabilities, setNewTokenCapabilities] = useState<string[]>([]);
    const [revealedToken, setRevealedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const { data: tokens, isLoading, refetch } = trpc.apiTokens.list.useQuery(undefined, {
        enabled: !!activeOrg?.id,
    });

    const { data: availableScopes } = trpc.apiTokens.scopes.useQuery();

    const createMutation = trpc.apiTokens.create.useMutation({
        onSuccess: (data) => {
            setRevealedToken(data.key);
            setDialogStage('reveal');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create API token');
        },
    });

    const deleteMutation = trpc.apiTokens.delete.useMutation({
        onSuccess: () => {
            toast.success('API token deleted');
            setDeleteDialogOpen(false);
            setSelectedToken(null);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete API token');
        },
    });

    const toggleMutation = trpc.apiTokens.toggle.useMutation({
        onSuccess: () => {
            toast.success('API token updated');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update API token');
        },
    });

    const handleCreateToken = () => {
        if (!newTokenName.trim()) {
            toast.error('Please enter a token name');
            return;
        }
        if (newTokenCapabilities.length === 0) {
            toast.error('Please select at least one scope');
            return;
        }

        createMutation.mutate({
            name: newTokenName,
            capabilities: newTokenCapabilities,
            expiresIn: newTokenExpiration || undefined,
        });
    };

    const handleCloseCreateDialog = () => {
        setCreateDialogOpen(false);
        setDialogStage('config');
        setNewTokenName('');
        setNewTokenExpiration(90 * 24 * 60 * 60);
        setNewTokenCapabilities([]);
        setRevealedToken(null);
        setCopied(false);
    };

    const handleCopyToken = async () => {
        if (revealedToken) {
            try {
                await navigator.clipboard.writeText(revealedToken);
                setCopied(true);
                toast.success('Token copied to clipboard');
                setTimeout(() => setCopied(false), 2000);
            } catch {
                toast.error('Failed to copy token');
            }
        }
    };

    const handleToggleCapability = (capability: string) => {
        setNewTokenCapabilities((prev) =>
            prev.includes(capability)
                ? prev.filter((c) => c !== capability)
                : [...prev, capability]
        );
    };

    const formatDate = (date: Date | null) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString();
    };

    const formatLastUsed = (date: Date | null) => {
        if (!date) return 'Never used';
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return formatDate(date);
    };

    const isExpired = (date: Date | null) => {
        if (!date) return false;
        return new Date(date) < new Date();
    };

    if (!activeOrg) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Please select an organization</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">API Tokens</h1>
                    <p className="text-muted-foreground">
                        Manage API tokens for programmatic access
                    </p>
                </div>
                <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Token
                </Button>
            </div>

            {/* Token List */}
            <div className="rounded-xl border border-border bg-card">
                {isLoading ? (
                    <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : !tokens?.length ? (
                    <div className="p-8 text-center">
                        <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">No API tokens yet</p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => setCreateDialogOpen(true)}
                        >
                            Create your first token
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {tokens.map((token) => (
                            <div
                                key={token.id}
                                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-muted">
                                        <Key className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {token.name || 'Unnamed Token'}
                                            </span>
                                            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                {token.prefix}...
                                            </code>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                            <span>Created {formatDate(token.createdAt)}</span>
                                            <span>•</span>
                                            <span>{formatLastUsed(token.lastUsedAt)}</span>
                                            {token.expiresAt && (
                                                <>
                                                    <span>•</span>
                                                    <span
                                                        className={
                                                            isExpired(token.expiresAt)
                                                                ? 'text-destructive'
                                                                : ''
                                                        }
                                                    >
                                                        {isExpired(token.expiresAt)
                                                            ? 'Expired'
                                                            : `Expires ${formatDate(token.expiresAt)}`}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex gap-1 mt-2">
                                            {token.capabilities.slice(0, 3).map((cap: string) => (
                                                <Badge key={cap} variant="secondary" className="text-xs">
                                                    {cap}
                                                </Badge>
                                            ))}
                                            {token.capabilities.length > 3 && (
                                                <Badge variant="secondary" className="text-xs">
                                                    +{token.capabilities.length - 3}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <Switch
                                        checked={token.enabled}
                                        onCheckedChange={(enabled) =>
                                            toggleMutation.mutate({ id: token.id, enabled })
                                        }
                                    />
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => {
                                                    setSelectedToken(token);
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

            {/* Create Token Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={handleCloseCreateDialog}>
                <DialogContent className="sm:max-w-md">
                    {dialogStage === 'config' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Create API Token</DialogTitle>
                                <DialogDescription>
                                    Create a new API token for programmatic access
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Token Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., CI/CD Pipeline"
                                        value={newTokenName}
                                        onChange={(e) => setNewTokenName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Expiration</Label>
                                    <Select
                                        value={String(newTokenExpiration)}
                                        onValueChange={(v) => setNewTokenExpiration(Number(v))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {EXPIRATION_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={String(opt.value)}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Scopes</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {availableScopes?.map((scope: { value: string; label: string }) => (
                                            <label
                                                key={scope.value}
                                                className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted"
                                            >
                                                <Checkbox
                                                    checked={newTokenCapabilities.includes(scope.value)}
                                                    onCheckedChange={() =>
                                                        handleToggleCapability(scope.value)
                                                    }
                                                />
                                                <span className="text-sm">{scope.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={handleCloseCreateDialog}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreateToken}
                                    disabled={createMutation.isPending}
                                >
                                    {createMutation.isPending ? 'Creating...' : 'Create Token'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Check className="h-5 w-5 text-green-500" />
                                    Token Created
                                </DialogTitle>
                                <DialogDescription>
                                    Make sure to copy your token now. You won't be able to see it
                                    again!
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                                    <p className="text-sm text-amber-600 dark:text-amber-400">
                                        This token will not be shown again. Please copy it now.
                                    </p>
                                </div>
                                <div className="relative">
                                    <Input
                                        readOnly
                                        value={revealedToken || ''}
                                        className="pr-12 font-mono text-sm"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2"
                                        onClick={handleCopyToken}
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCloseCreateDialog}>
                                    I've saved my token
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete API Token</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedToken?.name || 'this token'}"?
                            This action cannot be undone. Any applications using this token will
                            lose access.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (selectedToken) {
                                    deleteMutation.mutate({ id: selectedToken.id });
                                }
                            }}
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
