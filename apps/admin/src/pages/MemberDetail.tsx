/**
 * Member Detail Page
 *
 * Shows member details and provides:
 * - Layer 1: Role management (org admin)
 * - Layer 2: Ban, sessions, impersonate (super admin only)
 */
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Ban, UserCog, Key, Monitor, Play, Square, X, Lock, Trash2 } from 'lucide-react';
import { organization, admin, useActiveOrganization } from '../lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCan } from '../lib/ability';
import {
    Button,
    Badge,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
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
    AlertDialogTrigger,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { useState } from 'react';
import { trpc } from '../lib/trpc';

interface Role {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
    capabilities?: string[];
}

export function MemberDetailPage() {
    const { memberId } = useParams<{ memberId: string }>();
    const navigate = useNavigate();
    const { data: activeOrg } = useActiveOrganization();
    const queryClient = useQueryClient();

    // Permission checks via CASL
    const canManageUsers = useCan('manage', 'User');  // Super admin operations
    const canDeleteUsers = useCan('delete', 'User');  // Platform admin: permanent delete

    // Fetch member details and current user's org role
    const { data: orgData, isLoading } = useQuery({
        queryKey: ['member', memberId, activeOrg?.id],
        queryFn: async () => {
            if (!activeOrg?.id) return null;
            const result = await organization.getFullOrganization({
                query: { organizationId: activeOrg.id },
            });
            const members = result.data?.members ?? [];
            const targetMember = members.find((m: { id: string }) => m.id === memberId) || null;
            const currentUserMember = members.find((m: { userId: string }) => m.userId === activeOrg?.id) || null;
            return { targetMember, currentUserMember };
        },
        enabled: !!activeOrg?.id && !!memberId,
    });

    const memberData = orgData?.targetMember;
    // Check if current user can manage roles (is org owner or admin)
    const canManageRoles = orgData?.currentUserMember?.role === 'owner' || orgData?.currentUserMember?.role === 'admin';

    // Fetch roles from database
    const { data: roles } = trpc.roles.list.useQuery(undefined, {
        enabled: !!activeOrg?.id,
    });

    // Get current member's role details with capabilities
    const currentRole = (roles as Role[] | undefined)?.find(r => r.slug === memberData?.role);

    // Fetch user sessions (Layer 2)
    const { data: sessionsData } = useQuery({
        queryKey: ['userSessions', memberData?.userId],
        queryFn: async () => {
            if (!memberData?.userId) return { sessions: [] };
            const result = await admin.listUserSessions({
                userId: memberData.userId,
            });
            return result.data;
        },
        enabled: !!(memberData?.userId && canManageUsers),
    });

    // Update role mutation
    const updateRole = useMutation({
        mutationFn: async (role: string) => {
            const result = await organization.updateMemberRole({
                memberId: memberId!,
                role,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to update role');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member'] });
            toast.success('Role updated');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to update role');
        },
    });

    // Revoke all sessions mutation (Layer 2)
    const revokeSessions = useMutation({
        mutationFn: async () => {
            const result = await admin.revokeUserSessions({
                userId: memberData?.userId,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to revoke sessions');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userSessions'] });
            toast.success('All sessions revoked');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to revoke sessions');
        },
    });

    // Revoke single session mutation (Layer 2)
    const revokeSession = useMutation({
        mutationFn: async (sessionToken: string) => {
            const result = await admin.revokeUserSession({
                sessionToken,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to revoke session');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userSessions'] });
            toast.success('Session revoked');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to revoke session');
        },
    });

    // Set global role mutation (Layer 2 - platform-admin only)
    const setGlobalRole = useMutation({
        mutationFn: async (role: 'user' | 'admin') => {
            if (!memberData?.userId) throw new Error('No user ID');
            const result = await admin.setRole({
                userId: memberData.userId,
                role,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to set role');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member'] });
            toast.success('Global role updated');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to set role');
        },
    });

    // Impersonate mutation (Layer 2)
    const impersonate = useMutation({
        mutationFn: async () => {
            const result = await admin.impersonateUser({
                userId: memberData?.userId,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to impersonate');
            }
            return result.data;
        },
        onSuccess: () => {
            toast.success('Now impersonating user');
            // Reload to apply new session
            window.location.reload();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to impersonate');
        },
    });

    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
        );
    }

    if (!memberData) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                Member not found
            </div>
        );
    }

    const member = memberData as {
        id: string;
        userId: string;
        role: string;
        createdAt: Date | string;
        user: { id: string; name?: string; email: string; image?: string; role?: string; banned?: boolean };
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/members')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-lg">
                        {member.user.name?.[0]?.toUpperCase() ?? member.user.email[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{member.user.name || 'Unnamed'}</h1>
                        <p className="text-muted-foreground">{member.user.email}</p>
                    </div>
                </div>
                {member.user.banned && (
                    <Badge variant="destructive">Banned</Badge>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Member Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserCog className="h-5 w-5" />
                            Member Info
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Organization Role</Label>
                            {canManageRoles ? (
                                <Select
                                    value={member.role}
                                    onValueChange={(role) => updateRole.mutate(role)}
                                    disabled={member.role === 'owner'}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(roles as Role[] | undefined)?.map((r) => (
                                            <SelectItem
                                                key={r.id}
                                                value={r.slug}
                                                disabled={r.slug === 'owner'}
                                            >
                                                {r.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <p className="mt-1">
                                    <Badge variant="outline">{member.role}</Badge>
                                </p>
                            )}
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Joined</Label>
                            <p className="mt-1">{new Date(member.createdAt).toLocaleDateString()}</p>
                        </div>
                        {currentRole?.capabilities && currentRole.capabilities.length > 0 && (
                            <div>
                                <Label className="text-muted-foreground">Role Permissions</Label>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {currentRole.capabilities.slice(0, 5).map((cap) => (
                                        <Badge key={cap} variant="secondary" className="text-xs">
                                            {cap}
                                        </Badge>
                                    ))}
                                    {currentRole.capabilities.length > 5 && (
                                        <Badge variant="outline" className="text-xs">
                                            +{currentRole.capabilities.length - 5} more
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}
                        <div>
                            <Label className="text-muted-foreground">Global Role</Label>
                            {canManageUsers ? (
                                <Select
                                    value={member.user.role || 'user'}
                                    onValueChange={(role) => setGlobalRole.mutate(role as 'user' | 'admin')}
                                    disabled={setGlobalRole.isPending}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">User</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <p className="mt-1">
                                    <Badge variant="outline">{member.user.role || 'user'}</Badge>
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Super Admin Actions (Layer 2) */}
                {canManageUsers && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Admin Actions
                            </CardTitle>
                            <CardDescription>
                                Super admin operations for this user
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => impersonate.mutate()}
                                disabled={impersonate.isPending}
                            >
                                <Play className="h-4 w-4 mr-2" />
                                Impersonate User
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => revokeSessions.mutate()}
                                disabled={revokeSessions.isPending}
                            >
                                <Key className="h-4 w-4 mr-2" />
                                Revoke All Sessions
                            </Button>
                            <BanUserDialog
                                userId={member.userId}
                                isBanned={member.user.banned ?? false}
                                organizationId={activeOrg?.id}
                            />
                            <ResetPasswordDialog userId={member.userId} />
                            {canDeleteUsers && (
                                <Separator className="my-2" />
                            )}
                            {canDeleteUsers && (
                                <DeleteUserDialog
                                    userId={member.userId}
                                    userName={member.user.name || member.user.email}
                                    onDeleted={() => navigate('/members')}
                                />
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Sessions (Layer 2) */}
            {canManageUsers && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Monitor className="h-5 w-5" />
                            Active Sessions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!(sessionsData as { sessions?: unknown[] } | null)?.sessions?.length ? (
                            <p className="text-muted-foreground text-sm">No active sessions</p>
                        ) : (
                            <div className="space-y-2">
                                {((sessionsData as unknown as { sessions: { id: string; token: string; userAgent?: string; createdAt: string }[] }).sessions).map((s) => (
                                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                        <div>
                                            <p className="text-sm font-medium">{s.userAgent || 'Unknown device'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Created: {new Date(s.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => revokeSession.mutate(s.token)}
                                            disabled={revokeSession.isPending}
                                            title="Revoke session"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * Ban User Dialog (Layer 2) - Tenant-Level Ban
 */
function BanUserDialog({ userId, isBanned, organizationId }: { userId: string; isBanned?: boolean | undefined; organizationId?: string | undefined }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const queryClient = useQueryClient();

    const banUser = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/tenant-admin/ban-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': organizationId || '',
                },
                credentials: 'include',
                body: JSON.stringify({ userId, reason: reason || undefined }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to ban user');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member'] });
            toast.success('User banned from this organization');
            setOpen(false);
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to ban user');
        },
    });

    const unbanUser = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/tenant-admin/unban-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': organizationId || '',
                },
                credentials: 'include',
                body: JSON.stringify({ userId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to unban user');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member'] });
            toast.success('User unbanned');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to unban user');
        },
    });

    if (isBanned) {
        return (
            <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => unbanUser.mutate()}
                disabled={unbanUser.isPending}
            >
                <Square className="h-4 w-4 mr-2" />
                Unban User
            </Button>
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                variant="outline"
                className="w-full justify-start text-destructive"
                onClick={() => setOpen(true)}
            >
                <Ban className="h-4 w-4 mr-2" />
                Ban User
            </Button>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ban User</DialogTitle>
                    <DialogDescription>
                        This will prevent the user from accessing this organization. They can still access other organizations they belong to.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Input
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Violation of terms..."
                        className="mt-2"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => banUser.mutate()}
                        disabled={banUser.isPending}
                    >
                        {banUser.isPending ? 'Banning...' : 'Ban User'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Reset Password Dialog (Layer 2)
 */
function ResetPasswordDialog({ userId }: { userId: string }) {
    const [open, setOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const resetPassword = useMutation({
        mutationFn: async () => {
            if (newPassword !== confirmPassword) {
                throw new Error('Passwords do not match');
            }
            if (newPassword.length < 8) {
                throw new Error('Password must be at least 8 characters');
            }
            const result = await admin.setUserPassword({
                userId,
                newPassword,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to reset password');
            }
            return result.data;
        },
        onSuccess: () => {
            toast.success('Password reset successfully');
            setNewPassword('');
            setConfirmPassword('');
            setOpen(false);
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to reset password');
        },
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setOpen(true)}
            >
                <Lock className="h-4 w-4 mr-2" />
                Reset Password
            </Button>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset User Password</DialogTitle>
                    <DialogDescription>
                        Set a new password for this user. They will need to use this password to log in.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => resetPassword.mutate()}
                        disabled={!newPassword || !confirmPassword || resetPassword.isPending}
                    >
                        {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Delete User Dialog (Layer 2 - Platform Admin Only)
 */
function DeleteUserDialog({
    userId,
    userName,
    onDeleted,
}: {
    userId: string;
    userName: string;
    onDeleted: () => void;
}) {
    const deleteUser = useMutation({
        mutationFn: async () => {
            const result = await admin.removeUser({
                userId,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to delete user');
            }
            return result.data;
        },
        onSuccess: () => {
            toast.success('User deleted successfully');
            onDeleted();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to delete user');
        },
    });

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-destructive hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User Permanently
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to permanently delete <strong>{userName}</strong>?
                        This action cannot be undone. All user data, sessions, and memberships will be removed.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => deleteUser.mutate()}
                        disabled={deleteUser.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {deleteUser.isPending ? 'Deleting...' : 'Delete User'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
