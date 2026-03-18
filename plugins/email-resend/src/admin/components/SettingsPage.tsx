/**
 * Email Settings Page Component
 *
 * Admin UI for configuring Resend email settings.
 */
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePluginTrpc } from '@wordrhyme/plugin/react';
import { TestEmailForm } from './TestEmailForm';

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

const DEFAULT_FORM_DATA: SettingsFormData = {
    apiKey: '',
    fromAddress: '',
    fromName: 'WordRhyme',
    replyTo: '',
};

export function SettingsPage() {
    const pluginApi = usePluginTrpc('email-resend');
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<SettingsFormData>(DEFAULT_FORM_DATA);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const { data: status, isLoading } = pluginApi.getStatus.useQuery();

    const saveMutation = pluginApi.saveSettings.useMutation({
        onSuccess: (result: { configured: boolean }) => {
            queryClient.invalidateQueries({ queryKey: [['pluginApis', 'email-resend', 'getStatus']] });
            setFormData((prev) => ({ ...prev, apiKey: '' }));
            setMessage({
                type: 'success',
                text: result.configured
                    ? '设置已保存，邮件服务已生效。'
                    : '设置已保存，但邮件服务尚未完成初始化。',
            });
        },
        onError: (error: Error) => {
            setMessage({
                type: 'error',
                text: error.message || '保存设置失败',
            });
        },
    });

    useEffect(() => {
        if (!status?.hasPermission) {
            return;
        }

        setFormData({
            apiKey: '',
            fromAddress: status.fromAddress || '',
            fromName: status.fromName || 'WordRhyme',
            replyTo: status.replyTo || '',
        });
    }, [status]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (formData.apiKey && !formData.apiKey.startsWith('re_')) {
            setMessage({
                type: 'error',
                text: 'API Key 必须以 re_ 开头。',
            });
            return;
        }

        saveMutation.mutate({
            apiKey: formData.apiKey || undefined,
            fromAddress: formData.fromAddress,
            fromName: formData.fromName.trim() || 'WordRhyme',
            replyTo: formData.replyTo.trim(),
        });
    };

    if (isLoading || !status) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (!status.hasPermission) {
        return (
            <div className="p-6">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-yellow-800">
                        你没有查看或修改邮件配置的权限。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h2 className="text-2xl font-semibold">Email Settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    配置 Resend 发信参数，并发送测试邮件验证配置。
                </p>
            </div>

            <div className={`rounded-lg border p-4 ${status.configured ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${status.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className={status.configured ? 'text-green-800' : 'text-yellow-800'}>
                        {status.configured ? '邮件服务已配置' : '邮件服务未配置'}
                    </span>
                </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                该插件不提供给其他插件的“直接发送 API”。
                业务邮件需要通过 Core Notification System 触发；这里仅提供配置保存和测试发送。
            </div>

            {message && (
                <div className={`rounded-lg border p-4 ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
                <div className="space-y-2">
                    <label htmlFor="apiKey" className="text-sm font-medium">
                        Resend API Key
                        {status.hasApiKey && <span className="ml-2 text-green-600">(configured)</span>}
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
                        必须是 Resend 已验证域名下的地址。
                    </p>
                </div>

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
                </div>

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
                </div>

                <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saveMutation.isPending ? (
                        <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                        </>
                    ) : (
                        'Save Settings'
                    )}
                </button>
            </form>

            <TestEmailForm isConfigured={status.configured} />
        </div>
    );
}

export default SettingsPage;
