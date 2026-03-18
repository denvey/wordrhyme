import React, { useState } from 'react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { PluginSlot } from '@wordrhyme/plugin/react';
import { useShopApi } from '../trpc';
import { productSchema } from '../schemas';

export function ProductsPage() {
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

    // Lazy-load ProductDetailPage to avoid circular issues
    const [DetailPage, setDetailPage] = useState<React.ComponentType<{ productId: string; onBack: () => void }> | null>(null);

    const shopApi = useShopApi();
    const resource = useAutoCrudResource({
        router: shopApi.products as any,
        schema: productSchema,
        options: { defaultVariant: 'sheet' },
    });

    const openDetail = async (id: string) => {
        if (!DetailPage) {
            const mod = await import('./ProductDetailPage');
            setDetailPage(() => mod.ProductDetailPage);
        }
        setSelectedProductId(id);
    };

    if (selectedProductId && DetailPage) {
        return <DetailPage productId={selectedProductId} onBack={() => { setSelectedProductId(null); }} />;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Products</h1>
                    <p className="text-muted-foreground text-sm">Manage your product catalog</p>
                </div>
                <PluginSlot name="shop.product.list.toolbar" layout="inline" />
            </div>

            <AutoCrudTable
                title="Products"
                schema={productSchema}
                resource={resource}
                fields={{
                    // ── 系统字段：表格 + 表单都隐藏 ──
                    id: { hidden: true },
                    organizationId: { hidden: true },
                    aclTags: { hidden: true },
                    denyTags: { hidden: true },
                    createdBy: { hidden: true },
                    createdAt: { hidden: true },
                    updatedAt: { hidden: true },
                    priceRange: { hidden: true },
                    regularPriceCents: { hidden: true },
                    salePriceCents: { hidden: true },

                    // ── 表格 + 表单都显示 ──
                    spuId: { label: 'SPU ID' },
                    name: { label: '名称' },
                    status: {
                        label: '状态',
                        form: {
                            'x-component': 'Select',
                            enum: [
                                { label: '草稿', value: 'draft' },
                                { label: '待审', value: 'pending' },
                                { label: '已发布', value: 'published' },
                                { label: '已归档', value: 'archived' },
                            ],
                        },
                    },
                    priceCents: { label: '价格 (分)' },
                    currencyCode: { label: '货币' },
                    stockQuantity: { label: '库存' },
                    stockStatus: {
                        label: '库存状态',
                        form: {
                            'x-component': 'Select',
                            enum: [
                                { label: '有货', value: 'instock' },
                                { label: '缺货', value: 'outofstock' },
                                { label: '可预订', value: 'onbackorder' },
                            ],
                        },
                    },
                    source: {
                        label: '来源',
                        form: {
                            'x-component': 'Select',
                            enum: [
                                { label: '1688', value: '1688' },
                                { label: 'AliExpress', value: 'aliexpress' },
                                { label: 'Shopify', value: 'shopify' },
                                { label: 'WooCommerce', value: 'woocommerce' },
                                { label: 'Temu', value: 'temu' },
                                { label: 'TikTok', value: 'tiktok' },
                                { label: 'Platform', value: 'platform' },
                            ],
                        },
                    },

                    // ── 仅表单显示（表格隐藏）──
                    description: {
                        label: '描述',
                        table: false,
                        form: { 'x-component': 'Textarea' },
                    },
                    shortDescription: {
                        label: '简短描述',
                        table: false,
                    },
                    mainImage: { label: '主图 URL', table: false },
                    url: { label: '商品链接', table: false },
                    manageStock: { label: '管理库存', table: false },
                    seoTitle: { label: 'SEO 标题', table: false },
                    seoDescription: {
                        label: 'SEO 描述',
                        table: false,
                        form: { 'x-component': 'Textarea' },
                    },
                    tags: { label: '标签', table: false },
                }}
                table={{
                    filterModes: ['simple'],
                    defaultSort: [{ id: 'createdAt', desc: true }],
                }}
                form={{ columns: 2 }}
                {...{
                    actions: [
                        { type: 'custom', label: '查看详情', onClick: (row: any) => openDetail(row.id) },
                        { type: 'edit' },
                        { type: 'delete', separator: true },
                    ],
                } as any}
            />
        </div>
    );
}

export default ProductsPage;
