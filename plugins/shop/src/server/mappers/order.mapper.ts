export interface DbOrder {
    id: string;
    order_id?: string;
    order_number?: string;
    status: string;
    currency: string;
    subtotal_price_cents?: number;
    total_price_cents?: number;
    total_tax_cents?: number;
    total_discount_cents?: number;
    shipping_price_cents?: number;
    payment_method?: string;
    note?: string;
    email?: string;
    phone?: string;
    shipping?: unknown;
    line_items?: unknown;
    version: number;
    source?: string;
    source_status?: string;
    tracking_number?: string;
    carrier?: string;
    tracking_url?: string;
    fulfilled_at?: string;
    organization_id: string;
    acl_tags: string[];
    deny_tags: string[];
    created_by?: string;
    created_at: string;
    updated_at: string;
    paid_at?: string;
    canceled_at?: string;
    refunded_at?: string;
}

export interface ApiOrder {
    id: string;
    orderId?: string | undefined;
    orderNumber?: string | undefined;
    status: string;
    currency: string;
    subtotalPrice?: string | undefined;
    totalPrice?: string | undefined;
    totalTax?: string | undefined;
    totalDiscount?: string | undefined;
    shippingPrice?: string | undefined;
    paymentMethod?: string | undefined;
    note?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    shipping?: unknown;
    lineItems?: unknown[];
    version: number;
    source?: string | undefined;
    sourceStatus?: string | undefined;
    trackingNumber?: string | undefined;
    carrier?: string | undefined;
    trackingUrl?: string | undefined;
    fulfilledAt?: string | undefined;
    organizationId: string;
    createdBy?: string | undefined;
    createdAt: string;
    updatedAt: string;
    paidAt?: string | undefined;
    canceledAt?: string | undefined;
    refundedAt?: string | undefined;
}

function centsToPrice(cents: number | undefined | null): string | undefined {
    if (cents == null) return undefined;
    return (cents / 100).toFixed(2);
}

function priceToCents(price: string | undefined | null): number | undefined {
    if (price == null) return undefined;
    const num = Number.parseFloat(price);
    if (isNaN(num)) return undefined;
    return Math.round(num * 100);
}

export function dbOrderToApi(row: DbOrder, _locale: string): ApiOrder {
    return {
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        status: row.status,
        currency: row.currency,
        subtotalPrice: centsToPrice(row.subtotal_price_cents),
        totalPrice: centsToPrice(row.total_price_cents),
        totalTax: centsToPrice(row.total_tax_cents),
        totalDiscount: centsToPrice(row.total_discount_cents),
        shippingPrice: centsToPrice(row.shipping_price_cents),
        paymentMethod: row.payment_method,
        note: row.note,
        email: row.email,
        phone: row.phone,
        shipping: row.shipping,
        lineItems: Array.isArray(row.line_items) ? row.line_items : [],
        version: row.version,
        source: row.source,
        sourceStatus: row.source_status,
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        trackingUrl: row.tracking_url,
        fulfilledAt: row.fulfilled_at,
        organizationId: row.organization_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
        canceledAt: row.canceled_at,
        refundedAt: row.refunded_at,
    };
}

export function apiInputToDbOrder(input: Record<string, unknown>): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    if (input['orderId'] !== undefined) record['order_id'] = input['orderId'];
    if (input['orderNumber'] !== undefined) record['order_number'] = input['orderNumber'];
    if (input['status'] !== undefined) record['status'] = input['status'];
    if (input['currency'] !== undefined) record['currency'] = input['currency'];
    if (input['subtotalPrice'] !== undefined) record['subtotal_price_cents'] = priceToCents(input['subtotalPrice'] as string);
    if (input['totalPrice'] !== undefined) record['total_price_cents'] = priceToCents(input['totalPrice'] as string);
    if (input['totalTax'] !== undefined) record['total_tax_cents'] = priceToCents(input['totalTax'] as string);
    if (input['totalDiscount'] !== undefined) record['total_discount_cents'] = priceToCents(input['totalDiscount'] as string);
    if (input['shippingPrice'] !== undefined) record['shipping_price_cents'] = priceToCents(input['shippingPrice'] as string);
    if (input['paymentMethod'] !== undefined) record['payment_method'] = input['paymentMethod'];
    if (input['note'] !== undefined) record['note'] = input['note'];
    if (input['email'] !== undefined) record['email'] = input['email'];
    if (input['phone'] !== undefined) record['phone'] = input['phone'];
    if (input['shipping'] !== undefined) record['shipping'] = JSON.stringify(input['shipping']);
    if (input['lineItems'] !== undefined) record['line_items'] = JSON.stringify(input['lineItems']);
    if (input['source'] !== undefined) record['source'] = input['source'];
    if (input['sourceStatus'] !== undefined) record['source_status'] = input['sourceStatus'];

    return record;
}
