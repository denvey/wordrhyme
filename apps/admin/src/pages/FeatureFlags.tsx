/**
 * Feature Flags Page
 *
 * Feature flag management.
 * - Create/Edit/Delete flags: Requires 'manage FeatureFlag' permission
 * - Set/Remove overrides: Requires 'update FeatureFlag' permission
 */
import { useState } from 'react';
import { Flag, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, ToggleRight, Building2 } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { useCan } from '../lib/ability';
import { trpc } from '../lib/trpc';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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
    Slider,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

interface FeatureFlag {
    id: string;
    key: string;
    name: string;
    description: string | null;
    enabled: boolean;
    rolloutPercentage: number;
    conditions: unknown[];
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface FlagOverride {
    id: string;
    flagId: string;
    organizationId: string;
    enabled: boolean;
    rolloutPercentage: number | null;
    conditions: unknown[] | null;
    createdBy: string | null;
    createdAt: Date;
}

export function FeatureFlagsPage() {
    const { data: activeOrg } = useActiveOrganization();

    // Permission checks via CASL
    const canManageFlags = useCan('manage', 'FeatureFlag');  // Create/Edit/Delete

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
    const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);

    // Form state
    const [newKey, setNewKey] = useState('');
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newEnabled, setNewEnabled] = useState(false);
    const [newRollout, setNewRollout] = useState(100);

    // Override form state
    const [overrideEnabled, setOverrideEnabled] = useState(false);
    const [overrideRollout, setOverrideRollout] = useState(100);

    // Fetch flags
    const { data: flagsData, isLoading, refetch } = trpc.featureFlags.list.useQuery();
    const flags = flagsData?.flags ?? [];

    // Fetch overrides for current organization
    const { data: overridesData, refetch: refetchOverrides } = trpc.featureFlags.listOverrides.useQuery(
        { organizationId: activeOrg?.id ?? '' },
        { enabled: !!activeOrg?.id }
    );
    const overrides = overridesData?.overrides ?? [];

    // Create flag mutation
    const createMutation = trpc.featureFlags.create.useMutation({
        onSuccess: () => {
            toast.success('Feature flag created successfully');
            setCreateDialogOpen(false);
            resetForm();
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to create feature flag');
        },
    });

    // Update flag mutation
    const updateMutation = trpc.featureFlags.update.useMutation({
        onSuccess: () => {
            toast.success('Feature flag updated successfully');
            setEditDialogOpen(false);
            setSelectedFlag(null);
            resetForm();
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update feature flag');
        },
    });

    // Delete flag mutation
    const deleteMutation = trpc.featureFlags.delete.useMutation({
        onSuccess: () => {
            toast.success('Feature flag deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedFlag(null);
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete feature flag');
        },
    });

    // Set override mutation
    const setOverrideMutation = trpc.featureFlags.setOverride.useMutation({
        onSuccess: () => {
            toast.success('Organization override set successfully');
            setOverrideDialogOpen(false);
            setSelectedFlag(null);
            refetchOverrides();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to set override');
        },
    });

    // Remove override mutation
    const removeOverrideMutation = trpc.featureFlags.removeOverride.useMutation({
        onSuccess: () => {
            toast.success('Organization override removed');
            refetchOverrides();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to remove override');
        },
    });

    const resetForm = () => {
        setNewKey('');
        setNewName('');
        setNewDescription('');
        setNewEnabled(false);
        setNewRollout(100);
    };

    const handleCreate = () => {
        if (!newKey.trim()) {
            toast.error('Key is required');
            return;
        }
        if (!newName.trim()) {
            toast.error('Name is required');
            return;
        }
        createMutation.mutate({
            key: newKey.trim(),
            name: newName.trim(),
            description: newDescription.trim() || undefined,
            enabled: newEnabled,
            rolloutPercentage: newRollout,
        });
    };

    const handleUpdate = () => {
        if (!selectedFlag) return;
        updateMutation.mutate({
            id: selectedFlag.id,
            name: newName.trim(),
            description: newDescription.trim() || undefined,
            enabled: newEnabled,
            rolloutPercentage: newRollout,
        });
    };

    const handleDelete = () => {
        if (!selectedFlag) return;
        deleteMutation.mutate({ id: selectedFlag.id });
    };

    const handleSetOverride = () => {
        if (!selectedFlag || !activeOrg?.id) return;
        setOverrideMutation.mutate({
            flagKey: selectedFlag.key,
            organizationId: activeOrg.id,
            enabled: overrideEnabled,
            rolloutPercentage: overrideRollout,
        });
    };

    const handleRemoveOverride = (flagKey: string) => {
        if (!activeOrg?.id) return;
        removeOverrideMutation.mutate({
            flagKey,
            organizationId: activeOrg.id,
        });
    };

    const openEditDialog = (flag: FeatureFlag) => {
        setSelectedFlag(flag);
        setNewKey(flag.key);
        setNewName(flag.name);
        setNewDescription(flag.description || '');
        setNewEnabled(flag.enabled);
        setNewRollout(flag.rolloutPercentage);
        setEditDialogOpen(true);
    };

    const openOverrideDialog = (flag: FeatureFlag) => {
        const existingOverride = overrides.find((o: FlagOverride) => o.flagId === flag.id);
        setSelectedFlag(flag);
        setOverrideEnabled(existingOverride?.enabled ?? flag.enabled);
        setOverrideRollout(existingOverride?.rolloutPercentage ?? flag.rolloutPercentage);
        setOverrideDialogOpen(true);
    };

    const getOverrideForFlag = (flagId: string): FlagOverride | undefined => {
        return overrides.find((o: FlagOverride) => o.flagId === flagId);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Flag className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Feature Flags</h1>
                </div>
                {canManageFlags && (
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Flag
                    </Button>
                )}
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">All Feature Flags</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage feature flags and configure tenant-specific overrides.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : flags.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Flag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No feature flags found.</p>
                        <p className="text-sm mt-1">Create a flag to control feature rollout.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {flags.map((flag: FeatureFlag) => {
                            const override = getOverrideForFlag(flag.id);
                            const effectiveEnabled = override?.enabled ?? flag.enabled;
                            const effectiveRollout = override?.rolloutPercentage ?? flag.rolloutPercentage;

                            return (
                                <div
                                    key={flag.id}
                                    className="p-4 flex items-center justify-between hover:bg-muted/50"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                            effectiveEnabled ? 'bg-green-500/10' : 'bg-muted'
                                        }`}>
                                            {effectiveEnabled ? (
                                                <ToggleRight className="h-5 w-5 text-green-500" />
                                            ) : (
                                                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium">{flag.name}</h3>
                                                <Badge variant={effectiveEnabled ? 'default' : 'secondary'}>
                                                    {effectiveEnabled ? 'Enabled' : 'Disabled'}
                                                </Badge>
                                                {effectiveRollout < 100 && effectiveEnabled && (
                                                    <Badge variant="outline">{effectiveRollout}% rollout</Badge>
                                                )}
                                                {override && (
                                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                                        <Building2 className="h-3 w-3 mr-1" />
                                                        Override
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                <span className="font-mono">{flag.key}</span>
                                                {flag.description && ` — ${flag.description}`}
                                            </p>
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
                                                {canManageFlags && (
                                                    <DropdownMenuItem onClick={() => openEditDialog(flag)}>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Edit Flag
                                                    </DropdownMenuItem>
                                                )}
                                                {activeOrg?.id && (
                                                    <>
                                                        {canManageFlags && <DropdownMenuSeparator />}
                                                        <DropdownMenuItem onClick={() => openOverrideDialog(flag)}>
                                                            <Building2 className="h-4 w-4 mr-2" />
                                                            {override ? 'Edit Override' : 'Set Override'}
                                                        </DropdownMenuItem>
                                                        {override && (
                                                            <DropdownMenuItem onClick={() => handleRemoveOverride(flag.key)}>
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Remove Override
                                                            </DropdownMenuItem>
                                                        )}
                                                    </>
                                                )}
                                                {canManageFlags && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => {
                                                                setSelectedFlag(flag);
                                                                setDeleteDialogOpen(true);
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Delete Flag
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Feature Flag</DialogTitle>
                        <DialogDescription>
                            Create a new feature flag to control feature rollout.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="key">Key</Label>
                            <Input
                                id="key"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="e.g., new-dashboard"
                                className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique identifier used in code. Cannot be changed later.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g., New Dashboard"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Input
                                id="description"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="What this flag controls..."
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Enabled</Label>
                                <p className="text-xs text-muted-foreground">
                                    Turn this flag on or off globally
                                </p>
                            </div>
                            <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Rollout Percentage</Label>
                                <span className="text-sm font-medium">{newRollout}%</span>
                            </div>
                            <Slider
                                value={[newRollout]}
                                onValueChange={([v]) => setNewRollout(v ?? 100)}
                                max={100}
                                step={1}
                            />
                            <p className="text-xs text-muted-foreground">
                                Percentage of users who will see this feature when enabled.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Creating...' : 'Create Flag'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Feature Flag</DialogTitle>
                        <DialogDescription>
                            Update the feature flag "{selectedFlag?.key}"
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editName">Name</Label>
                            <Input
                                id="editName"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editDescription">Description</Label>
                            <Input
                                id="editDescription"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Enabled</Label>
                                <p className="text-xs text-muted-foreground">
                                    Turn this flag on or off globally
                                </p>
                            </div>
                            <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Rollout Percentage</Label>
                                <span className="text-sm font-medium">{newRollout}%</span>
                            </div>
                            <Slider
                                value={[newRollout]}
                                onValueChange={([v]) => setNewRollout(v ?? 100)}
                                max={100}
                                step={1}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Override Dialog */}
            <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Set Tenant Override</DialogTitle>
                        <DialogDescription>
                            Override the "{selectedFlag?.key}" flag for your organization.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 rounded-lg bg-muted">
                            <p className="text-sm">
                                <span className="font-medium">Global setting:</span>{' '}
                                {selectedFlag?.enabled ? 'Enabled' : 'Disabled'} at {selectedFlag?.rolloutPercentage}% rollout
                            </p>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Override Enabled</Label>
                                <p className="text-xs text-muted-foreground">
                                    Override the enabled state for your organization
                                </p>
                            </div>
                            <Switch checked={overrideEnabled} onCheckedChange={setOverrideEnabled} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Override Rollout</Label>
                                <span className="text-sm font-medium">{overrideRollout}%</span>
                            </div>
                            <Slider
                                value={[overrideRollout]}
                                onValueChange={([v]) => setOverrideRollout(v ?? 100)}
                                max={100}
                                step={1}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSetOverride} disabled={setOverrideMutation.isPending}>
                            {setOverrideMutation.isPending ? 'Saving...' : 'Set Override'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedFlag?.name}"?
                            This action cannot be undone and will affect all code using this flag.
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
