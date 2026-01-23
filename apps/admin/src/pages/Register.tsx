import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { signUp } from '../lib/auth-client';

// Validation schema
const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (values: RegisterFormValues) => {
        setIsLoading(true);

        try {
            const result = await signUp.email({
                name: values.name,
                email: values.email,
                password: values.password,
            });

            // better-auth returns error in response, not as thrown exception
            if (result.error) {
                toast.error(result.error.message || 'Registration failed');
                return;
            }

            setIsSuccess(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Registration failed';
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    // Success view - check your email
    if (isSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Check your email</h1>
                    <p className="text-muted-foreground">
                        We've sent a verification link to your email address.
                        Please click the link to complete your registration.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    // Registration form
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-primary">WordRhyme</h1>
                    <p className="text-muted-foreground mt-2">Create your account</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium mb-2">Name</label>
                        <input
                            {...register('name')}
                            id="name"
                            type="text"
                            placeholder="Your name"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                        />
                        {errors.name && (
                            <p className="text-sm text-destructive mt-1">
                                {errors.name.message}
                            </p>
                        )}
                    </div>

                    {/* Email */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
                        <input
                            {...register('email')}
                            id="email"
                            type="email"
                            placeholder="your@email.com"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {errors.email && (
                            <p className="text-sm text-destructive mt-1">
                                {errors.email.message}
                            </p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium mb-2">Password</label>
                        <input
                            {...register('password')}
                            id="password"
                            type="password"
                            placeholder="At least 8 characters"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {errors.password && (
                            <p className="text-sm text-destructive mt-1">
                                {errors.password.message}
                            </p>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">Confirm Password</label>
                        <input
                            {...register('confirmPassword')}
                            id="confirmPassword"
                            type="password"
                            placeholder="Re-enter your password"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {errors.confirmPassword && (
                            <p className="text-sm text-destructive mt-1">
                                {errors.confirmPassword.message}
                            </p>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating account...
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div className="text-center text-sm text-muted-foreground">
                    <span>Already have an account?</span>
                    <Link to="/login" className="text-primary hover:underline ml-1">
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
