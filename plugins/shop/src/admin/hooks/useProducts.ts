import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';
import type { CustomParameter } from '../components/variant-editor';

import type { ApiProduct } from '../../shared';

export interface Product extends Omit<ApiProduct, 'customParameters'> {
    customParameters?: CustomParameter[];
}

export function useProducts(statusFilter?: string) {
    const [items, setItems] = useState<Product[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, unknown> = { limit: 20, offset: 0 };
            if (statusFilter) params['status'] = statusFilter;
            const url = `${PLUGIN_API}.products.list?input=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url);
            const data: any = await res.json();
            if (data.result?.data) {
                setItems(data.result.data.items);
                setTotal(data.result.data.total ?? data.result.data.items.length);
            }
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, total, loading, refetch: fetchData };
}

export function useProduct(id: string | null) {
    const [product, setProduct] = useState<Product | null>(null);
    const [images, setImages] = useState<string[]>([]);
    const [matrix, setMatrix] = useState<{ specs: any[], variants: any[] } | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id || id === 'new') return;
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.products.get?input=${encodeURIComponent(JSON.stringify(id))}`;
            const res = await fetch(url);
            const data: any = await res.json();
            if (data.result?.data) {
                // Now data.result.data contains product properties PLUS images and matrix
                setProduct(data.result.data);
                setImages(data.result.data.images || []);
                setMatrix(data.result.data.matrix || null);
            }
        } catch (err) {
            console.error('Failed to fetch product:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { product, images, matrix, loading, refetch: fetchData };
}

export async function createProduct(data: Partial<Product>) {
    const res = await fetch(`${PLUGIN_API}.products.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateProduct(id: string, data: Partial<Product>) {
    const res = await fetch(`${PLUGIN_API}.products.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data }),
    });
    return res.json();
}

export async function deleteProduct(id: string) {
    const res = await fetch(`${PLUGIN_API}.products.delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function publishProduct(id: string) {
    const res = await fetch(`${PLUGIN_API}.products.publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}
