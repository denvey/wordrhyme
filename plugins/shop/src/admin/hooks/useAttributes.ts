import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface AttributeValue {
    id: string;
    value: string;
    label?: string;
    sort_order: number;
}

export interface Attribute {
    id: string;
    name: string;
    slug: string;
    type: string;
    is_variation: boolean;
    is_visible: boolean;
    is_filterable: boolean;
    sort_order: number;
    values?: AttributeValue[];
    created_at: string;
}

export function useAttributes() {
    const [items, setItems] = useState<Attribute[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.attributes.list?input=${encodeURIComponent(JSON.stringify({ limit: 100, offset: 0 }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setItems(data.result.data.items);
            }
        } catch (err) {
            console.error('Failed to fetch attributes:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, loading, refetch: fetchData };
}

export function useAttribute(id: string | null) {
    const [attribute, setAttribute] = useState<Attribute | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.attributes.get?input=${encodeURIComponent(JSON.stringify({ id }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data) {
                setAttribute(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch attribute:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { attribute, loading, refetch: fetchData };
}

export async function createAttribute(data: Partial<Attribute>) {
    const res = await fetch(`${PLUGIN_API}.attributes.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateAttribute(id: string, data: Partial<Attribute>) {
    const res = await fetch(`${PLUGIN_API}.attributes.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
    });
    return res.json();
}

export async function deleteAttribute(id: string) {
    const res = await fetch(`${PLUGIN_API}.attributes.delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}
