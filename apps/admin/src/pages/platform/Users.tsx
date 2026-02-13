/**
 * Platform Users Page
 *
 * Global user management for admin only.
 * Uses admin.listUsers() API to show all users across all organizations.
 */
import { useState } from 'react';
import { Users, Search, ChevronLeft, ChevronRight, Shield, MoreHorizontal, Ban, Trash2, UserCog } from 'lucide-react';
import { admin, useSession } from '../../lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Input,
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@wordrhyme/ui';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface User {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    banned: boolean | null;
    createdAt: Date;
}

export function PlatformUsersPage() {
    const { data: session } = useSession();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(0);
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
    const pageSize = 20;
    const queryClient = useQueryClient();

    // Only admin can access
    if (session?.user?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    // Mutations
    const banUser = useMutation({
        mutationFn: async (userId: string) => {
            const result = await admin.banUser({ userId });
            if (result.error) throw new Error(result.error.message || 'Failed to ban user');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-users'] });
            toast.success('User banned');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const unbanUser = useMutation({
        mutationFn: async (userId: string) => {
            const result = await admin.unbanUser({ userId });
            if (result.error) throw new Error(result.error.message || 'Failed to unban user');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-users'] });
            toast.success('User unbanned');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const setRole = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: 'user' | 'admin' }) => {
            const result = await admin.setRole({ userId, role });
            if (result.error) throw new Error(result.error.message || 'Failed to set role');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-users'] });
            toast.success('Role updated');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const deleteUser = useMutation({
        mutationFn: async (userId: string) => {
            const result = await admin.removeUser({ userId });
            if (result.error) throw new Error(result.error.message || 'Failed to delete user');
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-users'] });
            toast.success('User deleted');
            setDeleteUserId(null);
        },
        onError: (e: Error) => toast.error(e.message),
    });

    // Fetch all users using admin.listUsers()
    const { data: usersData, isLoading } = useQuery({
        queryKey: ['platform-users', searchQuery, currentPage],
        queryFn: async () => {
            const result = await admin.listUsers({
                query: {
                    limit: pageSize,
                    offset: currentPage * pageSize,
                    ...(searchQuery && {
                        searchValue: searchQuery,
                        searchField: 'email',
                        searchOperator: 'contains',
                    }),
                },
            });
            return result.data;
        },
    });

    const users = (usersData?.users ?? []) as User[];
    const total = usersData?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(0);
    };

    const getRoleBadgeVariant = (role: string | null) => {
        switch (role) {
            case 'admin':
                return 'default';
            default:
                return 'outline';
        }
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <Shield className="h-8 w-8 text-destructive" />
                <div>
                    <h1 className="text-3xl font-bold">Platform Users</h1>
                    <p className="text-sm text-muted-foreground">
                        Global user management (admin only)
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">All Users</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {total} users across all organizations
                            </p>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by email..."
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{searchQuery ? 'No users found' : 'No users yet'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/platform/users/${user.id}`)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                        {user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? 'U'}
                                    </div>
                                    <div>
                                        <h3 className="font-medium">
                                            {user.name || 'Unnamed'}
                                            {user.banned && (
                                                <Badge variant="destructive" className="ml-2">
                                                    Banned
                                                </Badge>
                                            )}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant={getRoleBadgeVariant(user.role)}>
                                        {user.role || 'user'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => setRole.mutate({ userId: user.id, role: 'admin' })}
                                                disabled={user.role === 'admin' || user.role === 'admin'}
                                            >
                                                <UserCog className="h-4 w-4 mr-2" />
                                                Set Admin
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setRole.mutate({ userId: user.id, role: 'user' })}
                                                disabled={user.role === 'user' || user.role === 'admin'}
                                            >
                                                <UserCog className="h-4 w-4 mr-2" />
                                                Set User
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {user.banned ? (
                                                <DropdownMenuItem onClick={() => unbanUser.mutate(user.id)}>
                                                    <Ban className="h-4 w-4 mr-2" />
                                                    Unban
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    onClick={() => banUser.mutate(user.id)}
                                                    disabled={user.role === 'admin'}
                                                >
                                                    <Ban className="h-4 w-4 mr-2" />
                                                    Ban
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => setDeleteUserId(user.id)}
                                                disabled={user.role === 'admin'}
                                                className="text-destructive"
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

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, total)} of {total} users
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                disabled={currentPage === 0}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                                Page {currentPage + 1} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                disabled={currentPage >= totalPages - 1}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The user and all their data will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteUserId && deleteUser.mutate(deleteUserId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
