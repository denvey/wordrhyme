import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface ProductImage {
    id: string;
    product_id: string;
    url: string;
    alt_text?: string;
    sort_order: number;
    is_main: boolean;
    created_at: string;
}

export function useImages(productId: string | null) {
    const [items, setItems] = useState<ProductImage[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        try {
            const params = { product_id: productId };
            const url = `${PLUGIN_API}.productImages.list?input=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setItems(data.result.data.items);
            }
        } catch (err) {
            console.error('Failed to fetch images:', err);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, loading, refetch: fetchData };
}

export async function addImage(data: { product_id: string; url: string; alt_text?: string; is_main?: boolean }) {
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

export async function reorderImages(productId: string, imageIds: string[]) {
    const res = await fetch(`${PLUGIN_API}.productImages.reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, image_ids: imageIds }),
    });
    return res.json();
}

export async function setMainImage(productId: string, imageId: string) {
    const res = await fetch(`${PLUGIN_API}.productImages.setMain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, image_id: imageId }),
    });
    return res.json();
}
