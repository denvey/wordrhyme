import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { shopOrders, shopProducts } from '../../shared/schema';
import { count, sum, lt, desc } from 'drizzle-orm';

export const analyticsRouter = pluginRouter({
    getSummary: pluginProcedure.query(async ({ ctx }) => {
        const db = ctx.db!;
        
        const [ordersCount] = await db.select({ value: count() }).from(shopOrders);
        const [productsCount] = await db.select({ value: count() }).from(shopProducts);
        
        const [revenue] = await db.select({ value: sum(shopOrders.totalPriceCents) })
            .from(shopOrders)
            .where(lt(shopOrders.status, 'canceled'));
            
        return {
            totalOrders: ordersCount?.value ?? 0,
            totalProducts: productsCount?.value ?? 0,
            totalRevenueCents: Number(revenue?.value ?? 0),
        };
    }),
});
