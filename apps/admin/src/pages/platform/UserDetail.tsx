/**
 * Platform User Detail Page
 *
 * Platform-level user management (admin only):
 * - User info & global role
 * - Ban/unban, impersonate, revoke sessions
 * - Reset password, delete user
 *
 * Route: /platform/users/:userId
 */
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Shield, Ban, Key, Monitor, Play, Square,
    X, Lock, Trash2, UserCog,
} from 'lucide-react';
import { admin } from '../../lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface PlatformUser {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
    banned: boolean | null;
    createdAt: Date;
}

export function UserDetailPage() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Fetch user details via admin API
    const { data: user, isLoading } = useQuery({
        queryKey: ['platform-user', userId],
        queryFn: async () => {
            if (!userId) return null;
            // listUsers with exact search to find this user
            const result = await admin.listUsers({
                query: {
                    limit: 1,
                    offset: 0,
                    searchValue: userId,
                    searchField: 'id' as any,
                    searchOperator: 'is' as any,
                },
            });
            const users = (result.data?.users ?? []) as PlatformUser[];
            return users[0] ?? null;
        },
        enabled: !!userId,
    });

    // Fetch user sessions
    const { data: sessionsData } = useQuery({
        queryKey: ['platform-user-sessions', userId],
        queryFn: async () => {
            if (!userId) return { sessions: [] };
            const result = await admin.listUserSessions({ userId });
            return result.data;
        },
        enabled: !!userId,
    });

    // Set global role mutation
    const setGlobalRole = useMutation({
        mutationFn: async (role: 'user' | 'admin') => {
            if (!userId) throw new Error('No user ID');
            const result = await admin.setRole({ userId, role });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to set role');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-user', userId] });
            toast.success('Global role updated');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to set role');
        },
    });

    // Impersonate mutation
    const impersonate = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('No user ID');
            const result = await admin.impersonateUser({ userId });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to impersonate');
            }
            return result.data;
        },
        onSuccess: () => {
            toast.success('Now impersonating user');
            window.location.reload();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to impersonate');
        },
    });

    // Revoke all sessions
    const revokeSessions = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('No user ID');
            const result = await admin.revokeUserSessions({ userId });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to revoke sessions');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-user-sessions'] });
            toast.success('All sessions revoked');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to revoke sessions');
        },
    });

    // Revoke single session
    const revokeSession = useMutation({
        mutationFn: async (sessionToken: string) => {
            const result = await admin.revokeUserSession({ sessionToken });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to revoke session');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-user-sessions'] });
            toast.success('Session revoked');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to revoke session');
        },
    });

    // Ban/unban mutations
    const banUser = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('No user ID');
            const result = await admin.banUser({ userId });
            if (result.error) throw new Error(result.error.message || 'Failed to ban user');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-user', userId] });
            toast.success('User banned');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const unbanUser = useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('No user ID');
            const result = await admin.unbanUser({ userId });
            if (result.error) throw new Error(result.error.message || 'Failed to unban user');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-user', userId] });
            toast.success('User unbanned');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                User not found
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/platform/users')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-lg">
                        {user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{user.name || 'Unnamed'}</h1>
                        <p className="text-muted-foreground">{user.email}</p>
                    </div>
                </div>
                {user.banned && (
                    <Badge variant="destructive">Banned</Badge>
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* User Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserCog className="h-5 w-5" />
                            User Info
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">User ID</Label>
                            <p className="mt-1 text-sm font-mono">{user.id}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Created</Label>
                            <p className="mt-1">{new Date(user.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Global Role</Label>
                            <Select
                                value={user.role || 'user'}
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
                        </div>
                    </CardContent>
                </Card>

                {/* Admin Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Admin Actions
                        </CardTitle>
                        <CardDescription>
                            Platform-level operations for this user
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
                        {user.banned ? (
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => unbanUser.mutate()}
                                disabled={unbanUser.isPending}
                            >
                                <Square className="h-4 w-4 mr-2" />
                                Unban User
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                className="w-full justify-start text-destructive"
                                onClick={() => banUser.mutate()}
                                disabled={banUser.isPending}
                            >
                                <Ban className="h-4 w-4 mr-2" />
                                Ban User
                            </Button>
                        )}
                        <ResetPasswordDialog userId={user.id} />
                        <Separator className="my-2" />
                        <DeleteUserDialog
                            userId={user.id}
                            userName={user.name || user.email}
                            onDeleted={() => navigate('/platform/users')}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Sessions */}
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
        </div>
    );
}

/**
 * Reset Password Dialog
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
 * Delete User Dialog
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
            const result = await admin.removeUser({ userId });
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
