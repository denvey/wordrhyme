/**
 * Shop Plugin - Orders Router
 *
 * Order management with status machine transitions.
 * Standard CRUD via createCrudRouter, custom status transitions via Drizzle API.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
    shopOrders,
    shopOrderItems,
    createOrderSchema,
    assertValidTransition,
    buildCancelNote,
    buildRefundNote,
} from '../../shared';

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopOrders,
    procedure: pluginProcedure,
    schema: createOrderSchema,
    omitFields: ['organizationId', 'aclTags', 'denyTags', 'createdBy', 'createdAt', 'updatedAt', 'version'],
});

// ============================================================
// Custom Procedures
// ============================================================

export const ordersRouter = pluginRouter({
    ...crud.procedures,

    // Ship order (paid → fulfilled)
    ship: pluginProcedure
        .input(z.object({
            id: z.string(),
            trackingNumber: z.string().optional(),
            carrier: z.string().optional(),
            trackingUrl: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, input.id));
            if (!order) throw new Error('Order not found');

            assertValidTransition(order.status, 'fulfilled');

            await db.update(shopOrders)
                .set({
                    status: 'fulfilled',
                    fulfilledAt: new Date(),
                    trackingNumber: input.trackingNumber,
                    carrier: input.carrier,
                    trackingUrl: input.trackingUrl,
                    updatedAt: new Date(),
                })
                .where(eq(shopOrders.id, input.id));

            ctx.hooks?.emit('order.afterShip', {
                orderId: input.id,
                previousStatus: order.status,
                trackingNumber: input.trackingNumber,
            }).catch(() => {});

            ctx.hooks?.emit('order.afterStatusChange', {
                orderId: input.id,
                previousStatus: order.status,
                newStatus: 'fulfilled',
            }).catch(() => {});

            return { id: input.id };
        }),

    // Cancel order
    cancel: pluginProcedure
        .input(z.object({
            id: z.string(),
            reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, input.id));
            if (!order) throw new Error('Order not found');

            assertValidTransition(order.status, 'canceled');
            const note = buildCancelNote(order.note, input.reason);

            await db.update(shopOrders)
                .set({
                    status: 'canceled',
                    canceledAt: new Date(),
                    updatedAt: new Date(),
                    ...(note !== undefined && { note }),
                })
                .where(eq(shopOrders.id, input.id));

            ctx.hooks?.emit('order.afterCancel', {
                orderId: input.id,
                previousStatus: order.status,
                reason: input.reason,
            }).catch(() => {});

            ctx.hooks?.emit('order.afterStatusChange', {
                orderId: input.id,
                previousStatus: order.status,
                newStatus: 'canceled',
            }).catch(() => {});

            return { id: input.id };
        }),

    // Refund order
    refund: pluginProcedure
        .input(z.object({
            id: z.string(),
            amount: z.string().optional(),
            reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, input.id));
            if (!order) throw new Error('Order not found');

            assertValidTransition(order.status, 'refunded');
            const note = buildRefundNote(order.note, input.amount, input.reason);

            await db.update(shopOrders)
                .set({
                    status: 'refunded',
                    refundedAt: new Date(),
                    updatedAt: new Date(),
                    ...(note !== undefined && { note }),
                })
                .where(eq(shopOrders.id, input.id));

            ctx.hooks?.emit('order.afterRefund', {
                orderId: input.id,
                previousStatus: order.status,
                amount: input.amount,
                reason: input.reason,
            }).catch(() => {});

            ctx.hooks?.emit('order.afterStatusChange', {
                orderId: input.id,
                previousStatus: order.status,
                newStatus: 'refunded',
            }).catch(() => {});

            return { id: input.id };
        }),
});
