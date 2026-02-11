/**
 * S3 Storage Settings Page
 *
 * Admin UI for configuring multiple S3 storage instances.
 * Features:
 * - List configured instances with status
 * - Add/edit/delete instances
 * - Test connection functionality
 * - Preset templates for AWS/R2/MinIO
 */
import React, { useState } from 'react';
import { usePluginTrpc } from '@wordrhyme/plugin/react';
import { useQueryClient } from '@tanstack/react-query';
import type { S3Instance, S3InstanceFormData, TestConnectionResult } from '../types';

const PROVIDER_ID_REGEX = /^[a-z0-9-]{3,64}$/;

const PRESETS: Record<string, { label: string; endpoint: string; forcePathStyle: boolean; region?: string }> = {
    aws: { label: 'AWS S3', endpoint: '', forcePathStyle: false },
    r2: { label: 'Cloudflare R2', endpoint: '', forcePathStyle: false, region: 'auto' },
    minio: { label: 'MinIO', endpoint: '', forcePathStyle: true },
    custom: { label: 'Custom', endpoint: '', forcePathStyle: false },
};

const INITIAL_FORM: S3InstanceFormData = {
    providerId: '',
    displayName: '',
    preset: 'aws',
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicUrlBase: '',
    forcePathStyle: false,
};

