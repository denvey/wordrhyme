import { useState, useEffect, useCallback } from 'react';
import { PLUGIN_API } from '../api';

export interface OrderLineItem {
    id: string;
    product_id?: string;
    variant_id?: string;
    sku?: string;
    name: string;
    quantity: number;
    unit_price: string;
    total_price: string;
    currency?: string;
}

export interface Order {
    id: string;
    order_number: string;
    status: string;
    total_amount: string;
    subtotal_amount?: string;
    shipping_amount?: string;
    tax_amount?: string;
    discount_amount?: string;
    currency: string;
    customer_name?: string;
    customer_email?: string;
    shipping_address?: Record<string, string>;
    billing_address?: Record<string, string>;
    source?: string;
    notes?: string;
    line_items?: OrderLineItem[];
    shipped_at?: string;
    completed_at?: string;
    canceled_at?: string;
    refunded_at?: string;
    created_at: string;
    updated_at: string;
}

export function useOrders(statusFilter?: string) {
    const [items, setItems] = useState<Order[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, unknown> = { limit: 20, offset: 0 };
            if (statusFilter) params.status = statusFilter;
            const url = `${PLUGIN_API}.orders.list?input=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setItems(data.result.data.items);
                setTotal(data.result.data.total ?? data.result.data.items.length);
            }
        } catch (err) {
            console.error('Failed to fetch orders:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { items, total, loading, refetch: fetchData };
}

export function useOrder(id: string | null) {
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const url = `${PLUGIN_API}.orders.get?input=${encodeURIComponent(JSON.stringify({ id }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data) {
                setOrder(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch order:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    return { order, loading, refetch: fetchData };
}

export async function createOrder(data: Partial<Order>) {
    const res = await fetch(`${PLUGIN_API}.orders.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function shipOrder(id: string, trackingNumber?: string) {
    const res = await fetch(`${PLUGIN_API}.orders.ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tracking_number: trackingNumber }),
    });
    return res.json();
}

export async function cancelOrder(id: string, reason?: string) {
    const res = await fetch(`${PLUGIN_API}.orders.cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reason }),
    });
    return res.json();
}

export async function refundOrder(id: string, amount?: string, reason?: string) {
    const res = await fetch(`${PLUGIN_API}.orders.refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount, reason }),
    });
    return res.json();
}
