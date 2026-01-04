/**
 * OrgAdminRoute Component
 *
 * Route protection for Layer 1 (org admin) operations.
 * Checks for organization admin or owner role.
 */
import { Navigate } from 'react-router-dom';
import { useSession, useActiveOrganization, organization } from '../lib/auth-client';
import { useQuery } from '@tanstack/react-query';

interface OrgAdminRouteProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export function OrgAdminRoute({ children, fallback }: OrgAdminRouteProps) {
    const { data: session, isPending: sessionPending } = useSession();
    const { data: activeOrg, isPending: orgPending } = useActiveOrganization();

    // Fetch current user's membership to check org role
    const { data: membershipData, isPending: membershipPending } = useQuery({
        queryKey: ['currentUserMembership', activeOrg?.id, session?.user?.id],
        queryFn: async () => {
            if (!activeOrg?.id || !session?.user?.id) return null;
            const result = await organization.getFullOrganization({
                query: { organizationId: activeOrg.id },
            });
            const members = result.data?.members ?? [];
            return members.find((m: { userId: string }) => m.userId === session.user.id) || null;
        },
        enabled: !!activeOrg?.id && !!session?.user?.id,
    });

    const isPending = sessionPending || orgPending || membershipPending;

    if (isPending) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
        );
    }

    const membership = membershipData as { role: string } | null;
    const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin';

    if (!isOrgAdmin) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
