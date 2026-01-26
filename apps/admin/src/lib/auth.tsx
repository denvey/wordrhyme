/**
 * Authentication Context & Provider
 *
 * Uses better-auth for real authentication with the server.
 */
import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, signIn, signOut, useActiveOrganization, organization } from './auth-client';
import { useQuery } from '@tanstack/react-query';

/** Admin roles that grant super admin access */
const ADMIN_ROLES = ['admin', 'super-admin'] as const;

interface User {
    id: string;
    email: string;
    name: string;
    role?: string | undefined;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isSuperAdmin: boolean;
    isOrgAdmin: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const { data: session, isPending } = useSession();
    const { data: activeOrg } = useActiveOrganization();

    // Fetch current user's membership to check org role
    const { data: membershipData } = useQuery({
        queryKey: ['membership', activeOrg?.id, session?.user?.id],
        queryFn: async () => {
            if (!activeOrg?.id) return null;
            const result = await organization.getFullOrganization({
                query: { organizationId: activeOrg.id },
            });
            const members = result.data?.members ?? [];
            return members.find((m: { userId: string }) => m.userId === session?.user?.id);
        },
        enabled: !!activeOrg?.id && !!session?.user?.id,
    });

    // Convert session user to our User type
    const user: User | null = session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? session.user.email.split('@')[0],
        role: (session.user as { role?: string }).role,
    } : null;

    // Check if user is super admin (global role)
    const isSuperAdmin = !!(user?.role && ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]));

    // Check if user is org admin (organization role)
    const memberRole = (membershipData as { role?: string } | null)?.role;
    const isOrgAdmin = memberRole === 'admin' || memberRole === 'owner' || isSuperAdmin;

    const login = async (email: string, password: string) => {
        const result = await signIn.email({
            email,
            password,
        });

        if (result.error) {
            throw new Error(result.error.message || 'Login failed');
        }
    };

    const logout = async () => {
        await signOut();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!session?.user,
                isLoading: isPending,
                isSuperAdmin,
                isOrgAdmin,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Protected Route wrapper - redirects to login if not authenticated
 */
interface ProtectedRouteProps {
    children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate('/login', { state: { from: location.pathname } });
        }
    }, [isAuthenticated, isLoading, navigate, location]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}

/**
 * Super Admin Route - only accessible by global super admins
 */
interface SuperAdminRouteProps {
    children: ReactNode;
    fallback?: ReactNode;
}

export function SuperAdminRoute({ children, fallback }: SuperAdminRouteProps) {
    const { isSuperAdmin, isLoading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && !isSuperAdmin && !fallback) {
            navigate('/');
        }
    }, [isSuperAdmin, isLoading, navigate, fallback]);

    if (isLoading) {
        return (
            <div className="min-h-[200px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isSuperAdmin) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return null;
    }

    return <>{children}</>;
}

/**
 * Org Admin Route - accessible by org admins, owners, or super admins
 */
interface OrgAdminRouteProps {
    children: ReactNode;
    fallback?: ReactNode;
}

export function OrgAdminRoute({ children, fallback }: OrgAdminRouteProps) {
    const { isOrgAdmin, isLoading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && !isOrgAdmin && !fallback) {
            navigate('/');
        }
    }, [isOrgAdmin, isLoading, navigate, fallback]);

    if (isLoading) {
        return (
            <div className="min-h-[200px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isOrgAdmin) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return null;
    }

    return <>{children}</>;
}
