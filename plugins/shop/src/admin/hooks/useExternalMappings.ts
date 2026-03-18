import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface ExternalMapping {
    id: string;
    entity_type: string;
    entity_id: string;
    platform: string;
    external_id: string;
    external_url?: string;
    direction: 'supply' | 'sales';
    sync_status: string;
    last_synced_at?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}

export function useMappings(entityType: string, entityId: string | null) {
    const [items, setItems] = useState<ExternalMapping[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!entityId) return;
        setLoading(true);
        try {
            const params = { entity_type: entityType, entity_id: entityId };
            const url = `${PLUGIN_API}.externalMappings.list?input=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setItems(data.result.data.items);
            }
        } catch (err) {
            console.error('Failed to fetch mappings:', err);
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, loading, refetch: fetchData };
}

export async function linkMapping(data: {
    entity_type: string;
    entity_id: string;
    platform: string;
    external_id: string;
    direction: 'supply' | 'sales';
    external_url?: string;
}) {
    const res = await fetch(`${PLUGIN_API}.externalMappings.link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function unlinkMapping(id: string) {
    const res = await fetch(`${PLUGIN_API}.externalMappings.unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function checkProcurable(orderId: string) {
    const res = await fetch(`${PLUGIN_API}.externalMappings.checkProcurable?input=${encodeURIComponent(JSON.stringify({ order_id: orderId }))}`)
    return res.json();
}
