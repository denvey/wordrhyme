/**
 * Settings Page
 *
 * Unified settings management page.
 * - Global settings: Only visible to users with 'manage Settings' permission
 * - Organization settings: Accessible by all org admins
 * - Plugin settings: Dynamically loaded via PluginSlot extensions
 */
import { useState, useEffect, Suspense } from 'react';
import { Settings2, Plus, MoreHorizontal, Pencil, Trash2, Lock, Search } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { useCan } from '../lib/ability';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Skeleton,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { useSlotExtensions, PluginErrorBoundary } from '../lib/extensions';
import type { SettingsTarget } from '../lib/extensions/extension-types';
import { useBatchInfraVisibility, useInfraPolicy, type InfraPolicyMode } from '../hooks/use-infra-policy';
import { OverridableSettingsContainer } from '../components/settings/OverridableSettingsContainer';

type SettingScope = 'global' | 'tenant';

interface Setting {
    id: string;
    scope: SettingScope;
    key: string;
    value: unknown;
    valueType: string | null;
    encrypted: boolean;
    description: string | null;
    schemaVersion: number;
    resolvedFrom: SettingScope;
}

export function SettingsPage() {
    const { data: activeOrg } = useActiveOrganization();

    // Permission checks via CASL
    const canManageSettings = useCan('manage', 'Settings');  // Global settings access

    // Default to tenant tab if user cannot manage global settings
    const [activeTab, setActiveTab] = useState<string>(() =>
        canManageSettings ? 'global' : 'tenant'
    );

    // Plugin settings tab extensions (e.g., S3 Storage, Email)
    const allPluginSettingsEntries = useSlotExtensions('settings.plugin');
    const isPlatformOrg = activeOrg?.id === 'platform';
    // Filter plugin tabs by static visibility: 'platform' tabs only visible in platform org
    const staticFilteredEntries = allPluginSettingsEntries.filter((entry) => {
        const visibility = (entry.target as SettingsTarget).visibility ?? 'all';
        return visibility === 'all' || (visibility === 'platform' && isPlatformOrg);
    });

    // Task 6.1: Batch query infra policy visibility for all plugin entries
    const pluginIds = staticFilteredEntries.map((e) => e.extension.pluginId);
    const { data: infraVisibility, isLoading: isInfraLoading } = useBatchInfraVisibility(pluginIds);

    // Task 6.2: Build a map of pluginId → visibility for efficient lookup
    type InfraVis = { pluginId: string; mode: InfraPolicyMode | null; hasCustomConfig: boolean };
    const infraVisibilityMap = new Map<string, InfraVis>(
        ((infraVisibility ?? []) as InfraVis[]).map((v) => [v.pluginId, v]),
    );

    // Filter plugin tabs: infra plugins with 'unified' mode hidden for tenants
    const pluginSettingsEntries = staticFilteredEntries.filter((entry) => {
        if (isPlatformOrg) return true; // Platform admins always see all tabs
        const vis = infraVisibilityMap.get(entry.extension.pluginId);
        if (!vis || vis.mode === null) return true; // Not infrastructure — show normally
        return vis.mode !== 'unified'; // Hide unified-mode infra plugins for tenants
    });
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedSetting, setSelectedSetting] = useState<Setting | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Switch to tenant tab if user loses manage permission
    useEffect(() => {
        if (!canManageSettings && activeTab === 'global') {
            setActiveTab('tenant');
        }
    }, [canManageSettings, activeTab]);

    // Form state
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newValueType, setNewValueType] = useState<'string' | 'number' | 'boolean' | 'json'>('string');
    const [newEncrypted, setNewEncrypted] = useState(false);
    const [newDescription, setNewDescription] = useState('');

    // Fetch settings (only for core tabs, not plugin tabs)
    const isCoreTab = activeTab === 'global' || activeTab === 'tenant';
    const { data: settingsData, isLoading, refetch } = trpc.settings.list.useQuery(
        { scope: activeTab as 'global' | 'tenant', tenantId: activeTab === 'tenant' ? activeOrg?.id : undefined },
        { enabled: isCoreTab && (activeTab === 'global' || !!activeOrg?.id) }
    );

    const settings = settingsData?.settings ?? [];

    // Filter settings by search
    const filteredSettings = settings.filter((s: Setting) =>
        s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Create setting mutation
    const createMutation = trpc.settings.set.useMutation({
        onSuccess: () => {
            toast.success('Setting created successfully');
            setCreateDialogOpen(false);
            resetForm();
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to create setting');
        },
    });

    // Update setting mutation
    const updateMutation = trpc.settings.set.useMutation({
        onSuccess: () => {
            toast.success('Setting updated successfully');
            setEditDialogOpen(false);
            setSelectedSetting(null);
            resetForm();
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update setting');
        },
    });

    // Delete setting mutation
    const deleteMutation = trpc.settings.delete.useMutation({
        onSuccess: () => {
            toast.success('Setting deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedSetting(null);
            refetch();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete setting');
        },
    });

    const resetForm = () => {
        setNewKey('');
        setNewValue('');
        setNewValueType('string');
        setNewEncrypted(false);
        setNewDescription('');
    };

    const parseValue = (value: string, type: string): unknown => {
        switch (type) {
            case 'number':
                return parseFloat(value);
            case 'boolean':
                return value === 'true';
            case 'json':
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            default:
                return value;
        }
    };

    const handleCreate = () => {
        if (!newKey.trim()) {
            toast.error('Key is required');
            return;
        }
        const scope = activeTab as SettingScope;
        createMutation.mutate({
            scope,
            key: newKey.trim(),
            value: parseValue(newValue, newValueType),
            valueType: newValueType,
            encrypted: newEncrypted,
            description: newDescription.trim() || undefined,
            tenantId: scope === 'tenant' ? activeOrg?.id : undefined,
        });
    };

    const handleUpdate = () => {
        if (!selectedSetting) return;
        const scope = activeTab as SettingScope;
        updateMutation.mutate({
            scope,
            key: selectedSetting.key,
            value: parseValue(newValue, newValueType),
            valueType: newValueType,
            encrypted: newEncrypted,
            description: newDescription.trim() || undefined,
            tenantId: scope === 'tenant' ? activeOrg?.id : undefined,
        });
    };

    const handleDelete = () => {
        if (!selectedSetting) return;
        const scope = activeTab as SettingScope;
        deleteMutation.mutate({
            scope,
            key: selectedSetting.key,
            tenantId: scope === 'tenant' ? activeOrg?.id : undefined,
        });
    };

    const openEditDialog = (setting: Setting) => {
        setSelectedSetting(setting);
        setNewValue(setting.encrypted ? '' : String(setting.value ?? ''));
        setNewValueType((setting.valueType as 'string' | 'number' | 'boolean' | 'json') || 'string');
        setNewEncrypted(setting.encrypted);
        setNewDescription(setting.description || '');
        setEditDialogOpen(true);
    };

    const formatValue = (setting: Setting): string => {
        if (setting.encrypted) return '••••••••';
        if (setting.value === null || setting.value === undefined) return '-';
        if (typeof setting.value === 'object') return JSON.stringify(setting.value);
        return String(setting.value);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Settings2 className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Settings</h1>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)}>
                <div className="flex items-center justify-between mb-4">
                    <TabsList>
                        {canManageSettings && (
                            <TabsTrigger value="global">Global Settings</TabsTrigger>
                        )}
                        <TabsTrigger value="tenant">Organization Settings</TabsTrigger>
                        {isInfraLoading && !isPlatformOrg ? (
                            <Skeleton className="h-8 w-24 rounded-md" />
                        ) : (
                            pluginSettingsEntries.map((entry) => (
                                <TabsTrigger key={entry.extension.id} value={`plugin:${entry.extension.id}`}>
                                    {entry.extension.label}
                                </TabsTrigger>
                            ))
                        )}
                    </TabsList>
                    {!activeTab.startsWith('plugin:') && (activeTab === 'tenant' || canManageSettings) && (
                        <Button onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Setting
                        </Button>
                    )}
                </div>

                <div className="rounded-xl border border-border bg-card">
                    <div className="p-4 border-b border-border">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search settings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {canManageSettings && (
                        <TabsContent value="global" className="m-0">
                            <SettingsList
                                settings={filteredSettings}
                                isLoading={isLoading}
                                onEdit={openEditDialog}
                                onDelete={(s) => {
                                    setSelectedSetting(s);
                                    setDeleteDialogOpen(true);
                                }}
                                formatValue={formatValue}
                            />
                        </TabsContent>
                    )}

                    <TabsContent value="tenant" className="m-0">
                        <SettingsList
                            settings={filteredSettings}
                            isLoading={isLoading}
                            onEdit={openEditDialog}
                            onDelete={(s) => {
                                setSelectedSetting(s);
                                setDeleteDialogOpen(true);
                            }}
                            formatValue={formatValue}
                        />
                    </TabsContent>
                </div>

                {/* Plugin Settings Tabs */}
                {pluginSettingsEntries.map((entry) => {
                    const vis = infraVisibilityMap.get(entry.extension.pluginId);
                    const isInfraPlugin = vis && vis.mode !== null;

                    return (
                        <TabsContent key={entry.extension.id} value={`plugin:${entry.extension.id}`} className="mt-4">
                            <div className="rounded-xl border border-border bg-card">
                                <PluginErrorBoundary pluginId={entry.extension.pluginId}>
                                    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
                                        {isInfraPlugin && !isPlatformOrg ? (
                                            <OverridableSettingsContainer
                                                pluginId={entry.extension.pluginId}
                                                riskLevel="high"
                                            >
                                                {() => entry.extension.component && <entry.extension.component />}
                                            </OverridableSettingsContainer>
                                        ) : (
                                            entry.extension.component && <entry.extension.component />
                                        )}
                                    </Suspense>
                                </PluginErrorBoundary>
                            </div>
                            {/* Task 6.4: Platform admin tenant policy controls */}
                            {isPlatformOrg && isInfraPlugin && (
                                <TenantPolicySection pluginId={entry.extension.pluginId} />
                            )}
                        </TabsContent>
                    );
                })}
            </Tabs>

            {/* Create Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Setting</DialogTitle>
                        <DialogDescription>
                            Create a new {activeTab} setting.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="key">Key</Label>
                            <Input
                                id="key"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="e.g., email.smtp.host"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Value Type</Label>
                                <Select value={newValueType} onValueChange={(v) => setNewValueType(v as typeof newValueType)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="string">String</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="boolean">Boolean</SelectItem>
                                        <SelectItem value="json">JSON</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Encrypted</Label>
                                <Select value={newEncrypted ? 'yes' : 'no'} onValueChange={(v) => setNewEncrypted(v === 'yes')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="no">No</SelectItem>
                                        <SelectItem value="yes">Yes (Sensitive)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="value">Value</Label>
                            {newValueType === 'boolean' ? (
                                <Select value={newValue || 'false'} onValueChange={setNewValue}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">True</SelectItem>
                                        <SelectItem value="false">False</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : newValueType === 'json' ? (
                                <textarea
                                    id="value"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    placeholder='{"key": "value"}'
                                    rows={4}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                />
                            ) : (
                                <Input
                                    id="value"
                                    type={newValueType === 'number' ? 'number' : newEncrypted ? 'password' : 'text'}
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    placeholder={newEncrypted ? '••••••••' : 'Enter value'}
                                />
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Input
                                id="description"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="What this setting does..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Creating...' : 'Create Setting'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Setting</DialogTitle>
                        <DialogDescription>
                            Update the value for "{selectedSetting?.key}"
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Value Type</Label>
                                <Select value={newValueType} onValueChange={(v) => setNewValueType(v as typeof newValueType)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="string">String</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="boolean">Boolean</SelectItem>
                                        <SelectItem value="json">JSON</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Encrypted</Label>
                                <Select value={newEncrypted ? 'yes' : 'no'} onValueChange={(v) => setNewEncrypted(v === 'yes')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="no">No</SelectItem>
                                        <SelectItem value="yes">Yes (Sensitive)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editValue">Value</Label>
                            {newValueType === 'boolean' ? (
                                <Select value={newValue || 'false'} onValueChange={setNewValue}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">True</SelectItem>
                                        <SelectItem value="false">False</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : newValueType === 'json' ? (
                                <textarea
                                    id="editValue"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    rows={4}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                />
                            ) : (
                                <Input
                                    id="editValue"
                                    type={newValueType === 'number' ? 'number' : newEncrypted ? 'password' : 'text'}
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    placeholder={newEncrypted ? 'Enter new value' : 'Enter value'}
                                />
                            )}
                            {selectedSetting?.encrypted && (
                                <p className="text-xs text-muted-foreground">
                                    This is an encrypted setting. Enter a new value to update it.
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editDescription">Description</Label>
                            <Input
                                id="editDescription"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="What this setting does..."
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

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Setting</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedSetting?.key}"?
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

// Settings List Component
function SettingsList({
    settings,
    isLoading,
    onEdit,
    onDelete,
    formatValue,
}: {
    settings: Setting[];
    isLoading: boolean;
    onEdit: (s: Setting) => void;
    onDelete: (s: Setting) => void;
    formatValue: (s: Setting) => string;
}) {
    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
        );
    }

    if (settings.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No settings found.</p>
                <p className="text-sm mt-1">Add a setting to get started.</p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-border">
            {settings.map((setting: Setting) => (
                <div
                    key={setting.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/50"
                >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            {setting.encrypted ? (
                                <Lock className="h-5 w-5 text-primary" />
                            ) : (
                                <Settings2 className="h-5 w-5 text-primary" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-mono text-sm font-medium truncate">{setting.key}</h3>
                                {setting.encrypted && (
                                    <Badge variant="secondary">Encrypted</Badge>
                                )}
                                <Badge variant="outline">{setting.valueType || 'string'}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                                {setting.description || formatValue(setting)}
                            </p>
                        </div>
                        <div className="text-right text-sm text-muted-foreground font-mono max-w-[200px] truncate">
                            {formatValue(setting)}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onEdit(setting)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => onDelete(setting)}
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
    );
}

// ─── Tenant Policy Section (Platform Admin Only) ───

const POLICY_OPTIONS: { value: InfraPolicyMode; label: string; description: string }[] = [
    {
        value: 'unified',
        label: 'Unified platform configuration',
        description: 'Tenants cannot see or change this setting.',
    },
    {
        value: 'allow_override',
        label: 'Allow tenant override',
        description: 'Optional — tenants can override, defaults to platform config.',
    },
    {
        value: 'require_tenant',
        label: 'Require tenant self-configuration',
        description: 'Platform does not provide a default. Tenants must configure their own.',
    },
];

function TenantPolicySection({ pluginId }: { pluginId: string }) {
    const { policy, isLoading, setPolicy, isSettingPolicy } = useInfraPolicy(pluginId);
    const [pendingMode, setPendingMode] = useState<InfraPolicyMode | null>(null);

    const currentMode = policy?.mode ?? 'unified';
    const selectedMode = pendingMode ?? currentMode;
    const isDirty = pendingMode !== null && pendingMode !== currentMode;

    if (isLoading) {
        return (
            <div className="mt-4 rounded-xl border border-border bg-card p-6">
                <Skeleton className="h-6 w-40 mb-4" />
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
        );
    }

    const handleSave = async () => {
        if (!isDirty) return;
        try {
            await setPolicy(pendingMode!);
            setPendingMode(null);
            toast.success('Tenant policy updated');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to update policy';
            toast.error(msg);
        }
    };

    return (
        <div className="mt-4 rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold mb-1">Tenant Policy</h3>
            <p className="text-sm text-muted-foreground mb-4">
                Control how tenants access this infrastructure configuration.
            </p>
            <div className="space-y-2">
                {POLICY_OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            selectedMode === option.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50'
                        } ${isSettingPolicy ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        <input
                            type="radio"
                            name={`infra-policy-${pluginId}`}
                            value={option.value}
                            checked={selectedMode === option.value}
                            onChange={() => setPendingMode(option.value)}
                            className="mt-0.5"
                            disabled={isSettingPolicy}
                        />
                        <div>
                            <div className="font-medium text-sm">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                    </label>
                ))}
            </div>
            {isDirty && (
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingMode(null)}
                        disabled={isSettingPolicy}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSettingPolicy}
                    >
                        {isSettingPolicy ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            )}
        </div>
    );
}
