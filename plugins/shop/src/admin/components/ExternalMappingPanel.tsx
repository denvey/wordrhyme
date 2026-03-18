import React, { useState } from 'react';
import { useMappings, linkMapping, unlinkMapping, type ExternalMapping } from '../hooks/useExternalMappings';

interface ExternalMappingPanelProps {
    entityType: string;
    entityId: string;
    onRefetch?: () => void;
}

const syncStatusStyles: Record<string, string> = {
    synced: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    unsynced: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export function ExternalMappingPanel({ entityType, entityId, onRefetch }: ExternalMappingPanelProps) {
    const { items, loading, refetch } = useMappings(entityType, entityId);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkForm, setLinkForm] = useState({
        platform: '',
        external_id: '',
        direction: 'supply' as 'supply' | 'sales',
        external_url: '',
    });
    const [submitting, setSubmitting] = useState(false);

    const supplyMappings = items.filter(m => m.direction === 'supply');
    const salesMappings = items.filter(m => m.direction === 'sales');

    const handleLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkForm.platform || !linkForm.external_id) return;
        setSubmitting(true);
        try {
            await linkMapping({
                entity_type: entityType,
                entity_id: entityId,
                platform: linkForm.platform,
                external_id: linkForm.external_id,
                direction: linkForm.direction,
                external_url: linkForm.external_url || undefined,
            });
            setLinkForm({ platform: '', external_id: '', direction: 'supply', external_url: '' });
            setShowLinkForm(false);
            refetch();
            onRefetch?.();
        } catch (err) {
            console.error('Failed to link:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnlink = async (id: string) => {
        if (!confirm('Unlink this mapping?')) return;
        try {
            await unlinkMapping(id);
            refetch();
            onRefetch?.();
        } catch (err) {
            console.error('Failed to unlink:', err);
        }
    };

    const renderMappingList = (mappings: ExternalMapping[], label: string) => (
        <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</h5>
            {mappings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No {label.toLowerCase()} mappings</p>
            ) : (
                <div className="space-y-2">
                    {mappings.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{m.platform}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${syncStatusStyles[m.sync_status] || syncStatusStyles.unsynced}`}>
                                        {m.sync_status}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    ID: {m.external_id}
                                    {m.external_url && (
                                        <a
                                            href={m.external_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 text-primary hover:underline"
                                        >
                                            View
                                        </a>
                                    )}
                                </div>
                                {m.last_synced_at && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        Last synced: {new Date(m.last_synced_at).toLocaleString()}
                                    </div>
                                )}
                            </div>
                            <button
                                className="text-xs px-2 py-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
                                onClick={() => handleUnlink(m.id)}
                            >
                                Unlink
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">External Mappings</h4>
                <button
                    className="inline-flex items-center rounded-md bg-primary text-primary-foreground h-8 px-3 text-xs font-medium"
                    onClick={() => setShowLinkForm(!showLinkForm)}
                >
                    + Link External
                </button>
            </div>

            {showLinkForm && (
                <form onSubmit={handleLink} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">Platform *</label>
                            <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={linkForm.platform}
                                onChange={e => setLinkForm({ ...linkForm, platform: e.target.value })}
                            >
                                <option value="">Select platform...</option>
                                <option value="shopify">Shopify</option>
                                <option value="woocommerce">WooCommerce</option>
                                <option value="alibaba_1688">1688</option>
                                <option value="aliexpress">AliExpress</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Direction *</label>
                            <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={linkForm.direction}
                                onChange={e => setLinkForm({ ...linkForm, direction: e.target.value as 'supply' | 'sales' })}
                            >
                                <option value="supply">Supply (Source)</option>
                                <option value="sales">Sales (Destination)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">External ID *</label>
                            <input
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                value={linkForm.external_id}
                                onChange={e => setLinkForm({ ...linkForm, external_id: e.target.value })}
                                placeholder="External product/order ID"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">External URL</label>
                            <input
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                value={linkForm.external_url}
                                onChange={e => setLinkForm({ ...linkForm, external_url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            className="h-8 px-3 rounded-md border text-xs"
                            onClick={() => setShowLinkForm(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                            disabled={submitting}
                        >
                            {submitting ? 'Linking...' : 'Link'}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Loading mappings...</div>
            ) : (
                <div className="space-y-6">
                    {renderMappingList(supplyMappings, 'Supply Sources')}
                    {renderMappingList(salesMappings, 'Sales Channels')}
                </div>
            )}
        </div>
    );
}

export default ExternalMappingPanel;
