import React, { useState } from 'react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { PluginSlot } from '@wordrhyme/plugin/react';
import { useShopApi } from '../trpc';
import { orderSchema } from '../schemas';

export function OrdersPage() {
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    // Lazy-load OrderDetailPage
    const [DetailPage, setDetailPage] = useState<React.ComponentType<{ orderId: string; onBack: () => void }> | null>(null);

    const shopApi = useShopApi();
    const resource = useAutoCrudResource({
        router: shopApi.orders as any,
        schema: orderSchema,
    });

    const openDetail = async (id: string) => {
        if (!DetailPage) {
            const mod = await import('./OrderDetailPage');
            setDetailPage(() => mod.OrderDetailPage);
        }
        setSelectedOrderId(id);
    };

    if (selectedOrderId && DetailPage) {
        return <DetailPage orderId={selectedOrderId} onBack={() => { setSelectedOrderId(null); }} />;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Orders</h1>
                    <p className="text-muted-foreground text-sm">Manage customer orders and fulfillment</p>
                </div>
                <PluginSlot name="shop.order.list.toolbar" layout="inline" />
            </div>

            <AutoCrudTable
                title="Orders"
                schema={orderSchema}
                resource={resource}
                fields={{
                    id: { hidden: true },
                    organizationId: { hidden: true },
                    aclTags: { hidden: true },
                    denyTags: { hidden: true },
                    createdBy: { hidden: true },
                    updatedAt: { hidden: true },
                    orderId: { hidden: true },
                    shipping: { hidden: true },
                    lineItems: { hidden: true },
                    version: { hidden: true },
                    sourceStatus: { hidden: true },
                    trackingNumber: { hidden: true },
                    carrier: { hidden: true },
                    trackingUrl: { hidden: true },
                    fulfilledAt: { hidden: true },
                    paidAt: { hidden: true },
                    canceledAt: { hidden: true },
                    refundedAt: { hidden: true },
                    subtotalPriceCents: { hidden: true },
                    totalTaxCents: { hidden: true },
                    totalDiscountCents: { hidden: true },
                    shippingPriceCents: { hidden: true },
                    paymentMethod: { hidden: true },
                    note: { hidden: true },
                    phone: { hidden: true },
                    orderNumber: { label: 'Order #' },
                    status: { label: 'Status' },
                    totalPriceCents: { label: 'Total (cents)' },
                    currency: { label: 'Currency' },
                    email: { label: 'Customer Email' },
                    source: { label: 'Source' },
                    createdAt: { label: 'Date' },
                }}
                table={{
                    filterModes: ['simple'],
                    defaultSort: [{ id: 'createdAt', desc: true }],
                }}
                {...{
                    actions: [
                        { type: 'custom', label: 'View Detail', onClick: (row: any) => openDetail(row.id) },
                    ],
                } as any}
            />
        </div>
    );
}

export default OrdersPage;
