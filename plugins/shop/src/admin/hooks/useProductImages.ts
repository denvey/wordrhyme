import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface ProductImage {
    id: string;
    spuId: string;
    src: string;
    alt?: Record<string, string>;
    sortOrder: number;
    isMain: boolean;
    createdAt: string;
}

export function useImages(spuId: string | null) {
    const [items, setItems] = useState<ProductImage[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!spuId) return;
        setLoading(true);
        try {
            const params = { spuId: spuId };
            const url = `${PLUGIN_API}.productImages.list?input=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (Array.isArray(data.result?.data)) {
                setItems(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch images:', err);
        } finally {
            setLoading(false);
        }
    }, [spuId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, loading, refetch: fetchData };
}

export async function addImage(data: { spuId: string; src: string; alt?: Record<string, string>; isMain?: boolean }) {
    const res = await fetch(`${PLUGIN_API}.productImages.add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function deleteImage(id: string) {
    const res = await fetch(`${PLUGIN_API}.productImages.delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function reorderImages(spuId: string, imageIds: string[]) {
    const res = await fetch(`${PLUGIN_API}.productImages.reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spuId: spuId, imageIds }),
    });
    return res.json();
}

export async function setMainImage(spuId: string, imageId: string) {
    const res = await fetch(`${PLUGIN_API}.productImages.setMain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spuId: spuId, imageId }),
    });
    return res.json();
}
