/**
 * Role Detail Page
 *
 * View and edit a role's details and CASL permissions.
 * Organized into tabs: General Info, Data Permissions.
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
import { PermissionEditor } from '../components/roles/permission-config';

export function RoleDetailPage() {
    const { roleId } = useParams<{ roleId: string }>();
    const navigate = useNavigate();
    const { data: activeOrg } = useActiveOrganization();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch role details
    const { data: role, isLoading: roleLoading, refetch: refetchRole } = trpc.roles.get.useQuery(
        { roleId: roleId! },
        { enabled: !!roleId && !!activeOrg?.id }
    );

    const { data: routeDriftReports = [] } = trpc.permissionConfig.getRouteDriftReports.useQuery(
        undefined,
        { enabled: !!activeOrg?.id }
    );

    // Update role mutation
    const updateMutation = trpc.roles.update.useMutation({
        onSuccess: () => {
            toast.success('Role updated successfully');
            setHasChanges(false);
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

    const handleSave = async () => {
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
    const hasRouteDrift = routeDriftReports.length > 0;
    const totalRouteDrift = routeDriftReports.reduce((sum, report) => {
        return sum + report.removed.length + report.added.length + report.permissionChanged.length;
    }, 0);

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
                {!isOwnerRole && (
                    <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                )}
            </div>

            {isOwnerRole && (
                <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    </div>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        The Owner role has full access to all resources and cannot be modified.
                    </p>
                </div>
            )}

            {hasRouteDrift && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-4 flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                    </div>
                    <p className="text-sm text-amber-900 dark:text-amber-100">
                        检测到 {routeDriftReports.length} 个插件存在路由漂移，共 {totalRouteDrift} 项权限相关变化。
                        请检查新增、删除或权限声明变更的 tRPC 路由，避免角色配置遗漏。
                    </p>
                </div>
            )}

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="data-permissions">Data Permissions</TabsTrigger>
                </TabsList>

                {/* Tab 1: General Info */}
                <TabsContent value="general">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="p-6 border-b border-border">
                            <h2 className="font-semibold">Role Details</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        setHasChanges(true);
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
                                        setHasChanges(true);
                                    }}
                                    rows={3}
                                    disabled={isOwnerRole}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 2: Data Permissions (CASL) */}
                <TabsContent value="data-permissions">
                    <PermissionEditor
                        roleId={roleId!}
                        isSystem={isOwnerRole}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