export function SettingsPage() {
    const pluginApi = usePluginTrpc('storage-s3');
    const queryClient = useQueryClient();

    // Query: auto-fetches instances on mount, manages loading/error state
    const { data: instances = [], isLoading: loading } = pluginApi.listInstances.useQuery();

    // Mutations
    const saveMutation = pluginApi.saveInstance.useMutation({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [['pluginApis', 'storage-s3', 'listInstances']] });
            setMessage({ type: 'success', text: 'Instance saved successfully' });
            handleCancel();
        },
        onError: (error: Error) => {
            setMessage({ type: 'error', text: error.message || 'Failed to save' });
        },
    });

    const deleteMutation = pluginApi.deleteInstance.useMutation({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [['pluginApis', 'storage-s3', 'listInstances']] });
            setMessage({ type: 'success', text: 'Instance deleted' });
        },
        onError: (error: Error) => {
            setMessage({ type: 'error', text: error.message || 'Failed to delete' });
        },
    });

    const testMutation = pluginApi.testConnection.useMutation({
        onSuccess: (result: TestConnectionResult) => {
            setTestResult(result);
            if (result.ok) {
                setMessage({ type: 'success', text: `Connection successful (${result.latencyMs}ms)` });
            } else {
                setMessage({ type: 'error', text: result.error || 'Connection failed' });
            }
        },
        onError: (error: Error) => {
            setTestResult({ ok: false, error: 'Test failed' });
            setMessage({ type: 'error', text: error.message || 'Test failed' });
        },
    });

    // UI-local state
    const [editing, setEditing] = useState<S3Instance | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [formData, setFormData] = useState<S3InstanceFormData>(INITIAL_FORM);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handlePresetChange = (preset: S3InstanceFormData['preset']) => {
        const presetConfig = PRESETS[preset];
        setFormData(prev => ({
            ...prev,
            preset,
            forcePathStyle: presetConfig.forcePathStyle,
            region: preset === 'r2' ? 'auto' : prev.region,
        }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleAddNew = () => {
        setEditing(null);
        setIsNew(true);
        setFormData(INITIAL_FORM);
        setTestResult(null);
        setMessage(null);
    };

    const handleEdit = (instance: S3Instance) => {
        setEditing(instance);
        setIsNew(false);
        setFormData({
            providerId: instance.providerId,
            displayName: instance.displayName,
            preset: instance.preset,
            endpoint: instance.endpoint || '',
            region: instance.region,
            bucket: instance.bucket,
            accessKeyId: instance.accessKeyId,
            secretAccessKey: '',
            publicUrlBase: instance.publicUrlBase || '',
            forcePathStyle: instance.forcePathStyle,
        });
        setTestResult(null);
        setMessage(null);
    };

    const handleCancel = () => {
        setEditing(null);
        setIsNew(false);
        setFormData(INITIAL_FORM);
        setTestResult(null);
        setMessage(null);
    };

    const handleTestConnection = () => {
        if (!formData.bucket || !formData.accessKeyId) {
            setMessage({ type: 'error', text: 'Please fill in required fields first' });
            return;
        }

        setTestResult(null);
        setMessage(null);

        testMutation.mutate({
            ...formData,
            secretAccessKey: formData.secretAccessKey || undefined,
        });
    };

    const handleSave = () => {
        // Validate providerId format
        if (!PROVIDER_ID_REGEX.test(formData.providerId)) {
            setMessage({ type: 'error', text: 'Provider ID must be 3-64 characters, lowercase letters, numbers, and hyphens only' });
            return;
        }

        // Check for duplicate providerId on new instances
        if (isNew && instances.some((i: S3Instance) => i.providerId === formData.providerId)) {
            setMessage({ type: 'error', text: 'Provider ID already exists' });
            return;
        }

        // Validate required fields
        if (!formData.displayName || !formData.bucket || !formData.accessKeyId) {
            setMessage({ type: 'error', text: 'Please fill in all required fields' });
            return;
        }

        // For non-AWS presets, endpoint is required
        if (formData.preset !== 'aws' && !formData.endpoint) {
            setMessage({ type: 'error', text: 'Endpoint is required for non-AWS providers' });
            return;
        }

        // For new instances, secret is required
        if (isNew && !formData.secretAccessKey) {
            setMessage({ type: 'error', text: 'Secret Access Key is required' });
            return;
        }

        setMessage(null);

        saveMutation.mutate({
            ...formData,
            secretAccessKey: formData.secretAccessKey || undefined,
        });
    };

    const handleDelete = (providerId: string) => {
        if (!confirm(`Delete storage instance "${providerId}"? This cannot be undone.`)) {
            return;
        }

        if (editing?.providerId === providerId) {
            handleCancel();
        }

        deleteMutation.mutate({ providerId });
    };

    const getStatusBadge = (status: S3Instance['status']) => {
        switch (status) {
            case 'healthy':
                return <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded text-xs">Healthy</span>;
            case 'error':
                return <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded text-xs">Error</span>;
            default:
                return <span className="inline-flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded text-xs">Not tested</span>;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h2 className="text-2xl font-semibold">S3 Storage Configuration</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Configure multiple S3-compatible storage providers (AWS S3, Cloudflare R2, MinIO, etc.)
                </p>
            </div>

            {/* Message display */}
            {message && (
                <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {message.text}
                </div>
            )}

            {/* Instances list */}
            {instances.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3 font-medium">Instance</th>
                                <th className="text-left p-3 font-medium">Provider</th>
                                <th className="text-left p-3 font-medium">Bucket</th>
                                <th className="text-left p-3 font-medium">Status</th>
                                <th className="text-right p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {instances.map((instance: S3Instance) => (
                                <tr key={instance.providerId} className="border-t hover:bg-muted/30">
                                    <td className="p-3">
                                        <div className="font-medium">{instance.displayName}</div>
                                        <div className="text-xs text-muted-foreground">{instance.providerId}</div>
                                    </td>
                                    <td className="p-3">{PRESETS[instance.preset].label}</td>
                                    <td className="p-3 font-mono text-xs">{instance.bucket}</td>
                                    <td className="p-3">{getStatusBadge(instance.status)}</td>
                                    <td className="p-3 text-right">
                                        <button
                                            onClick={() => handleEdit(instance)}
                                            className="text-primary hover:underline mr-3"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(instance.providerId)}
                                            className="text-red-600 hover:underline"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add button */}
            {!isNew && !editing && (
                <button
                    onClick={handleAddNew}
                    className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                    + Add Storage Instance
                </button>
            )}

            {/* Edit/Add form */}
            {(isNew || editing) && (
                <div className="border rounded-lg p-6 bg-muted/20">
                    <h3 className="text-lg font-medium mb-4">
                        {isNew ? 'Add Storage Instance' : `Edit: ${editing?.displayName}`}
                    </h3>

                    <div className="grid gap-4 max-w-2xl">
                        {/* Preset */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">Provider Preset</label>
                            <select
                                name="preset"
                                value={formData.preset}
                                onChange={(e) => handlePresetChange(e.target.value as S3InstanceFormData['preset'])}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {Object.entries(PRESETS).map(([key, { label }]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Provider ID */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Instance ID <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="providerId"
                                value={formData.providerId}
                                onChange={handleInputChange}
                                disabled={!isNew}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                                placeholder="s3-production"
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique ID (kebab-case, 3-64 chars). Cannot be changed after creation.
                            </p>
                        </div>

                        {/* Display Name */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Display Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="displayName"
                                value={formData.displayName}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="Production S3"
                            />
                        </div>

                        {/* Endpoint (for non-AWS) */}
                        {formData.preset !== 'aws' && (
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                    Endpoint <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="endpoint"
                                    value={formData.endpoint}
                                    onChange={handleInputChange}
                                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder={formData.preset === 'r2' ? 'https://xxx.r2.cloudflarestorage.com' : 'https://minio.example.com'}
                                />
                            </div>
                        )}

                        {/* Region */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">Region</label>
                            <input
                                name="region"
                                value={formData.region}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="us-east-1"
                                disabled={formData.preset === 'r2'}
                            />
                        </div>

                        {/* Bucket */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Bucket <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="bucket"
                                value={formData.bucket}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="my-bucket"
                            />
                        </div>

                        {/* Access Key ID */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Access Key ID <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="accessKeyId"
                                value={formData.accessKeyId}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                                placeholder="AKIAIOSFODNN7EXAMPLE"
                            />
                        </div>

                        {/* Secret Access Key */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Secret Access Key {isNew && <span className="text-red-500">*</span>}
                                {!isNew && editing && <span className="text-muted-foreground ml-2">(leave empty to keep current)</span>}
                            </label>
                            <input
                                name="secretAccessKey"
                                type="password"
                                value={formData.secretAccessKey}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder={isNew ? '' : '••••••••••••••••'}
                            />
                        </div>

                        {/* CDN URL */}
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">CDN URL (optional)</label>
                            <input
                                name="publicUrlBase"
                                value={formData.publicUrlBase}
                                onChange={handleInputChange}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="https://cdn.example.com"
                            />
                            <p className="text-xs text-muted-foreground">
                                Base URL for public file access (if using CDN)
                            </p>
                        </div>

                        {/* Force Path Style */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                name="forcePathStyle"
                                checked={formData.forcePathStyle}
                                onChange={handleInputChange}
                                className="h-4 w-4 rounded border-input"
                            />
                            <label className="text-sm">Force Path Style URLs</label>
                            <span className="text-xs text-muted-foreground">(required for MinIO)</span>
                        </div>

                        {/* Test result */}
                        {testResult && (
                            <div className={`p-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                {testResult.ok ? `Connection successful (${testResult.latencyMs}ms)` : testResult.error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={handleTestConnection}
                                disabled={testMutation.isPending || !formData.bucket || !formData.accessKeyId}
                                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                            >
                                {testMutation.isPending ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                                        Testing...
                                    </>
                                ) : (
                                    'Test Connection'
                                )}
                            </button>

                            {!isNew && (
                                <button
                                    onClick={() => handleDelete(formData.providerId)}
                                    className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
                                >
                                    Delete Instance
                                </button>
                            )}

                            <div className="flex-1" />

                            <button
                                onClick={handleCancel}
                                className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={saveMutation.isPending}
                                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saveMutation.isPending ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {instances.length === 0 && !isNew && (
                <div className="text-center py-12 border rounded-lg bg-muted/10">
                    <div className="text-4xl mb-3">☁️</div>
                    <h3 className="text-lg font-medium mb-1">No storage instances configured</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Add an S3-compatible storage provider to get started.
                    </p>
                    <button
                        onClick={handleAddNew}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                        + Add Storage Instance
                    </button>
                </div>
            )}
        </div>
    );
}

export default SettingsPage;
