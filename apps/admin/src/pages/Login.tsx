import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LoginPage() {
    const location = useLocation();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const from = (location.state as { from?: string })?.from || '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await login(email, password);
            // Use window.location.href to force a full page reload
            // This ensures the session is properly loaded
            window.location.href = from;
        } catch (error) {
            // If login fails, show error and stay on page
            console.error('Login failed:', error);
            setIsLoading(false);
        }
    };

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
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
                    >
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

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
