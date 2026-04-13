import React, { useState, useEffect } from 'react';
import { useProduct, updateProduct, createProduct } from '../hooks/useProducts';
import { ImageGallery } from '../components/ImageGallery';
import { VariantEditor, ParameterEditor, type SpecGroup, type VariantData, type CustomParameter } from '../components/variant-editor';
import { VariantTable } from '../components/variant-editor/VariantTable';
import { PluginSlot } from '@wordrhyme/plugin/react';
import { Calendar, Popover, PopoverContent, PopoverTrigger, Button } from '@wordrhyme/ui';
import { CalendarIcon } from 'lucide-react';

interface ProductDetailPageProps {
    spuId: string;
    onBack: () => void;
    onCreated?: (spuId: string) => void;
}

type TabKey = 'info' | 'specs' | 'details' | 'marketing' | 'params';

function readLocalizedText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const preferred = record['zh-CN'] ?? record['en-US'];
        if (typeof preferred === 'string') return preferred;
        const firstText = Object.values(record).find((item) => typeof item === 'string');
        if (typeof firstText === 'string') return firstText;
    }
    return '';
}

function toLocalizedText(value: string | undefined) {
    if (!value) return undefined;
    return { 'zh-CN': value, 'en-US': value };
}

function isMediaReference(value: string): boolean {
    if (!value) return false;
    if (value.startsWith('data:')) return false;
    if (value.includes('/')) return false;
    return true;
}

function useResolvedMediaUrl(src: string) {
    const [resolvedUrl, setResolvedUrl] = useState('');

    useEffect(() => {
        if (!src) {
            setResolvedUrl('');
            return;
        }

        if (!isMediaReference(src)) {
            setResolvedUrl(src);
            return;
        }

        let active = true;
        fetch(`/trpc/media.getSignedUrl?input=${encodeURIComponent(JSON.stringify({ mediaId: src, expiresIn: 86400 }))}`)
            .then((res) => res.json())
            .then((data: any) => {
                if (!active) return;
                setResolvedUrl(data?.result?.data?.url || '');
            })
            .catch(() => {
                if (active) setResolvedUrl('');
            });

        return () => {
            active = false;
        };
    }, [src]);

    return resolvedUrl;
}

function SmartVideoPreview({ src, className }: { src: string; className: string }) {
    const resolvedUrl = useResolvedMediaUrl(src);

    if (!src) return null;

    if (!resolvedUrl) {
        return <div className={`animate-pulse bg-muted ${className}`} />;
    }

    return (
        <video
            src={resolvedUrl}
            className={className}
            muted
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
            }}
        />
    );
}

// ============================================================
// Reusable Form Row Component
// ============================================================
function FormRow({
    label,
    required,
    children,
    suffix,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    suffix?: React.ReactNode;
}) {
    return (
        <div className="flex items-start py-4 border-b border-border/40 last:border-0">
            <label className="w-[130px] flex-shrink-0 text-right pr-4 pt-2 text-sm text-muted-foreground whitespace-nowrap">
                {required && <span className="text-destructive mr-0.5">*</span>}
                {label}：
            </label>
            <div className="flex-1 min-w-0">
                {children}
            </div>
            {suffix && <div className="ml-3 flex-shrink-0">{suffix}</div>}
        </div>
    );
}

