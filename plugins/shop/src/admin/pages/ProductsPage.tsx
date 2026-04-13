import React, { useState } from 'react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { PluginSlot } from '@wordrhyme/plugin/react';
import { useShopApi } from '../trpc';
import { productSchema } from '../schemas';

import { ProductDetailPage } from './ProductDetailPage';

export function ProductsPage() {
    const [selectedSpuId, setSelectedSpuId] = useState<string | null>(null);

    const shopApi = useShopApi();
    const resource = useAutoCrudResource({
        router: shopApi.products as any,
        schema: productSchema,
        options: { defaultVariant: 'sheet' },
    });

    const openDetail = (id: string) => {
        setSelectedSpuId(id);
    };

    if (selectedSpuId) {
        return <ProductDetailPage spuId={selectedSpuId} onCreated={(id: string) => setSelectedSpuId(id)} onBack={() => { setSelectedSpuId(null); }} />;
    }

    return (
        <div className="p-6">
            <AutoCrudTable
                title="Products"
                description="Manage your product catalog"
                slots={{
                    toolbarStart: <PluginSlot name="shop.product.list.toolbar" layout="inline" />
                }}
                onCreate={() => openDetail('new')}
                permissions={{ can: { create: true, update: true, delete: true, export: true, import: true } }}
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
                    spuId: { label: 'SPU ID', form: false },
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
                    priceCents: { label: '价格' },
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
                    overrides: {
                        name: {
                            cell: ({ getValue }: any) => {
                                const val = getValue();
                                if (!val) return '-';
                                if (typeof val === 'string') return val;
                                if (typeof val === 'object') return val.zh || val.en || Object.values(val)[0] || String(val);
                                return String(val);
                            }
                        },
                        priceCents: {
                            cell: ({ getValue }: any) => {
                                const val = getValue();
                                if (val === null || val === undefined) return '-';
                                return (Number(val) / 100).toString();
                            }
                        }
                    }
                }}
                form={{ columns: 2 }}
                {...{
                    actions: [
                        { type: 'custom', label: '编辑商品', onClick: (row: any) => openDetail(row.spuId) },
                        { type: 'delete', separator: true },
                    ],
                } as any}
            />
        </div>
    );
}

export default ProductsPage;
