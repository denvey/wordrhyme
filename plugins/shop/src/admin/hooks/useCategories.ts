import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string;
    parent_id?: string | null;
    sort_order: number;
    is_active: boolean;
    image_url?: string;
    children?: Category[];
    created_at: string;
}

export function useCategories() {
    const [items, setItems] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.categories.list?input=${encodeURIComponent(JSON.stringify({ limit: 200, offset: 0 }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setItems(data.result.data.items);
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, loading, refetch: fetchData };
}

export async function createCategory(data: Partial<Category>) {
    const res = await fetch(`${PLUGIN_API}.categories.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateCategory(id: string, data: Partial<Category>) {
    const res = await fetch(`${PLUGIN_API}.categories.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
    });
    return res.json();
}

export async function deleteCategory(id: string) {
    const res = await fetch(`${PLUGIN_API}.categories.delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function moveCategory(id: string, parentId: string | null, sortOrder: number) {
    const res = await fetch(`${PLUGIN_API}.categories.move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, parent_id: parentId, sort_order: sortOrder }),
    });
    return res.json();
}
