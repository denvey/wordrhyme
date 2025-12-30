/**
 * Authentication Context & Provider
 *
 * Uses better-auth for real authentication with the server.
 */
import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, signIn, signOut } from './auth-client';

interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'member';
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
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

    // Convert session user to our User type
    const user: User | null = session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || session.user.email.split('@')[0],
        role: 'admin' as const, // TODO: Get from organization membership
    } : null;

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
