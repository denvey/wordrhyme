import { useState, useEffect } from 'react';
import { useLocation, Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { signIn } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import { Button } from '@wordrhyme/ui';
import { GoogleIcon, GitHubIcon, AppleIcon } from '../components/icons/SocialIcons';

type OAuthProvider = 'google' | 'github' | 'apple';

export function LoginPage() {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [socialLoading, setSocialLoading] = useState<string | null>(null);

    // Fetch enabled OAuth providers
    const { data: enabledProviders = [] } = trpc.oauthSettings.getEnabledProviders.useQuery(
        undefined,
        { retry: false, staleTime: 60000 }
    );

    const from = (location.state as { from?: string })?.from || '/';

    // Handle OAuth error from URL
    useEffect(() => {
        const error = searchParams.get('error');
        if (error) {
            const errorMessages: Record<string, string> = {
                'OAuthAccountNotLinked': '此邮箱已使用其他方式注册，请使用邮箱密码登录',
                'AccessDenied': '登录已取消',
                'Configuration': 'OAuth 配置错误，请联系管理员',
                'EmailNotProvided': '登录失败：未获取到邮箱信息',
            };
            // Use whitelisted message or generic fallback to prevent XSS
            const message = errorMessages[error] || '登录失败，请重试';
            toast.error(message);
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await login(email, password);
            window.location.href = from;
        } catch (error) {
            console.error('Login failed:', error);
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google' | 'github' | 'apple') => {
        setSocialLoading(provider);
        try {
            await signIn.social({ provider });
        } catch (error) {
            console.error(`${provider} login failed:`, error);
            setSocialLoading(null);
        }
    };

    const isDisabled = isLoading || !!socialLoading;

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-primary">WordRhyme</h1>
                    <p className="text-muted-foreground mt-2">Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@example.com"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                            disabled={isDisabled}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                            disabled={isDisabled}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isDisabled}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
                    >
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                {/* OAuth Section - only show if providers are enabled */}
                {enabledProviders.length > 0 && (
                    <>
                        {/* OAuth Separator */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        {/* OAuth Buttons */}
                        <div className={`grid gap-2 ${enabledProviders.length === 1 ? 'grid-cols-1' : enabledProviders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {enabledProviders.includes('google') && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => handleSocialLogin('google')}
                                    aria-label="Sign in with Google"
                                >
                                    <GoogleIcon className="size-4" />
                                </Button>
                            )}
                            {enabledProviders.includes('github') && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => handleSocialLogin('github')}
                                    aria-label="Sign in with GitHub"
                                >
                                    <GitHubIcon className="size-4" />
                                </Button>
                            )}
                            {enabledProviders.includes('apple') && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => handleSocialLogin('apple')}
                                    aria-label="Sign in with Apple"
                                >
                                    <AppleIcon className="size-4" />
                                </Button>
                            )}
                        </div>
                    </>
                )}

                <div className="text-center text-sm text-muted-foreground">
                    <p>Dev mode: Any credentials will work</p>
                </div>

                <div className="text-center text-sm text-muted-foreground">
                    <span>Don't have an account?</span>
                    <Link to="/register" className="text-primary hover:underline ml-1">
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}
