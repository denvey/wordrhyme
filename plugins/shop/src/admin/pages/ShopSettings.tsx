import React, { useState } from 'react';
import { useShopApi } from '../trpc';

interface ShopConfig {
    default_currency: string;
    default_product_status: string;
    auto_generate_sku: boolean;
    low_stock_threshold: number;
    order_number_prefix: string;
    enable_stock_tracking: boolean;
}

const defaultConfig: ShopConfig = {
    default_currency: 'USD',
    default_product_status: 'draft',
    auto_generate_sku: true,
    low_stock_threshold: 5,
    order_number_prefix: 'ORD-',
    enable_stock_tracking: true,
};

export function ShopSettings() {
    const shopApi = useShopApi();

    // Fetch settings via tRPC
    const { data: settingsData, isLoading } = (shopApi as any).settings.get.useQuery({});

    const updateMutation = (shopApi as any).settings.update.useMutation();

    const [config, setConfig] = useState<ShopConfig>(defaultConfig);
    const [initialized, setInitialized] = useState(false);
    const [saved, setSaved] = useState(false);

    // Sync fetched data to local state
    React.useEffect(() => {
        if (settingsData && !initialized) {
            setConfig({ ...defaultConfig, ...settingsData });
            setInitialized(true);
        }
    }, [settingsData, initialized]);

    const handleSave = async () => {
        setSaved(false);
        try {
            await updateMutation.mutateAsync(config);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    };

    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Loading settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold">Shop Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure your shop plugin preferences.
                </p>
            </div>

            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">General</h4>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium">Default Currency</label>
                        <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={config.default_currency}
                            onChange={e => setConfig({ ...config, default_currency: e.target.value })}
                        >
                            <option value="USD">USD - US Dollar</option>
                            <option value="CNY">CNY - Chinese Yuan</option>
                            <option value="EUR">EUR - Euro</option>
                            <option value="GBP">GBP - British Pound</option>
                            <option value="JPY">JPY - Japanese Yen</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Default Product Status</label>
                        <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={config.default_product_status}
                            onChange={e => setConfig({ ...config, default_product_status: e.target.value })}
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">Inventory</h4>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium">Low Stock Threshold</label>
                        <input
                            type="number"
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={config.low_stock_threshold}
                            onChange={e => setConfig({ ...config, low_stock_threshold: Number.parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer h-9">
                            <input
                                type="checkbox"
                                checked={config.enable_stock_tracking}
                                onChange={e => setConfig({ ...config, enable_stock_tracking: e.target.checked })}
                                className="rounded border-input"
                            />
                            <span className="text-sm">Enable Stock Tracking</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">Orders</h4>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium">Order Number Prefix</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={config.order_number_prefix}
                            onChange={e => setConfig({ ...config, order_number_prefix: e.target.value })}
                            placeholder="e.g. ORD-"
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer h-9">
                            <input
                                type="checkbox"
                                checked={config.auto_generate_sku}
                                onChange={e => setConfig({ ...config, auto_generate_sku: e.target.checked })}
                                className="rounded border-input"
                            />
                            <span className="text-sm">Auto-generate SKU</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">Platform Integrations</h4>
                <p className="text-sm text-muted-foreground">
                    External platform plugins provide additional sync capabilities.
                </p>
                <div className="grid gap-3">
                    {[
                        { name: 'Shopify', id: 'com.wordrhyme.shopify', status: 'not_installed' },
                        { name: 'WooCommerce', id: 'com.wordrhyme.woocommerce', status: 'not_installed' },
                        { name: '1688', id: 'com.wordrhyme.alibaba', status: 'not_installed' },
                        { name: 'AliExpress', id: 'com.wordrhyme.aliexpress', status: 'not_installed' },
                    ].map(platform => (
                        <div key={platform.id} className="flex items-center justify-between p-3 rounded bg-muted/50">
                            <div>
                                <span className="text-sm font-medium">{platform.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">{platform.id}</span>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                Not Installed
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 justify-end">
                {saved && (
                    <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully!</span>
                )}
                <button
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                >
                    {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}

export default ShopSettings;
