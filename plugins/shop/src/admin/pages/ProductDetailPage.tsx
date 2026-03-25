import React, { useState, useEffect, useCallback } from 'react';
import { useProduct, updateProduct } from '../hooks/useProducts';
import { useAttributes, type Attribute } from '../hooks/useAttributes';
import { useImages } from '../hooks/useProductImages';
import { AttributeSelector, type SelectedAttribute } from '../components/AttributeSelector';
import { ImageGallery } from '../components/ImageGallery';
import { VariantMatrix } from '../components/VariantMatrix';
import { ExternalMappingPanel } from '../components/ExternalMappingPanel';
import { PluginSlot } from '@wordrhyme/plugin/react';
import { PLUGIN_API } from '../api';

interface Variant {
    id: string;
    spu_id: string;
    sku: string;
    name: string;
    price?: string;
    compare_at_price?: string;
    cost_price?: string;
    stock_quantity: number;
    stock_status: string;
    weight?: string;
    attributes: Record<string, string>;
    is_active: boolean;
    created_at: string;
}

interface ProductDetailPageProps {
    spuId: string;
    onBack: () => void;
}

type TabKey = 'general' | 'attributes' | 'variants' | 'images' | 'mappings';

export function ProductDetailPage({ spuId, onBack }: ProductDetailPageProps) {
    const { product, loading, refetch } = useProduct(spuId);
    const { items: allAttributes, loading: attrsLoading } = useAttributes();
    const { items: images, refetch: refetchImages } = useImages(spuId);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [activeTab, setActiveTab] = useState<TabKey>('general');
    const [saving, setSaving] = useState(false);
    const [selectedAttrs, setSelectedAttrs] = useState<SelectedAttribute[]>([]);

    // General form
    const [form, setForm] = useState({
        name: '',
        spu_id: '',
        slug: '',
        description: '',
        short_description: '',
        price: '',
        compare_at_price: '',
        cost_price: '',
        currency: '',
        stock_quantity: 0,
        low_stock_threshold: 5,
        weight: '',
        weight_unit: 'kg',
        brand: '',
        seo_title: '',
        seo_description: '',
    });

    useEffect(() => {
        if (product) {
            setForm({
                name: product.name || '',
                spu_id: product.spu_id || '',
                slug: product.slug || '',
                description: product.description || '',
                short_description: product.short_description || '',
                price: product.price || '',
                compare_at_price: product.compare_at_price || '',
                cost_price: product.cost_price || '',
                currency: product.currency || '',
                stock_quantity: product.stock_quantity ?? 0,
                low_stock_threshold: product.low_stock_threshold ?? 5,
                weight: product.weight || '',
                weight_unit: product.weight_unit || 'kg',
                brand: product.brand || '',
                seo_title: product.seo_title || '',
                seo_description: product.seo_description || '',
            });
        }
    }, [product]);

    // Fetch variants
    const fetchVariants = useCallback(async () => {
        try {
            const url = `${PLUGIN_API}.variants.list?input=${encodeURIComponent(JSON.stringify({ spu_id: spuId }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setVariants(data.result.data.items);
            }
        } catch (err) {
            console.error('Failed to fetch variants:', err);
        }
    }, [spuId]);

    // Fetch product attributes
    const fetchProductAttributes = useCallback(async () => {
        try {
            const url = `${PLUGIN_API}.productAttributes.list?input=${encodeURIComponent(JSON.stringify({ spu_id: spuId }))}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.result?.data?.items) {
                setSelectedAttrs(data.result.data.items.map((item: { attribute_id: string; is_variation: boolean; values: string[] }) => ({
                    attribute_id: item.attribute_id,
                    is_variation: item.is_variation,
                    values: item.values || [],
                })));
            }
        } catch (err) {
            console.error('Failed to fetch product attributes:', err);
        }
    }, [spuId]);

    useEffect(() => {
        fetchVariants();
        fetchProductAttributes();
    }, [fetchVariants, fetchProductAttributes]);

    const handleSaveGeneral = async () => {
        setSaving(true);
        try {
            await updateProduct(spuId, {
                name: form.name,
                slug: form.slug,
                description: form.description || undefined,
                short_description: form.short_description || undefined,
                price: form.price || undefined,
                compare_at_price: form.compare_at_price || undefined,
                cost_price: form.cost_price || undefined,
                currency: form.currency || undefined,
                stock_quantity: form.stock_quantity,
                low_stock_threshold: form.low_stock_threshold,
                weight: form.weight || undefined,
                weight_unit: form.weight_unit || undefined,
                brand: form.brand || undefined,
                seo_title: form.seo_title || undefined,
                seo_description: form.seo_description || undefined,
            });
            refetch();
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAttributes = async () => {
        setSaving(true);
        try {
            await fetch(`${PLUGIN_API}.productAttributes.sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spu_id: spuId, attributes: selectedAttrs }),
            });
            fetchProductAttributes();
        } catch (err) {
            console.error('Failed to save attributes:', err);
        } finally {
            setSaving(false);
        }
    };

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'general', label: 'General' },
        { key: 'attributes', label: 'Attributes' },
        { key: 'variants', label: `Variants (${variants.length})` },
        { key: 'images', label: `Images (${images.length})` },
        { key: 'mappings', label: 'Mappings' },
    ];

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">Loading product...</div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">Product not found</div>
                <button className="mt-4 text-sm text-primary hover:underline" onClick={onBack}>
                    Back to Products
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
                    <h1 className="text-2xl font-bold truncate">{product.name}</h1>
                    <p className="text-muted-foreground text-sm">SPU: {product.spu_id}</p>
                </div>
                <ProductStatusBadge status={product.status} />
                {/* shop.product.detail.actions — 插件注入操作按钮 */}
                <PluginSlot
                    name="shop.product.detail.actions"
                    layout="inline"
                    context={{ spuId, product }}
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === tab.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'general' && (
                <div className="space-y-6">
                    {/* shop.product.edit.before — 插件注入编辑表单前置内容 */}
                    <PluginSlot
                        name="shop.product.edit.before"
                        context={{ spuId, product }}
                    />
                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">Basic Information</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium">Name</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Slug</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.slug}
                                    onChange={e => setForm({ ...form, slug: e.target.value })}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium">Short Description</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.short_description}
                                    onChange={e => setForm({ ...form, short_description: e.target.value })}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium">Description</label>
                                <textarea
                                    className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    rows={4}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">Pricing</h3>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <label className="text-sm font-medium">Price</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.price}
                                    onChange={e => setForm({ ...form, price: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Compare at Price</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.compare_at_price}
                                    onChange={e => setForm({ ...form, compare_at_price: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Cost Price</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.cost_price}
                                    onChange={e => setForm({ ...form, cost_price: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">Inventory</h3>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <label className="text-sm font-medium">Stock Quantity</label>
                                <input
                                    type="number"
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.stock_quantity}
                                    onChange={e => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Low Stock Threshold</label>
                                <input
                                    type="number"
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.low_stock_threshold}
                                    onChange={e => setForm({ ...form, low_stock_threshold: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">Shipping</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium">Weight</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.weight}
                                    onChange={e => setForm({ ...form, weight: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Weight Unit</label>
                                <select
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                    value={form.weight_unit}
                                    onChange={e => setForm({ ...form, weight_unit: e.target.value })}
                                >
                                    <option value="kg">kg</option>
                                    <option value="g">g</option>
                                    <option value="lb">lb</option>
                                    <option value="oz">oz</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold">SEO</h3>
                        <div className="grid gap-4">
                            <div>
                                <label className="text-sm font-medium">SEO Title</label>
                                <input
                                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    value={form.seo_title}
                                    onChange={e => setForm({ ...form, seo_title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">SEO Description</label>
                                <textarea
                                    className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                                    value={form.seo_description}
                                    onChange={e => setForm({ ...form, seo_description: e.target.value })}
                                    rows={2}
                                />
                            </div>
                        </div>
                    </div>

                    {/* shop.product.edit.after — 插件注入编辑表单后置内容 */}
                    <PluginSlot
                        name="shop.product.edit.after"
                        context={{ spuId, product }}
                    />

                    <div className="flex justify-end">
                        <button
                            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                            onClick={handleSaveGeneral}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'attributes' && (
                <div className="space-y-4">
                    {attrsLoading ? (
                        <div className="p-8 text-center text-muted-foreground">Loading attributes...</div>
                    ) : (
                        <>
                            <AttributeSelector
                                attributes={allAttributes}
                                selected={selectedAttrs}
                                onChange={setSelectedAttrs}
                            />
                            <div className="flex justify-end">
                                <button
                                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                                    onClick={handleSaveAttributes}
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save Attributes'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'variants' && (
                <VariantMatrix
                    spuId={spuId}
                    variants={variants}
                    onRefetch={fetchVariants}
                />
            )}

            {activeTab === 'images' && (
                <ImageGallery
                    images={images}
                    spuId={spuId}
                    onRefetch={refetchImages}
                />
            )}

            {activeTab === 'mappings' && (
                <ExternalMappingPanel
                    entityType="product"
                    entityId={spuId}
                />
            )}

            {/* shop.product.detail.block — 插件注入内容块（所有 tab 下方） */}
            <PluginSlot
                name="shop.product.detail.block"
                context={{ spuId, product }}
            />
        </div>
    );
}

function ProductStatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.draft}`}>
            {status}
        </span>
    );
}

export default ProductDetailPage;
