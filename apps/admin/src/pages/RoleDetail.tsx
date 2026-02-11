/**
 * Role Detail Page
 *
 * View and edit a role's details, menu visibility, and permissions.
 * Organized into tabs: General Info, Menu Visibility, Permissions.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield, ArrowLeft, Save, Info } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import {
    Button,
    Label,
    Input,
    Badge,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { MenuVisibilityEditor } from '../components/roles/menu-config';
import { PermissionEditor } from '../components/roles/permission-config';

export function RoleDetailPage() {
    const { roleId } = useParams<{ roleId: string }>();
    const navigate = useNavigate();
    const { data: activeOrg } = useActiveOrganization();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [hasGeneralChanges, setHasGeneralChanges] = useState(false);

    // Fetch role details
    const { data: role, isLoading: roleLoading, refetch: refetchRole } = trpc.roles.get.useQuery(
        { roleId: roleId! },
        { enabled: !!roleId && !!activeOrg?.id }
    );

    // Update role mutation (only for general info)
    const updateMutation = trpc.roles.update.useMutation({
        onSuccess: () => {
            toast.success('Role updated successfully');
            setHasGeneralChanges(false);
            refetchRole();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update role');
        },
    });

    // Initialize form when role data loads
    useEffect(() => {
        if (role) {
            setName(role.name);
            setDescription(role.description || '');
        }
    }, [role]);

    const handleSaveGeneral = async () => {
        if (!roleId || !role) return;

        // Update role name/description if changed
        if (name !== role.name || description !== (role.description || '')) {
            await updateMutation.mutateAsync({
                roleId,
                name: name !== role.name ? name : undefined,
                description: description !== (role.description || '') ? description : undefined,
            });
        }
    };

    const isLoading = roleLoading;
    const isSaving = updateMutation.isPending;
    const isOwnerRole = role?.slug === 'owner';

    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
        );
    }

    if (!role) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Role not found.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/roles')}>
                    Back to Roles
                </Button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="icon" onClick={() => navigate('/roles')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold">{role.name}</h1>
                        {role.isSystem && <Badge variant="secondary">System</Badge>}
                    </div>
                    <p className="text-muted-foreground">
                        {role.description || `Manage permissions for ${role.name}`}
                    </p>
                </div>
            </div>

            {isOwnerRole && (
                <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 flex items-start gap-3">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        The Owner role has full access to all resources and cannot be modified.
                    </p>
                </div>
            )}

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="menu-visibility">Menu Visibility</TabsTrigger>
                    <TabsTrigger value="permissions">Permissions</TabsTrigger>
                </TabsList>

                {/* Tab 1: General Info */}
                <TabsContent value="general">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h2 className="font-semibold">Role Details</h2>
                            {!isOwnerRole && (
                                <Button onClick={handleSaveGeneral} disabled={!hasGeneralChanges || isSaving}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            )}
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        setHasGeneralChanges(true);
                                    }}
                                    disabled={isOwnerRole}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => {
                                        setDescription(e.target.value);
                                        setHasGeneralChanges(true);
                                    }}
                                    rows={3}
                                    disabled={isOwnerRole}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 2: Menu Visibility */}
                <TabsContent value="menu-visibility">
                    <MenuVisibilityEditor
                        roleId={roleId!}
                        isSystem={isOwnerRole}
                        organizationId={activeOrg?.id ?? null}
                    />
                </TabsContent>

                {/* Tab 3: Permissions (New UI) */}
                <TabsContent value="permissions">
                    <PermissionEditor
                        roleId={roleId!}
                        isSystem={isOwnerRole}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
