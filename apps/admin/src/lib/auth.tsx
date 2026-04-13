/**
 * Authentication Context & Provider
 *
 * Uses better-auth for real authentication with the server.
 * Route-level permission checks should use PermissionRoute (CASL-based).
 */
import { createContext, useContext, type ReactNode, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, signIn, signOut } from './auth-client';

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
        name: session.user.name ?? session.user.email.split('@')[0],
        role: (session.user as { role?: string }).role,
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
 *
 * NOTE: better-auth 的 session atom 在窗口重新获得焦点时会触发 refetch（visibilitychange），
 * 在 refetch 期间可能出现 data=null + isPending=false 的中间态，导致误跳转到登录页。
 * 解决方案：使用 wasAuthenticated ref 记录之前的认证状态，如果之前已认证过，
 * 则给一个短暂的宽限期等待 refetch 完成，而不是立即跳转。
 */
interface ProtectedRouteProps {
    children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    // 追踪用户是否曾经通过认证（用于区分首次加载 vs visibilitychange refetch）
    const wasAuthenticated = useRef(false);

    useEffect(() => {
        if (isAuthenticated) {
            wasAuthenticated.current = true;
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            if (wasAuthenticated.current) {
                // 之前已认证过，可能是 visibilitychange 触发的 refetch 导致的短暂中间态
                // 等待一小段时间再判断，给 better-auth 的 session refetch 完成的机会
                const timer = setTimeout(() => {
                    // 再次检查：如果在延迟期间 session 恢复了，就不跳转
                    // 这里无法直接读取最新状态，所以我们依赖 effect 会被重新触发
                    navigate('/login', { state: { from: location.pathname } });
                }, 2000);
                return () => clearTimeout(timer);
            }
            // 首次加载就未认证，直接跳转
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
        // 如果之前已认证过，显示 loading 而不是空白（等待 refetch 完成或超时跳转）
        if (wasAuthenticated.current) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            );
        }
        return null;
    }

    return <>{children}</>;
}
