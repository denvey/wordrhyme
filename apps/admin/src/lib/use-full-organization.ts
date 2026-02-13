/**
 * useFullOrganization Hook
 *
 * Shared hook for fetching full organization data (members, invitations, etc.)
 * Uses a unified queryKey so React Query deduplicates concurrent requests.
 *
 * Consumers: Members.tsx, MemberDetail.tsx, and any future pages needing member data.
 */
import { useQuery } from '@tanstack/react-query';
import { organization, useActiveOrganization } from './auth-client';

export function useFullOrganization() {
    const { data: activeOrg } = useActiveOrganization();

    return useQuery({
        queryKey: ['fullOrganization', activeOrg?.id],
        queryFn: async () => {
            if (!activeOrg?.id) return null;
            const result = await organization.getFullOrganization({
                query: { organizationId: activeOrg.id },
            });
            return result.data;
        },
        enabled: !!activeOrg?.id,
    });
}
