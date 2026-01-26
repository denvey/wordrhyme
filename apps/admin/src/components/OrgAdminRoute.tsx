/**
 * OrgAdminRoute Component
 *
 * Route protection for organization admin operations.
 * Uses CASL ability to check if user can manage organizations.
 */
import { Navigate } from 'react-router-dom';
import { useCan } from '../lib/ability';

interface OrgAdminRouteProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export function OrgAdminRoute({ children, fallback }: OrgAdminRouteProps) {
    // Check if user has permission to manage organizations
    // This uses the CASL ability loaded from backend via permissions.myRules
    const canManage = useCan('manage', 'Organization');

    if (!canManage) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
