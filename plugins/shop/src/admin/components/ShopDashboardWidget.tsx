import React from 'react';
import { Package, ClipboardList, DollarSign } from 'lucide-react';
import { useShopApi } from '../trpc';

export function ShopDashboardWidget() {
    const shopApi = useShopApi();
    const { data: summary, isLoading, error } = (shopApi as any).analytics.getSummary.useQuery();

    if (error) {
        return (
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 col-span-1">
                <h3 className="text-sm font-medium text-red-500">Shop Analytics Error</h3>
                <p className="text-sm text-muted-foreground mt-2">{error.message || 'Failed to load shop summary'}</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-card text-card-foreground p-6 col-span-1 flex flex-col justify-between">
            <div className="flex flex-row items-center justify-between pb-2">
                <h3 className="text-sm font-medium">Shop Overview</h3>
                <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" /> Products
                    </span>
                    <span className="text-2xl font-bold">
                        {isLoading ? <span className="animate-pulse bg-muted rounded h-8 w-12 block"></span> : summary?.totalProducts ?? 0}
                    </span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> Orders
                    </span>
                    <span className="text-2xl font-bold">
                        {isLoading ? <span className="animate-pulse bg-muted rounded h-8 w-12 block"></span> : summary?.totalOrders ?? 0}
                    </span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Revenue
                    </span>
                    <span className="text-2xl font-bold">
                        {isLoading ? (
                            <span className="animate-pulse bg-muted rounded h-8 w-16 block"></span>
                        ) : (
                            `$${((summary?.totalRevenueCents ?? 0) / 100).toFixed(2)}`
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default ShopDashboardWidget;