// ============================================================
// DateTimePicker Component (Popover + Calendar + Time)
// ============================================================
function DateTimePicker({
    value,
    onChange,
    placeholder = '请选择日期和时间',
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}) {
    // value format: "YYYY-MM-DDTHH:mm" (same as datetime-local)
    const dateObj = value ? new Date(value) : undefined;
    const timeStr = dateObj ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '00:00';
    const [open, setOpen] = useState(false);

    const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const displayText = dateObj
        ? `${formatDate(dateObj)} ${timeStr}`
        : placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={`w-[260px] justify-start text-left font-normal ${
                        !value ? 'text-muted-foreground' : ''
                    }`}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {displayText}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={dateObj}
                    onSelect={(day: Date | undefined) => {
                        if (day) {
                            const [h = 0, m = 0] = timeStr.split(':').map(Number);
                            day.setHours(h, m, 0, 0);
                            onChange(`${formatDate(day)}T${timeStr}`);
                        }
                    }}
                />
                <div className="border-t px-3 py-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">时间</span>
                    <input
                        type="time"
                        className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={timeStr}
                        onChange={e => {
                            const t = e.currentTarget.value || '00:00';
                            if (dateObj) {
                                onChange(`${formatDate(dateObj)}T${t}`);
                            } else {
                                const today = new Date();
                                onChange(`${formatDate(today)}T${t}`);
                            }
                        }}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ============================================================
// Main Component
// ============================================================
export function ProductDetailPage({ spuId, onBack, onCreated }: ProductDetailPageProps) {
    const isNew = spuId === 'new';
    const { product, images, matrix, loading, refetch } = useProduct(isNew ? null : spuId);
    const [activeTab, setActiveTab] = useState<TabKey>('info');
    const [saving, setSaving] = useState(false);

    // Variant Editor States
    const [specGroups, setSpecGroups] = useState<SpecGroup[]>([]);
    const [variantData, setVariantData] = useState<VariantData[]>([]);
    const [localImages, setLocalImages] = useState<string[]>([]);
    const [specMode, setSpecMode] = useState<'single' | 'multi'>('single');
    const [singleVariantImage, setSingleVariantImage] = useState<string>('');
    const [customParameters, setCustomParameters] = useState<CustomParameter[]>([]);

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
        weight: '',
        weight_unit: 'kg',
        brand: '',
        seo_title: '',
        seo_description: '',
        // Migration 008 fields
        product_type: 'normal',
        unit: '',
        main_video: '',
        keywords: '',
        publish_status: 'immediate',
        publish_at: '',
        delist_enabled: false,
        delist_at: '',
        volume: '',
        barcode: '',
        tags: [] as string[],
        logisticsAttributes: [] as string[],
    });

    useEffect(() => {
        if (product) {
            setForm({
                name: readLocalizedText(product.name),
                spu_id: product.spuId || '',
                slug: product.slug || '',
                description: readLocalizedText(product.description),
                short_description: readLocalizedText(product.shortDescription),
                price: product.priceCents ? (product.priceCents / 100).toString() : '',
                compare_at_price: product.regularPriceCents ? (product.regularPriceCents / 100).toString() : '',
                cost_price: '',
                currency: product.currencyCode || 'USD',
                stock_quantity: product.stockQuantity ?? 0,
                weight: product.weight || '',
                weight_unit: 'kg',
                brand: product.brand || '',
                seo_title: readLocalizedText(product.seoTitle),
                seo_description: readLocalizedText(product.seoDescription),
                product_type: product.productType || 'normal',
                unit: product.unit || '',
                main_video: product.mainVideo || '',
                keywords: product.keywords || '',
                publish_status: product.publishStatus || 'immediate',
                publish_at: product.publishAt ? product.publishAt.slice(0, 16) : '',
                delist_enabled: product.delistEnabled || false,
                delist_at: product.delistAt ? product.delistAt.slice(0, 16) : '',
                volume: (product as any).volume || '',
                barcode: (product as any).barcode || '',
                tags: Array.isArray(product.tags) ? product.tags.map((tag) => typeof tag === 'string' ? tag : String((tag as any).value ?? '')) : [],
                logisticsAttributes: product.logisticsAttributes || [],
            });
            if (product.customParameters && Array.isArray(product.customParameters)) {
                setCustomParameters(product.customParameters);
            }
        }
    }, [product]);

    useEffect(() => {
        if (images && images.length > 0 && localImages.length === 0) {
            setLocalImages(images);
        }
    }, [images]);

    useEffect(() => {
        if (!matrix) return;
        const nextSpecs = Array.isArray(matrix.specs) ? matrix.specs : [];
        const nextVariants = Array.isArray(matrix.variants) ? matrix.variants.map((v: any) => ({
            ...v,
            priceCents: v.priceCents ? (v.priceCents / 100).toString() : '',
            regularPriceCents: v.regularPriceCents ? (v.regularPriceCents / 100).toString() : '',
            purchaseCost: v.purchaseCost ? (v.purchaseCost / 100).toString() : '',
        })) : [];

        setSpecGroups(nextSpecs);
        setVariantData(nextVariants);

        if (nextSpecs.length > 0 || nextVariants.length > 1) {
            setSpecMode('multi');
        } else if (nextVariants.length === 1) {
            const [singleVariant] = nextVariants;
            if (singleVariant) {
                setSingleVariantImage(singleVariant.image || '');
                setForm(prev => ({
                    ...prev,
                    spu_id: singleVariant.skuCode || prev.spu_id,
                    price: singleVariant.priceCents ? singleVariant.priceCents : prev.price,
                    compare_at_price: singleVariant.regularPriceCents ? singleVariant.regularPriceCents : prev.compare_at_price,
                    cost_price: singleVariant.purchaseCost ? singleVariant.purchaseCost : prev.cost_price,
                    stock_quantity: singleVariant.stockQuantity,
                    weight: singleVariant.weight || prev.weight,
                }));
            }
        }
    }, [matrix]);

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'info', label: '商品信息' },
        { key: 'specs', label: '规格设置' },
        { key: 'details', label: '商品详情' },
        // { key: 'marketing', label: '营销设置' }, // 暂时隐藏，因为售价/库存等已合并到规格设置中
        { key: 'params', label: '商品参数' },
    ];
    const primaryImage = singleVariantImage || localImages[0] || images[0] || '';

    const handleNext = () => {
        const currentIndex = tabs.findIndex(t => t.key === activeTab);
        if (currentIndex < tabs.length - 1) {
            const nextTab = tabs[currentIndex + 1];
            if (nextTab) setActiveTab(nextTab.key);
        }
    };

    const handlePrev = () => {
        const currentIndex = tabs.findIndex(t => t.key === activeTab);
        if (currentIndex > 0) {
            const prevTab = tabs[currentIndex - 1];
            if (prevTab) setActiveTab(prevTab.key);
        }
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            const variantsToSave = specMode === 'single'
                ? [{
                    id: variantData[0]?.id || 'new-single',
                    skuCode: form.spu_id,
                    priceCents: form.price ? Math.round(Number.parseFloat(form.price) * 100) : undefined,
                    regularPriceCents: form.compare_at_price ? Math.round(Number.parseFloat(form.compare_at_price) * 100) : undefined,
                    purchaseCost: form.cost_price ? Math.round(Number.parseFloat(form.cost_price) * 100) : undefined,
                    stockQuantity: form.stock_quantity,
                    weight: form.weight,
                    length: '',
                    width: '',
                    height: '',
                    image: primaryImage,
                    options: {},
                }]
                : variantData.map((v: any) => ({
                    ...v,
                    priceCents: v.priceCents ? Math.round(Number.parseFloat(v.priceCents) * 100) : undefined,
                    regularPriceCents: v.regularPriceCents ? Math.round(Number.parseFloat(v.regularPriceCents) * 100) : undefined,
                    purchaseCost: v.purchaseCost ? Math.round(Number.parseFloat(v.purchaseCost) * 100) : undefined,
                }));

            const specsToSave = specMode === 'multi' ? specGroups : [];

            const payload: any = {
                name: toLocalizedText(form.name),
                slug: form.slug,
                description: toLocalizedText(form.description),
                shortDescription: toLocalizedText(form.short_description),
                priceCents: form.price ? Math.round(Number.parseFloat(form.price) * 100) : undefined,
                regularPriceCents: form.compare_at_price ? Math.round(Number.parseFloat(form.compare_at_price) * 100) : undefined,
                currencyCode: form.currency || undefined,
                stockQuantity: form.stock_quantity,
                weight: form.weight || undefined,
                brand: form.brand || undefined,
                seoTitle: toLocalizedText(form.seo_title),
                seoDescription: toLocalizedText(form.seo_description),
                productType: form.product_type,
                unit: form.unit || undefined,
                mainVideo: form.main_video || undefined,
                keywords: form.keywords || undefined,
                publishStatus: form.publish_status,
                publishAt: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
                delistEnabled: form.delist_enabled,
                delistAt: form.delist_at ? new Date(form.delist_at).toISOString() : undefined,
                logisticsAttributes: form.logisticsAttributes,
                customParameters: customParameters,
                specs: specsToSave,
                variants: variantsToSave,
                images: localImages,
            };

            let currentSpuId = spuId;
            if (isNew) {
                const res: any = await createProduct(payload);
                if (res.error) throw new Error(res.error.message);
                currentSpuId = res.result?.data?.spuId || res.result?.data?.id || res.result?.data?.data?.spuId || res.result?.data?.data?.id;
            } else {
                const res: any = await updateProduct(spuId, payload);
                if (res.error) throw new Error(res.error.message);
            }

            if (isNew && onCreated && currentSpuId) {
                onCreated(currentSpuId);
            } else {
                refetch();
            }
        } catch (err) {
            console.error('Failed to save:', err);
            alert('保存失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">加载中...</div>
            </div>
        );
    }

    if (!product && !isNew) {
        return (
            <div className="p-6">
                <div className="text-center text-muted-foreground">商品不存在</div>
                <button className="mt-4 text-sm text-primary hover:underline" onClick={onBack}>
                    返回商品列表
                </button>
            </div>
        );
    }

    const inputClass = "flex h-9 w-full max-w-[480px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
    const selectClass = "flex h-9 w-full max-w-[480px] rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

    return (
        <div className="p-6 pb-20 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    className="h-9 px-3 rounded-md border text-sm hover:bg-muted"
                    onClick={onBack}
                >
                    返回
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold truncate">{isNew ? '新建商品' : readLocalizedText(product?.name)}</h1>
                    <p className="text-muted-foreground text-sm">SPU: {isNew ? '未保存' : product?.spuId}</p>
                </div>
                {!isNew && <ProductStatusBadge status={product?.status || 'draft'} />}
                {!isNew && (
                    <PluginSlot
                        name="shop.product.detail.actions"
                        layout="inline"
                        context={{ spuId, product }}
                    />
                )}
            </div>

            {/* Tabs — matching design screenshot with blue underline */}
            <div className="flex gap-1 border-b">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

            {/* ============================================================ */}
            {/* 商品信息 Tab */}
            {/* ============================================================ */}
            {activeTab === 'info' && (
                <div className="space-y-0">
                    <PluginSlot name="shop.product.edit.before" context={{ spuId, product }} />

                    <div className="rounded-lg border bg-card px-6">
                        {/* ── 基本信息 ── */}
                        <div className="pt-4 pb-1">
                            <h3 className="text-sm font-medium text-foreground">基本信息</h3>
                        </div>


                        {/* 商品名称 */}
                        <FormRow label="商品名称" required>
                            <input
                                className={inputClass}
                                placeholder="请输入商品名称"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                            />
                        </FormRow>

                        {/* Slug */}
                        <FormRow label="商品别名">
                            <input
                                className={inputClass}
                                placeholder="请输入商品别名 (URL Slug)"
                                value={form.slug}
                                onChange={e => setForm({ ...form, slug: e.target.value })}
                            />
                        </FormRow>

                        {/* 单位 */}
                        <FormRow label="单位">
                            <select
                                className={selectClass}
                                value={form.unit}
                                onChange={e => setForm({ ...form, unit: e.target.value })}
                            >
                                <option value="">请选择</option>
                                <option value="件">件</option>
                                <option value="个">个</option>
                                <option value="套">套</option>
                                <option value="箱">箱</option>
                                <option value="kg">千克(kg)</option>
                                <option value="g">克(g)</option>
                                <option value="m">米(m)</option>
                                <option value="L">升(L)</option>
                            </select>
                        </FormRow>

                        {/* 品牌 */}
                        <FormRow label="品牌">
                            <input
                                className={inputClass}
                                placeholder="请输入品牌名称"
                                value={form.brand}
                                onChange={e => setForm({ ...form, brand: e.target.value })}
                            />
                        </FormRow>

                        {/* 物流属性 */}
                        <FormRow label="物流属性">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1.5 pb-2">
                                {[
                                    { value: 'battery', label: '带电池' },
                                    { value: 'infringement', label: '侵权' },
                                    { value: 'magnetic', label: '带磁' },
                                    { value: 'non_liquid_cosmetic', label: '非液体(化妆品)' },
                                    { value: 'liquid_cosmetic', label: '液体(化妆品)' },
                                    { value: 'liquid_non_cosmetic', label: '液体(非化妆品)' },
                                    { value: 'powder', label: '粉末' },
                                    { value: 'paste', label: '膏体' },
                                    { value: 'knife', label: '刀具' },
                                    { value: 'flammable', label: '易燃品' },
                                ].map(opt => {
                                    const isChecked = form.logisticsAttributes?.includes(opt.value);
                                    return (
                                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm hover:text-primary transition-colors">
                                            <input
                                                type="checkbox"
                                                className="accent-primary w-4 h-4 rounded"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    const newAttrs = e.target.checked
                                                        ? [...(form.logisticsAttributes || []), opt.value]
                                                        : (form.logisticsAttributes || []).filter((v: string) => v !== opt.value);
                                                    setForm({ ...form, logisticsAttributes: newAttrs });
                                                }}
                                            />
                                            {opt.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </FormRow>

                        {/* ── 媒体 ── */}
                        <div className="pt-6 pb-1 mt-2 border-t border-border/30">
                            <h3 className="text-sm font-medium text-foreground">商品媒体</h3>
                        </div>

                        <FormRow label="商品图片" required>
                            <ImageGallery
                                images={localImages}
                                onChange={setLocalImages}
                            />
                        </FormRow>

                        {/* 主图视频 */}
                        <FormRow label="主图视频">
                            <div className="space-y-2">
                                {form.main_video ? (
                                    <div className="relative w-60 rounded-lg border overflow-hidden bg-muted group">
                                        <SmartVideoPreview
                                            src={form.main_video}
                                            className="w-full h-36 object-cover"
                                        />
                                        <button
                                            type="button"
                                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                                            onClick={() => setForm({ ...form, main_video: '' })}
                                            title="移除视频"
                                        >
                                            ✕
                                        </button>
                                        <div className="px-2 py-1 truncate text-xs text-muted-foreground bg-muted">
                                            {form.main_video}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            className={inputClass}
                                            placeholder="粘贴视频链接，或点击右侧上传"
                                            value={form.main_video}
                                            onChange={e => setForm({ ...form, main_video: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            className="h-9 px-3 rounded-md border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
                                            onClick={() => {
                                                const picker = (window as any).__OMNIDS_MEDIA_PICKER__;
                                                if (picker) {
                                                    picker.open({
                                                        presentation: 'drawer',
                                                        mode: 'single',
                                                        onSelect: (media: any[]) => {
                                                            if (media.length > 0) {
                                                                setForm(prev => ({ ...prev, main_video: media[0].url || media[0].id || '' }));
                                                            }
                                                        },
                                                    });
                                                }
                                            }}
                                        >
                                            上传视频
                                        </button>
                                    </div>
                                )}
                            </div>
                        </FormRow>

                        {/* ── 描述 ── */}
                        <div className="pt-6 pb-1 mt-2 border-t border-border/30">
                            <h3 className="text-sm font-medium text-foreground">商品描述</h3>
                        </div>

                        {/* 商品关键字 */}
                        <FormRow label="商品关键字">
                            <input
                                className={inputClass}
                                placeholder="请输入多个商品关键字，用空格隔开"
                                value={form.keywords}
                                onChange={e => setForm({ ...form, keywords: e.target.value })}
                            />
                        </FormRow>

                        {/* 商品简介 */}
                        <FormRow label="商品简介">
                            <textarea
                                className="flex min-h-[80px] w-full max-w-[480px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                                placeholder="请输入商品简介"
                                value={form.short_description}
                                onChange={e => setForm({ ...form, short_description: e.target.value })}
                                rows={3}
                            />
                        </FormRow>

                        {/* ── 上架设置 ── */}
                        <div className="pt-6 pb-1 mt-2 border-t border-border/30">
                            <h3 className="text-sm font-medium text-foreground">上架设置</h3>
                        </div>

                        <FormRow label="上架时间">
                            <div className="flex items-center gap-6 pt-1.5">
                                {[
                                    { value: 'immediate', label: '立即上架' },
                                    { value: 'scheduled', label: '定时上架' },
                                    { value: 'warehouse', label: '放入仓库' },
                                ].map(opt => (
                                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input
                                            type="radio"
                                            name="publish_status"
                                            className="accent-primary w-4 h-4"
                                            checked={form.publish_status === opt.value}
                                            onChange={() => setForm({ ...form, publish_status: opt.value })}
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                            {form.publish_status === 'scheduled' && (
                                <div className="mt-2">
                                    <DateTimePicker
                                        value={form.publish_at}
                                        onChange={val => setForm({ ...form, publish_at: val })}
                                        placeholder="选择上架时间"
                                    />
                                </div>
                            )}
                        </FormRow>

                        <FormRow label="定时下架">
                            <div className="flex items-center gap-3 pt-1.5">
                                <button
                                    type="button"
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        form.delist_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                                    }`}
                                    onClick={() => setForm({ ...form, delist_enabled: !form.delist_enabled })}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            form.delist_enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                                <span className="text-xs text-muted-foreground">{form.delist_enabled ? '开启' : '关闭'}</span>
                            </div>
                            {form.delist_enabled && (
                                <div className="mt-2">
                                    <DateTimePicker
                                        value={form.delist_at}
                                        onChange={val => setForm({ ...form, delist_at: val })}
                                        placeholder="选择下架时间"
                                    />
                                </div>
                            )}
                        </FormRow>
                    </div>

                    <PluginSlot name="shop.product.edit.after" context={{ spuId, product }} />
                </div>
            )}

            {/* ============================================================ */}
            {/* 规格设置 Tab */}
            {/* ============================================================ */}
            {activeTab === 'specs' && (
                <div className="space-y-0">
                    <div className="rounded-lg border bg-card px-6">
                        {/* 规格类型选择 */}
                        <FormRow label="规格类型">
                            <div className="flex items-center gap-6 pt-1.5">
                                {[
                                    { value: 'single', label: '单规格' },
                                    { value: 'multi', label: '多规格' },
                                ].map(opt => (
                                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input
                                            type="radio"
                                            name="spec_mode"
                                            className="accent-primary w-4 h-4"
                                            checked={specMode === opt.value}
                                            onChange={() => setSpecMode(opt.value as 'single' | 'multi')}
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                                {specMode === 'multi' && (
                                    <select className="h-8 ml-4 rounded border border-input bg-transparent px-3 text-xs text-primary focus:outline-none">
                                        <option value="">选择规格模板</option>
                                        <option value="apparel">默认服装尺码</option>
                                        <option value="shoes">默认鞋类尺码</option>
                                    </select>
                                )}
                            </div>
                        </FormRow>
                    </div>

                    {/* 单规格模式 — 复用 VariantTable，只传一行 */}
                    {specMode === 'single' && (
                        <div className="mt-4">
                            <VariantTable
                                specGroups={[]}
                                variants={[{
                                    id: 'single-default',
                                    skuCode: form.spu_id,
                                    priceCents: form.price,
                                    regularPriceCents: form.compare_at_price,
                                    purchaseCost: form.cost_price,
                                    stockQuantity: form.stock_quantity,
                                    weight: form.weight,
                                    length: '',
                                    width: '',
                                    height: '',
                                    image: primaryImage,
                                    options: {},
                                }]}
                                onUpdateVariant={(_id, data) => {
                                    if (data.image !== undefined) {
                                        setSingleVariantImage(data.image);
                                    }
                                    setForm(prev => ({
                                        ...prev,
                                        ...(data.skuCode !== undefined && { spu_id: data.skuCode }),
                                        ...(data.priceCents !== undefined && { price: data.priceCents }),
                                        ...(data.regularPriceCents !== undefined && { compare_at_price: data.regularPriceCents }),
                                        ...(data.purchaseCost !== undefined && { cost_price: data.purchaseCost }),
                                        ...(data.stockQuantity !== undefined && { stock_quantity: data.stockQuantity }),
                                        ...(data.weight !== undefined && { weight: data.weight }),
                                    }));
                                }}
                            />
                        </div>
                    )}

                    {/* 多规格模式 */}
                    {specMode === 'multi' && (
                        <div className="mt-4">
                            <VariantEditor
                                initialSpecs={specGroups}
                                initialVariants={variantData}
                                onChange={(specs, vars) => {
                                    setSpecGroups(specs);
                                    setVariantData(vars);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ============================================================ */}
            {/* 商品详情 Tab */}
            {/* ============================================================ */}
            {activeTab === 'details' && (
                <div className="space-y-6">
                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold text-sm">商品详情</h3>
                        <textarea
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                            placeholder="请输入商品详情描述 (支持富文本，后续将集成编辑器)"
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={10}
                        />
                    </div>

                    <div className="rounded-lg border bg-card p-6 space-y-4">
                        <h3 className="font-semibold text-sm">搜索引擎优化 (SEO)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">SEO 标题</label>
                                    <input
                                        className={inputClass}
                                        value={form.seo_title}
                                        onChange={e => setForm({ ...form, seo_title: e.target.value })}
                                        placeholder="请输入 SEO 标题"
                                        maxLength={70}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">建议长度在 60 个字符以内。当前: {form.seo_title.length} 个字符</p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">SEO 描述</label>
                                    <textarea
                                        className="flex min-h-[100px] w-full max-w-[480px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                                        value={form.seo_description}
                                        onChange={e => setForm({ ...form, seo_description: e.target.value })}
                                        placeholder="请输入 SEO 描述"
                                        maxLength={320}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">建议长度在 160 个字符以内。当前: {form.seo_description.length} 个字符</p>
                                </div>
                            </div>

                            <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                                <h4 className="text-xs font-medium text-muted-foreground mb-3">搜索结果预览</h4>
                                <div className="space-y-1 pb-2">
                                    <div className="text-[13px] text-[#202124] flex items-center gap-2 mb-1">
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[12px] font-bold">O</div>
                                        <div className="flex flex-col">
                                            <span className="leading-tight">OmniDS Store</span>
                                            <span className="text-[#5f6368] text-[12px] leading-tight">https://store.omnids.com {'>'} products {'>'} {form.slug || 'slug'}</span>
                                        </div>
                                    </div>
                                    <div className="text-[20px] text-[#1a0dab] cursor-pointer hover:underline line-clamp-1 break-all pt-1">
                                        {form.seo_title || form.name || '商品标题'}
                                    </div>
                                    <div className="text-[14px] text-[#4d5156] line-clamp-2 mt-1">
                                        {form.seo_description || form.short_description || '商品 SEO 描述文本，通常用于在搜索引擎的搜索结果中向用户展示商品的核心卖点和简要介绍。'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* 营销设置 Tab (暂时隐藏，功能合并至规格设置) */}
            {/* ============================================================ */}            {/* ============================================================ */}
            {/* 商品参数 Tab */}
            {/* ============================================================ */}
            {activeTab === 'params' && (
                <div className="space-y-4">
                    {/* 自定义参数 */}
                    <div className="rounded-lg border bg-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-sm">自定义参数</h3>
                        </div>
                        <ParameterEditor
                            parameters={customParameters}
                            onChange={setCustomParameters}
                        />
                    </div>
                </div>
            )}

            {/* Plugin Slot — below all tabs */}
            <PluginSlot
                name="shop.product.detail.block"
                context={{ spuId, product }}
            />

            {/* Fixed Footer */}
            <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 shadow-md flex items-center justify-end gap-3 z-50 px-12">
                {activeTab !== tabs[0].key && (
                    <button
                        className="h-10 px-6 rounded-md border bg-background text-sm font-medium hover:bg-muted"
                        onClick={handlePrev}
                    >
                        上一步
                    </button>
                )}
                {activeTab !== tabs[tabs.length - 1].key && (
                    <button
                        className="h-10 px-6 rounded-md border bg-background text-sm font-medium hover:bg-muted"
                        onClick={handleNext}
                    >
                        下一步
                    </button>
                )}
                <button
                    className="h-10 px-8 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    onClick={handleSaveAll}
                    disabled={saving}
                >
                    {saving ? '保存中...' : (isNew ? '创建商品' : '保存更改')}
                </button>
            </div>
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
