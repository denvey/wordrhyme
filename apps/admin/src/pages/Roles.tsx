/**
 * Roles Page
 *
 * Role management for the current organization.
 * Allows viewing, creating, editing, and deleting custom roles.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
} from '@wordrhyme/ui';
import { toast } from 'sonner';

interface Role {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export function RolesPage() {
    const { data: activeOrg } = useActiveOrganization();
    const navigate = useNavigate();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');

    // Fetch roles
    const { data: roles, isLoading, refetch } = trpc.roles.list.useQuery(undefined, {
        enabled: !!activeOrg?.id,
    });

    // Create role mutation
    const createMutation = trpc.roles.create.useMutation({
        onSuccess: () => {
            toast.success('Role created successfully');
            setCreateDialogOpen(false);
            setNewRoleName('');
            setNewRoleDescription('');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create role');
        },
    });

    // Delete role mutation
    const deleteMutation = trpc.roles.delete.useMutation({
        onSuccess: () => {
            toast.success('Role deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedRole(null);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete role');
        },
    });

    const handleCreateRole = () => {
        if (!newRoleName.trim()) {
            toast.error('Role name is required');
            return;
        }
        createMutation.mutate({
            name: newRoleName.trim(),
            description: newRoleDescription.trim() || undefined,
        });
    };

    const handleDeleteRole = () => {
        if (selectedRole) {
            deleteMutation.mutate({ roleId: selectedRole.id });
        }
    };

    const handleEditRole = (role: Role) => {
        navigate(`/roles/${role.id}`);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Roles</h1>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Role
                    </Button>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Role</DialogTitle>
                            <DialogDescription>
                                Create a custom role to assign specific permissions to members.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={newRoleName}
                                    onChange={(e) => setNewRoleName(e.target.value)}
                                    placeholder="e.g., Content Editor"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description (optional)</Label>
                                <textarea
                                    id="description"
                                    value={newRoleDescription}
                                    onChange={(e) => setNewRoleDescription(e.target.value)}
                                    placeholder="Describe what this role can do..."
                                    rows={3}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateRole}
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create Role'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">Organization Roles</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage roles and their permissions. System roles cannot be deleted.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : !roles || roles.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No roles found.</p>
                        <p className="text-sm mt-1">Create a custom role to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {roles.map((role: Role) => (
                            <div
                                key={role.id}
                                className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleEditRole(role)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Shield className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium">{role.name}</h3>
                                            {role.isSystem && (
                                                <Badge variant="secondary">System</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {role.description || `Role: ${role.slug}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleEditRole(role)}>
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Edit Role
                                            </DropdownMenuItem>
                                            {!role.isSystem && (
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => {
                                                        setSelectedRole(role);
                                                        setDeleteDialogOpen(true);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete Role
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedRole?.name}"?
                            This action cannot be undone. Members with this role will need to be reassigned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteRole}
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
