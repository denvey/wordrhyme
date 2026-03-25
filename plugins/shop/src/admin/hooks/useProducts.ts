import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface Product {
    id: string;
    spu_id: string;
    name: string;
    slug: string;
    description?: string;
    short_description?: string;
    status: string;
    product_type: string;
    price?: string;
    compare_at_price?: string;
    cost_price?: string;
    currency?: string;
    stock_quantity?: number;
    stock_status: string;
    low_stock_threshold?: number;
    weight?: string;
    weight_unit?: string;
    category_id?: string;
    brand?: string;
    tags?: string[];
    seo_title?: string;
    seo_description?: string;
    source?: string;
    created_at: string;
    updated_at: string;
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
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.products.get?input=${encodeURIComponent(JSON.stringify(id))}`;
            const res = await fetch(url);
            const data: any = await res.json();
            if (data.result?.data) {
                setProduct(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch product:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { product, loading, refetch: fetchData };
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
        body: JSON.stringify({ id, ...data }),
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
