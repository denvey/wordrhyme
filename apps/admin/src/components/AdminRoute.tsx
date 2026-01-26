/**
 * AdminRoute Component
 *
 * Route protection for Layer 2 (super admin) operations.
 * Checks for global admin role.
 */
import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';

const ADMIN_ROLES = ['admin', 'super-admin'];

interface AdminRouteProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export function AdminRoute({ children, fallback }: AdminRouteProps) {
    const { data: session, isPending } = useSession();

    if (isPending) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
        );
    }

    const isAdmin = session?.user?.role && ADMIN_ROLES.includes(session.user.role);

    if (!isAdmin) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
