/**
 * Email Settings Page Component
 *
 * Admin UI for configuring Resend email settings.
 * Features:
 * - API Key input (password type, masked)
 * - From Address input (email validation)
 * - From Name input (optional, default "WordRhyme")
 * - Reply-To input (optional email)
 * - Save button with loading state
 * - Success/error toast notifications
 */
import React, { useState, useEffect } from 'react';

interface SettingsFormData {
    apiKey: string;
    fromAddress: string;
    fromName: string;
    replyTo: string;
}

interface SettingsStatus {
    configured: boolean;
    hasPermission: boolean;
    fromAddress?: string;
    fromName?: string;
    replyTo?: string;
    hasApiKey?: boolean;
}

export function SettingsPage() {
    const [formData, setFormData] = useState<SettingsFormData>({
        apiKey: '',
        fromAddress: '',
        fromName: 'WordRhyme',
        replyTo: '',
    });
    const [status, setStatus] = useState<SettingsStatus | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load current settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // In real implementation, this would call the tRPC endpoint
            // For now, we simulate loading
            const mockStatus: SettingsStatus = {
                configured: false,
                hasPermission: true,
                fromAddress: '',
                fromName: 'WordRhyme',
                replyTo: '',
                hasApiKey: false,
            };
            setStatus(mockStatus);
            if (mockStatus.hasPermission) {
                setFormData({
                    apiKey: '',
                    fromAddress: mockStatus.fromAddress || '',
                    fromName: mockStatus.fromName || 'WordRhyme',
                    replyTo: mockStatus.replyTo || '',
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: 'Failed to load settings',
            });
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            // Validate API key format if provided
            if (formData.apiKey && !formData.apiKey.startsWith('re_')) {
                throw new Error('API Key must start with "re_"');
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.fromAddress)) {
                throw new Error('Invalid from address email format');
            }
            if (formData.replyTo && !emailRegex.test(formData.replyTo)) {
                throw new Error('Invalid reply-to email format');
            }

            // In real implementation, this would call the tRPC endpoint
            // await trpc.saveSettings.mutate(formData);

            // Simulate success
            await new Promise(resolve => setTimeout(resolve, 500));

            setMessage({
                type: 'success',
                text: 'Settings saved successfully',
            });

            // Clear API key field after save (don't show the actual key)
            setFormData(prev => ({ ...prev, apiKey: '' }));
            setStatus(prev => prev ? { ...prev, configured: true, hasApiKey: true } : null);
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Failed to save settings',
            });
        } finally {
            setSaving(false);
        }
    };

    if (!status) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!status.hasPermission) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">
                        You don't have permission to view email settings.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h2 className="text-2xl font-semibold">Email Settings</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Configure Resend API for sending notification emails.
                </p>
            </div>

            {/* Status indicator */}
            <div className={`p-4 rounded-lg border ${status.configured ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className={status.configured ? 'text-green-800' : 'text-yellow-800'}>
                        {status.configured ? 'Email service configured' : 'Email service not configured'}
                    </span>
                </div>
            </div>

            {/* Message display */}
            {message && (
                <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {message.text}
                </div>
            )}

            {/* Settings form */}
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                {/* API Key */}
                <div className="space-y-2">
                    <label htmlFor="apiKey" className="text-sm font-medium">
                        Resend API Key
                        {status.hasApiKey && <span className="text-green-600 ml-2">(configured)</span>}
                    </label>
                    <input
                        id="apiKey"
                        name="apiKey"
                        type="password"
                        value={formData.apiKey}
                        onChange={handleInputChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={status.hasApiKey ? '••••••••••••••••' : 're_xxxxxxxxxxxxxxxx'}
                    />
                    <p className="text-xs text-muted-foreground">
                        Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">Resend Dashboard</a>
                    </p>
                </div>

                {/* From Address */}
                <div className="space-y-2">
                    <label htmlFor="fromAddress" className="text-sm font-medium">
                        From Address <span className="text-red-500">*</span>
                    </label>
                    <input
                        id="fromAddress"
                        name="fromAddress"
                        type="email"
                        value={formData.fromAddress}
                        onChange={handleInputChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="noreply@yourdomain.com"
                        required
                    />
                    <p className="text-xs text-muted-foreground">
                        Must be a verified domain in Resend
                    </p>
                </div>

                {/* From Name */}
                <div className="space-y-2">
                    <label htmlFor="fromName" className="text-sm font-medium">
                        From Name
                    </label>
                    <input
                        id="fromName"
                        name="fromName"
                        type="text"
                        value={formData.fromName}
                        onChange={handleInputChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="WordRhyme"
                        maxLength={100}
                    />
                    <p className="text-xs text-muted-foreground">
                        Display name shown in email client
                    </p>
                </div>

                {/* Reply-To */}
                <div className="space-y-2">
                    <label htmlFor="replyTo" className="text-sm font-medium">
                        Reply-To Address
                    </label>
                    <input
                        id="replyTo"
                        name="replyTo"
                        type="email"
                        value={formData.replyTo}
                        onChange={handleInputChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="support@yourdomain.com"
                    />
                    <p className="text-xs text-muted-foreground">
                        Optional. Where replies should be sent.
                    </p>
                </div>

                {/* Submit button */}
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                            Saving...
                        </>
                    ) : (
                        'Save Settings'
                    )}
                </button>
            </form>
        </div>
    );
}

export default SettingsPage;
