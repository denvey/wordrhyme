/**
 * Settings Page
 *
 * Platform settings management for administrators.
 * Supports viewing and editing global and tenant settings.
 */
import { useState } from 'react';
import { Settings2, Plus, MoreHorizontal, Pencil, Trash2, Lock, Search } from 'lucide-react';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

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
    const [activeTab, setActiveTab] = useState<SettingScope>('global');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedSetting, setSelectedSetting] = useState<Setting | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Form state
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newValueType, setNewValueType] = useState<'string' | 'number' | 'boolean' | 'json'>('string');
    const [newEncrypted, setNewEncrypted] = useState(false);
    const [newDescription, setNewDescription] = useState('');

    // Fetch settings
    const { data: settingsData, isLoading, refetch } = trpc.settings.list.useQuery(
        { scope: activeTab, tenantId: activeTab === 'tenant' ? activeOrg?.id : undefined },
        { enabled: activeTab === 'global' || !!activeOrg?.id }
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
        onError: (error) => {
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
        onError: (error) => {
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
        onError: (error) => {
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
        createMutation.mutate({
            scope: activeTab,
            key: newKey.trim(),
            value: parseValue(newValue, newValueType),
            valueType: newValueType,
            encrypted: newEncrypted,
            description: newDescription.trim() || undefined,
            tenantId: activeTab === 'tenant' ? activeOrg?.id : undefined,
        });
    };

    const handleUpdate = () => {
        if (!selectedSetting) return;
        updateMutation.mutate({
            scope: activeTab,
            key: selectedSetting.key,
            value: parseValue(newValue, newValueType),
            valueType: newValueType,
            encrypted: newEncrypted,
            description: newDescription.trim() || undefined,
            tenantId: activeTab === 'tenant' ? activeOrg?.id : undefined,
        });
    };

    const handleDelete = () => {
        if (!selectedSetting) return;
        deleteMutation.mutate({
            scope: activeTab,
            key: selectedSetting.key,
            tenantId: activeTab === 'tenant' ? activeOrg?.id : undefined,
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

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingScope)}>
                <div className="flex items-center justify-between mb-4">
                    <TabsList>
                        <TabsTrigger value="global">Global Settings</TabsTrigger>
                        <TabsTrigger value="tenant">Organization Settings</TabsTrigger>
                    </TabsList>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Setting
                    </Button>
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
