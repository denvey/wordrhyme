import React, { useState } from 'react';
import { useOrder, shipOrder, cancelOrder, refundOrder } from '../hooks/useOrders';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { ExternalMappingPanel } from '../components/ExternalMappingPanel';
import { PluginSlot } from '@wordrhyme/plugin/react';

interface OrderDetailPageProps {
    orderId: string;
    onBack: () => void;
}

export function OrderDetailPage({ orderId, onBack }: OrderDetailPageProps) {
    const { order, loading, refetch } = useOrder(orderId);
    const [actionLoading, setActionLoading] = useState('');

    const handleShip = async () => {
        const trackingNumber = prompt('Enter tracking number (optional):');
        setActionLoading('ship');
        try {
            await shipOrder(orderId, trackingNumber || undefined);
            refetch();
        } catch (err) {
            console.error('Failed to ship:', err);
        } finally {
            setActionLoading('');
        }
    };

    const handleCancel = async () => {
        if (!confirm('Cancel this order?')) return;
        const reason = prompt('Cancellation reason (optional):');
        setActionLoading('cancel');
        try {
            await cancelOrder(orderId, reason || undefined);
            refetch();
        } catch (err) {
            console.error('Failed to cancel:', err);
        } finally {
            setActionLoading('');
        }
    };

    const handleRefund = async () => {
        if (!confirm('Process refund for this order?')) return;
        const reason = prompt('Refund reason (optional):');
        setActionLoading('refund');
        try {
            await refundOrder(orderId, undefined, reason || undefined);
            refetch();
        } catch (err) {
            console.error('Failed to refund:', err);
        } finally {
            setActionLoading('');
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">Loading order...</div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">Order not found</div>
                <button className="mt-4 text-sm text-primary hover:underline" onClick={onBack}>
                    Back to Orders
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    className="h-9 px-3 rounded-md border text-sm hover:bg-muted"
                    onClick={onBack}
                >
                    Back
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
                    <p className="text-muted-foreground text-sm">
                        Created: {new Date(order.created_at).toLocaleString()}
                    </p>
                </div>
                <OrderStatusBadge status={order.status} />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
                {order.status === 'paid' && (
                    <button
                        className="h-9 px-4 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                        onClick={handleShip}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'ship' ? 'Shipping...' : 'Ship Order'}
                    </button>
                )}
                {['pending', 'processing'].includes(order.status) && (
                    <button
                        className="h-9 px-4 rounded-md bg-yellow-600 text-white text-sm font-medium disabled:opacity-50"
                        onClick={handleCancel}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'cancel' ? 'Canceling...' : 'Cancel Order'}
                    </button>
                )}
                {['paid', 'fulfilled', 'completed'].includes(order.status) && (
                    <button
                        className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                        onClick={handleRefund}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'refund' ? 'Processing...' : 'Refund'}
                    </button>
                )}
                {/* shop.order.detail.actions — 插件注入操作按钮 */}
                <PluginSlot
                    name="shop.order.detail.actions"
                    layout="inline"
                    context={{ orderId, order }}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Order Info Card */}
                <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="font-semibold">Order Information</h3>
                    <div className="grid gap-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Order Number</span>
                            <span className="font-mono">{order.order_number}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <OrderStatusBadge status={order.status} />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Source</span>
                            <span>{order.source || '-'}</span>
                        </div>
                        {order.subtotal_amount && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{order.currency} {order.subtotal_amount}</span>
                            </div>
                        )}
                        {order.shipping_amount && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Shipping</span>
                                <span>{order.currency} {order.shipping_amount}</span>
                            </div>
                        )}
                        {order.tax_amount && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Tax</span>
                                <span>{order.currency} {order.tax_amount}</span>
                            </div>
                        )}
                        {order.discount_amount && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Discount</span>
                                <span className="text-green-600">-{order.currency} {order.discount_amount}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-t pt-2 font-medium">
                            <span>Total</span>
                            <span>{order.currency} {order.total_amount}</span>
                        </div>
                    </div>
                </div>

                {/* Customer Info Card */}
                <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="font-semibold">Customer</h3>
                    <div className="grid gap-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Name</span>
                            <span>{order.customer_name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span>{order.customer_email || '-'}</span>
                        </div>
                    </div>

                    {order.shipping_address && (
                        <div>
                            <h4 className="text-sm font-medium mb-2">Shipping Address</h4>
                            <div className="text-sm text-muted-foreground">
                                {Object.entries(order.shipping_address).map(([key, value]) => (
                                    <div key={key}>{value}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {order.notes && (
                        <div>
                            <h4 className="text-sm font-medium mb-1">Notes</h4>
                            <p className="text-sm text-muted-foreground">{order.notes}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Line Items */}
            <div className="rounded-lg border bg-card">
                <div className="p-4 border-b">
                    <h3 className="font-semibold">Line Items</h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Item</th>
                            <th className="text-left p-3 font-medium">SKU</th>
                            <th className="text-right p-3 font-medium">Qty</th>
                            <th className="text-right p-3 font-medium">Unit Price</th>
                            <th className="text-right p-3 font-medium">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!order.line_items || order.line_items.length === 0 ? (
                            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No line items</td></tr>
                        ) : (
                            order.line_items.map(item => (
                                <tr key={item.id} className="border-b">
                                    <td className="p-3">{item.name}</td>
                                    <td className="p-3 font-mono text-xs text-muted-foreground">{item.sku || '-'}</td>
                                    <td className="p-3 text-right">{item.quantity}</td>
                                    <td className="p-3 text-right">{item.unit_price}</td>
                                    <td className="p-3 text-right font-medium">{item.total_price}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Timeline */}
            <div className="rounded-lg border bg-card p-6 space-y-3">
                <h3 className="font-semibold">Timeline</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-muted-foreground">Created</span>
                        <span>{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                    {order.shipped_at && (
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-muted-foreground">Shipped</span>
                            <span>{new Date(order.shipped_at).toLocaleString()}</span>
                        </div>
                    )}
                    {order.completed_at && (
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-gray-500" />
                            <span className="text-muted-foreground">Completed</span>
                            <span>{new Date(order.completed_at).toLocaleString()}</span>
                        </div>
                    )}
                    {order.canceled_at && (
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-muted-foreground">Canceled</span>
                            <span>{new Date(order.canceled_at).toLocaleString()}</span>
                        </div>
                    )}
                    {order.refunded_at && (
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <span className="text-muted-foreground">Refunded</span>
                            <span>{new Date(order.refunded_at).toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* External Mappings */}
            <ExternalMappingPanel
                entityType="order"
                entityId={orderId}
            />

            {/* shop.order.detail.block — 插件注入内容块 */}
            <PluginSlot
                name="shop.order.detail.block"
                context={{ orderId, order }}
            />

            {/* shop.order.detail.sidebar — 可用于右侧面板 */}
            <PluginSlot
                name="shop.order.detail.sidebar"
                context={{ orderId, order }}
            />
        </div>
    );
}

export default OrderDetailPage;
