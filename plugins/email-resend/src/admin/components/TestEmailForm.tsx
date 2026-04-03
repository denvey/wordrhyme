/**
 * Test Email Form Component
 */
import type React from 'react';
import { useState } from 'react';
import { usePluginTrpc } from '@wordrhyme/plugin/react';

interface TestEmailFormProps {
    isConfigured: boolean;
}

export function TestEmailForm({ isConfigured }: TestEmailFormProps) {
    const pluginApi = usePluginTrpc('email-resend');
    const [email, setEmail] = useState('');
    const [result, setResult] = useState<{ type: 'success' | 'error'; message: string; emailId?: string } | null>(null);

    const sendTestMutation = pluginApi.sendTest.useMutation({
        onSuccess: (response: { emailId: string }) => {
            setResult({
                type: 'success',
                message: '测试邮件发送成功。',
                emailId: response.emailId,
            });
            setEmail('');
        },
        onError: (error: Error) => {
            setResult({
                type: 'error',
                message: error.message || '测试邮件发送失败',
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            return;
        }

        setResult(null);
        sendTestMutation.mutate({ to: email });
    };

    return (
        <div className="space-y-4 rounded-lg border p-6">
            <div>
                <h3 className="text-lg font-medium">Send Test Email</h3>
                <p className="text-sm text-muted-foreground">
                    向指定邮箱发送一封测试邮件，确认 Resend 配置可用。
                </p>
            </div>

            {!isConfigured && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <p className="text-sm text-yellow-800">
                        请先保存有效配置，再发送测试邮件。
                    </p>
                </div>
            )}

            {result && (
                <div className={`rounded-lg border p-4 ${result.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <p className={result.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                        {result.message}
                    </p>
                    {result.emailId && (
                        <p className="mt-1 text-xs text-green-600">
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
                    className="flex h-10 max-w-sm flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="recipient@example.com"
                    disabled={!isConfigured || sendTestMutation.isPending}
                    required
                />
                <button
                    type="submit"
                    disabled={!isConfigured || sendTestMutation.isPending || !email}
                    className="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {sendTestMutation.isPending ? (
                        <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
