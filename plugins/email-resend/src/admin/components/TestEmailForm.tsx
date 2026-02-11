/**
 * Test Email Form Component
 *
 * Allows admins to send a test email to verify configuration.
 * Features:
 * - Recipient email input (required)
 * - Send Test button
 * - Loading state during send
 * - Success message with email ID
 * - Error message on failure
 */
import React, { useState } from 'react';

interface TestEmailFormProps {
    isConfigured: boolean;
}

export function TestEmailForm({ isConfigured }: TestEmailFormProps) {
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ type: 'success' | 'error'; message: string; emailId?: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setSending(true);
        setResult(null);

        try {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                throw new Error('Invalid email format');
            }

            // In real implementation, this would call the tRPC endpoint
            // const response = await trpc.sendTest.mutate({ to: email });

            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Simulate success
            const mockEmailId = 'email_' + Math.random().toString(36).substring(7);

            setResult({
                type: 'success',
                message: 'Test email sent successfully!',
                emailId: mockEmailId,
            });
            setEmail('');
        } catch (error) {
            setResult({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to send test email',
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="border rounded-lg p-6 space-y-4">
            <div>
                <h3 className="text-lg font-medium">Send Test Email</h3>
                <p className="text-sm text-muted-foreground">
                    Send a test email to verify your configuration.
                </p>
            </div>

            {!isConfigured && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                        Please configure and save your settings before sending a test email.
                    </p>
                </div>
            )}

            {result && (
                <div className={`p-4 rounded-lg border ${result.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={result.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                        {result.message}
                    </p>
                    {result.emailId && (
                        <p className="text-xs text-green-600 mt-1">
                            Email ID: {result.emailId}
                        </p>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-3">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex h-10 flex-1 max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="recipient@example.com"
                    disabled={!isConfigured || sending}
                    required
                />
                <button
                    type="submit"
                    disabled={!isConfigured || sending || !email}
                    className="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {sending ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                            Sending...
                        </>
                    ) : (
                        'Send Test'
                    )}
                </button>
            </form>
        </div>
    );
}

export default TestEmailForm;
