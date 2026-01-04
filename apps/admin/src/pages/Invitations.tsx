/**
 * Invitations Page
 *
 * Shows pending invitations for the current user and allows accepting them.
 */
import { Mail, Check, X } from 'lucide-react';
import { organization, useSession } from '../lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wordrhyme/ui';
import { toast } from 'sonner';

interface Invitation {
    id: string;
    organizationId: string;
    organizationName?: string | undefined;
    organizationSlug?: string | undefined;
    role: string;
    status: string;
    expiresAt: Date;
}

export function InvitationsPage() {
    const { data: session } = useSession();
    const queryClient = useQueryClient();

    // Fetch pending invitations for current user
    const { data: invitationsData, isLoading } = useQuery({
        queryKey: ['user-invitations', session?.user?.email],
        queryFn: async () => {
            // Use listUserInvitations to get invitations sent TO the current user
            const result = await organization.listUserInvitations();
            return result.data;
        },
        enabled: !!session?.user?.email,
    });

    const invitations = (invitationsData ?? []) as Invitation[];
    const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

    // Accept invitation mutation
    const acceptInvitation = useMutation({
        mutationFn: async (invitationId: string) => {
            const result = await organization.acceptInvitation({ invitationId });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to accept invitation');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-invitations'] });
            toast.success('Invitation accepted! You are now a member of the organization.');
            // Reload to update organization context
            window.location.reload();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to accept invitation');
        },
    });

    // Reject invitation mutation
    const rejectInvitation = useMutation({
        mutationFn: async (invitationId: string) => {
            const result = await organization.rejectInvitation({ invitationId });
            if (result.error) {
                throw new Error(result.error.message || 'Failed to reject invitation');
            }
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-invitations'] });
            toast.success('Invitation rejected');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to reject invitation');
        },
    });

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <Mail className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Invitations</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pending Invitations</CardTitle>
                    <CardDescription>
                        Organization invitations waiting for your response
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="py-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                        </div>
                    ) : pendingInvitations.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No pending invitations</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pendingInvitations.map((invitation) => (
                                <div
                                    key={invitation.id}
                                    className="flex items-center justify-between p-4 rounded-lg border"
                                >
                                    <div>
                                        <h3 className="font-medium">
                                            {invitation.organizationName ?? 'Organization'}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Invited as <Badge variant="outline">{invitation.role}</Badge>
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => acceptInvitation.mutate(invitation.id)}
                                            disabled={acceptInvitation.isPending}
                                        >
                                            <Check className="h-4 w-4 mr-1" />
                                            Accept
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => rejectInvitation.mutate(invitation.id)}
                                            disabled={rejectInvitation.isPending}
                                        >
                                            <X className="h-4 w-4 mr-1" />
                                            Reject
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
