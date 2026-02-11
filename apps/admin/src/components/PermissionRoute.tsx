/**
 * PermissionRoute Component
 *
 * Flexible route protection based on CASL permissions.
 * Replaces hardcoded OrgAdminRoute with configurable action/subject.
 *
 * Features:
 * - Configurable action and subject for permission check
 * - Shows ForbiddenPage instead of redirect (better UX)
 * - Supports custom fallback component
 * - Handles loading state gracefully
 */
import { useCan, type AppAction, type AppSubject } from '../lib/ability';
import { ForbiddenPage } from './ForbiddenPage';

interface PermissionRouteProps {
    /** Required action (read, create, update, delete, manage) */
    action: AppAction;
    /** Resource subject to check permission against */
    subject: AppSubject;
    /** Child components to render if permission granted */
    children: React.ReactNode;
    /** Custom fallback component instead of ForbiddenPage */
    fallback?: React.ReactNode;
    /** Custom forbidden page title */
    forbiddenTitle?: string;
    /** Custom forbidden page description */
    forbiddenDescription?: string;
}

export function PermissionRoute({
    action,
    subject,
    children,
    fallback,
    forbiddenTitle,
    forbiddenDescription,
}: PermissionRouteProps) {
    // Check permission using CASL ability
    const hasPermission = useCan(action, subject);

    // Permission denied - show forbidden page or fallback
    if (!hasPermission) {
        if (fallback) {
            return <>{fallback}</>;
        }
        // Only pass props when defined to satisfy exactOptionalPropertyTypes
        return (
            <ForbiddenPage
                {...(forbiddenTitle !== undefined && { title: forbiddenTitle })}
                {...(forbiddenDescription !== undefined && { description: forbiddenDescription })}
            />
        );
    }

    // Permission granted - render children
    return <>{children}</>;
}
