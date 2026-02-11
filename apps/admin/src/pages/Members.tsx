/**
 * Members Page
 *
 * Layer 1: Tenant Member Management
 * Uses organization.* APIs for member operations.
 */
import { useState } from 'react';
import { Users, UserPlus, Search, MoreHorizontal, Shield, UserMinus, LogOut, ChevronLeft, ChevronRight, Mail, X, Clock, RefreshCw } from 'lucide-react';
import { organization, useActiveOrganization, useSession } from '../lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { useCan, Can } from '../lib/ability';

interface Role {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
}

interface Member {
    id: string;
    userId: string;
    role: string;
    createdAt: Date;
    user: {
        id: string;
        name: string;
        email: string;
        image?: string;
    };
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
}

export function MembersPage() {
    const { data: activeOrg } = useActiveOrganization();
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [inviteOpen, setInviteOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const queryClient = useQueryClient();
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [editingMember, setEditingMember] = useState<Member | null>(null);

    // Fetch roles from database
    const { data: roles } = trpc.roles.list.useQuery(undefined, {
        enabled: !!activeOrg?.id,
    });

    // Fetch members
    const { data: membersData, isLoading } = useQuery({
        queryKey: ['members', activeOrg?.id],
        queryFn: async () => {
            if (!activeOrg?.id) return { members: [] };
            const result = await organization.getFullOrganization({
                query: { organizationId: activeOrg.id },
            });
            return result.data;
        },
        enabled: !!activeOrg?.id,
    });

    const members = (membersData?.members ?? []) as Member[];

    // Fetch pending invitations
    const { data: invitationsData } = useQuery({
        queryKey: ['invitations', activeOrg?.id],
        queryFn: async () => {
            if (!activeOrg?.id) return [];
            const result = await organization.listInvitations({
                query: { organizationId: activeOrg.id },
            });
            return result.data ?? [];
        },
        enabled: !!activeOrg?.id,
    });

    const pendingInvitations = (invitationsData ?? []).filter(
        (inv: Invitation) => inv.status === 'pending'
    ) as Invitation[];

    // Count owners for last owner protection
    const ownerCount = members.filter((m) => m.role === 'owner').length;

    // Filter members by search and role
    const filteredMembers = members.filter((member) => {
        // Role filter
        if (roleFilter !== 'all' && member.role !== roleFilter) {
            return false;
        }
        // Search filter
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            member.user.name?.toLowerCase().includes(query) ||
            member.user.email.toLowerCase().includes(query)
        );
    });

    // Pagination
    const totalPages = Math.ceil(filteredMembers.length / pageSize);
    const paginatedMembers = filteredMembers.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    // Reset to page 1 when filters change
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleRoleFilterChange = (value: string) => {
        setRoleFilter(value);
        setCurrentPage(1);
    };

    // Remove member mutation
    const removeMember = useMutation({
        mutationFn: async (memberIdOrEmail: string) => {
            const result = await organization.removeMember({
                memberIdOrEmail,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to remove member');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
            toast.success('Member removed successfully');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to remove member');
        },
    });

    // Resend invitation mutation
    const resendInvitation = useMutation({
        mutationFn: async (invitation: Invitation) => {
            const result = await organization.inviteMember({
                email: invitation.email,
                role: invitation.role as 'admin' | 'member' | 'owner',
                organizationId: activeOrg?.id,
                resend: true,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to resend invitation');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invitations'] });
            toast.success('Invitation resent successfully');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to resend invitation');
        },
    });

    // Cancel invitation mutation
    const cancelInvitation = useMutation({
        mutationFn: async (invitationId: string) => {
            const result = await organization.cancelInvitation({
                invitationId,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to cancel invitation');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invitations'] });
            toast.success('Invitation cancelled');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to cancel invitation');
        },
    });

    // Get current user info
    const { data: session } = useSession();
    const currentUserMember = members.find((m) => m.userId === session?.user?.id);

    // Permission checks using CASL
    // Member:invite - can invite new members
    const canInvite = useCan('invite', 'Member');
    // Member:update - can change member roles
    const canUpdate = useCan('update', 'Member');
    // Member:remove - can remove members
    const canRemove = useCan('remove', 'Member');
    // Legacy: combined check for backwards compatibility
    const canManageMembers = canInvite || canUpdate || canRemove;

    // Leave organization mutation
    const leaveOrganization = useMutation({
        mutationFn: async () => {
            if (!activeOrg?.id) throw new Error('No active organization');
            const result = await organization.leave({
                organizationId: activeOrg.id,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to leave organization');
            }
            return result.data;
        },
        onSuccess: () => {
            toast.success('You have left the organization');
            // Reload to update organization context
            window.location.reload();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to leave organization');
        },
    });

    // Update role mutation
    const updateRole = useMutation({
        mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
            const result = await organization.updateMemberRole({
                memberId,
                role,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to update role');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
            toast.success('Role updated successfully');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to update role');
        },
    });

    const getRoleBadgeVariant = (role: string) => {
        switch (role) {
            case 'owner':
                return 'default';
            case 'admin':
                return 'secondary';
            default:
                return 'outline';
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Members</h1>
                </div>
                <div className="flex items-center gap-2">
                    {/* Leave Organization - only show if not owner */}
                    {currentUserMember && currentUserMember.role !== 'owner' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline">
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Leave
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Leave Organization</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to leave {activeOrg?.name || 'this organization'}?
                                        You will lose access to all resources in this organization.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => leaveOrganization.mutate()}
                                        disabled={leaveOrganization.isPending}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        {leaveOrganization.isPending ? 'Leaving...' : 'Leave Organization'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    {/* Invite Member - only show with invite permission */}
                    {canInvite && (
                        <InviteMemberDialog
                            open={inviteOpen}
                            onOpenChange={setInviteOpen}
                            organizationId={activeOrg?.id}
                            roles={(roles as Role[] | undefined) ?? []}
                        />
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">Organization Members</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Manage members of {activeOrg?.name || 'your organization'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
                                <SelectTrigger className="w-32">
                                    <SelectValue placeholder="Filter role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All roles</SelectItem>
                                    {(roles as Role[] | undefined)?.map((role) => (
                                        <SelectItem key={role.id} value={role.slug}>
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search members..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{searchQuery ? 'No members found' : 'No members yet'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {paginatedMembers.map((member) => (
                            <div
                                key={member.id}
                                className="p-4 flex items-center justify-between hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                        {member.user.name?.[0]?.toUpperCase() ?? member.user.email[0]?.toUpperCase() ?? 'U'}
                                    </div>
                                    <div>
                                        <h3 className="font-medium">{member.user.name || 'Unnamed'}</h3>
                                        <p className="text-sm text-muted-foreground">{member.user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant={getRoleBadgeVariant(member.role)}>
                                        {member.role}
                                    </Badge>
                                    {(canUpdate || canRemove) && member.userId !== session?.user?.id && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {canUpdate && member.role !== 'owner' && (
                                                    <DropdownMenuItem
                                                        onClick={() => setEditingMember(member)}
                                                    >
                                                        <Shield className="h-4 w-4 mr-2" />
                                                        修改角色
                                                    </DropdownMenuItem>
                                                )}
                                                {canRemove && (
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (member.role === 'owner' && ownerCount <= 1) {
                                                                toast.error('Cannot remove the last owner');
                                                                return;
                                                            }
                                                            removeMember.mutate(member.id);
                                                        }}
                                                        disabled={member.role === 'owner' && ownerCount <= 1}
                                                        className="text-destructive"
                                                    >
                                                        <UserMinus className="h-4 w-4 mr-2" />
                                                        移除成员
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pending Invitations Section */}
                {canManageMembers && pendingInvitations.length > 0 && (
                    <div className="border-t border-border">
                        <div className="p-4 bg-muted/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <h3 className="font-medium text-sm">Pending Invitations ({pendingInvitations.length})</h3>
                            </div>
                            <div className="space-y-2">
                                {pendingInvitations.map((invitation) => (
                                    <div
                                        key={invitation.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-background border"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{invitation.email}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="outline" className="text-xs">
                                                        {invitation.role}
                                                    </Badge>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => resendInvitation.mutate(invitation)}
                                                disabled={resendInvitation.isPending}
                                            >
                                                <RefreshCw className={`h-4 w-4 mr-1 ${resendInvitation.isPending ? 'animate-spin' : ''}`} />
                                                Resend
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => cancelInvitation.mutate(invitation.id)}
                                                disabled={cancelInvitation.isPending}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredMembers.length)} of {filteredMembers.length} members
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Change Role Dialog */}
            <ChangeRoleDialog
                member={editingMember}
                roles={(roles as Role[] | undefined) ?? []}
                onClose={() => setEditingMember(null)}
                onConfirm={(memberId, role) => {
                    updateRole.mutate({ memberId, role });
                    setEditingMember(null);
                }}
                isPending={updateRole.isPending}
            />
        </div>
    );
}

/**
 * Invite Member Dialog
 */
function InviteMemberDialog({
    open,
    onOpenChange,
    organizationId,
    roles,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId?: string | undefined;
    roles: Role[];
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('member');
    const queryClient = useQueryClient();

    const inviteMember = useMutation({
        mutationFn: async () => {
            const result = await organization.inviteMember({
                email,
                role: role as 'admin' | 'member' | 'owner',
                organizationId,
            });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to send invitation');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
            toast.success('Invitation sent successfully');
            setEmail('');
            setRole('member');
            onOpenChange(false);
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to send invitation');
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Member
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                    <DialogDescription>
                        Send an invitation to join your organization.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="member@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {roles
                                    .filter((r) => r.slug !== 'owner')
                                    .map((r) => (
                                        <SelectItem key={r.id} value={r.slug}>
                                            {r.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => inviteMember.mutate()}
                        disabled={!email || inviteMember.isPending}
                    >
                        {inviteMember.isPending ? 'Sending...' : 'Send Invitation'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Change Role Dialog
 */
function ChangeRoleDialog({
    member,
    roles,
    onClose,
    onConfirm,
    isPending,
}: {
    member: Member | null;
    roles: Role[];
    onClose: () => void;
    onConfirm: (memberId: string, role: string) => void;
    isPending: boolean;
}) {
    const [selectedRole, setSelectedRole] = useState('');

    // Reset selected role when dialog opens with a new member
    const open = !!member;

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>修改角色</DialogTitle>
                    <DialogDescription>
                        修改 <strong>{member?.user.name || member?.user.email}</strong> 的组织角色
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label>选择角色</Label>
                    <Select
                        value={selectedRole || member?.role || ''}
                        onValueChange={setSelectedRole}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="选择角色" />
                        </SelectTrigger>
                        <SelectContent>
                            {roles
                                .filter((r) => r.slug !== 'owner')
                                .map((r) => (
                                    <SelectItem key={r.id} value={r.slug}>
                                        {r.name}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        取消
                    </Button>
                    <Button
                        onClick={() => {
                            if (member && (selectedRole || member.role)) {
                                onConfirm(member.id, selectedRole || member.role);
                            }
                        }}
                        disabled={isPending || !selectedRole || selectedRole === member?.role}
                    >
                        {isPending ? '修改中...' : '确定'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
