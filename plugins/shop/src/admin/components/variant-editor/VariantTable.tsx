import React, { useMemo, useState } from 'react';
import type { SpecGroup, VariantData } from './types';
import { Plus, Check, Eraser } from 'lucide-react';
import { SmartImage } from '../ImageGallery';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@wordrhyme/ui';

interface VariantTableProps {
    specGroups: SpecGroup[];
    variants: VariantData[];
    onUpdateVariant: (id: string, data: Partial<VariantData>) => void;
    onApplyBatchSettings?: (data: Partial<VariantData>, filters?: Record<string, string>) => void;
}

export function VariantTable({ specGroups, variants, onUpdateVariant, onApplyBatchSettings }: VariantTableProps) {
    const validGroups = useMemo(() => specGroups.filter(g => g.values.length > 0), [specGroups]);

    // Batch setup state
    const [batchFilters, setBatchFilters] = useState<Record<string, string>>({});
    const [batchData, setBatchData] = useState({
        priceCents: '',
        regularPriceCents: '',
        purchaseCost: '',
        stockQuantity: '',
        weight: '',
        length: '',
        width: '',
        height: '',
    });

    const handleApplyBatch = () => {
        if (!onApplyBatchSettings) return;
        const payload: Partial<VariantData> = {};
        if (batchData.priceCents !== '') payload.priceCents = batchData.priceCents;
        if (batchData.regularPriceCents !== '') payload.regularPriceCents = batchData.regularPriceCents;
        if (batchData.purchaseCost !== '') payload.purchaseCost = batchData.purchaseCost;
        if (batchData.stockQuantity !== '') payload.stockQuantity = Number.parseInt(batchData.stockQuantity) || 0;
        if (batchData.weight !== '') payload.weight = batchData.weight;
        if (batchData.length !== '') payload.length = batchData.length;
        if (batchData.width !== '') payload.width = batchData.width;
        if (batchData.height !== '') payload.height = batchData.height;

        onApplyBatchSettings(payload, batchFilters);
    };

    const handleClearBatch = () => {
        setBatchFilters({});
        setBatchData({
            priceCents: '',
            regularPriceCents: '',
            purchaseCost: '',
            stockQuantity: '',
            weight: '',
            length: '',
            width: '',
            height: '',
        });
    };

    // calculate rowspans for each spec group
    const rowSpans = useMemo(() => {
        const spans: number[] = [];
        let currentSpan = 1;
        for (let i = validGroups.length - 1; i >= 0; i--) {
            spans[i] = currentSpan;
            currentSpan *= validGroups[i].values.length;
        }
        return spans;
    }, [validGroups]);

    if (variants.length === 0) {
        return (
            <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card">
                请在上方添加属性以生成规格明细
            </div>
        );
    }

    const SPEC_COL_WIDTH = 120;

    return (
        <div className="border rounded-lg overflow-x-auto bg-card relative">
            <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted border-b relative z-30">
                    <tr>
                        {validGroups.map((g, index) => {
                            const isLast = index === validGroups.length - 1;
                            return (
                                <th
                                    key={g.id}
                                    className={`p-3 font-medium sticky z-30 bg-muted ${isLast ? 'border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                                    style={{ left: index * SPEC_COL_WIDTH, width: SPEC_COL_WIDTH, minWidth: SPEC_COL_WIDTH, maxWidth: SPEC_COL_WIDTH }}
                                >
                                    {g.name}
                                </th>
                            );
                        })}
                        <th className="p-3 font-medium min-w-[100px]">规格配图</th>
                        <th className="p-3 font-medium min-w-[120px]">SKU 编码</th>
                        <th className="p-3 font-medium min-w-[100px]">售价</th>
                        <th className="p-3 font-medium min-w-[100px]">划线价</th>
                        <th className="p-3 font-medium min-w-[100px]">成本价</th>
                        <th className="p-3 font-medium min-w-[80px]">库存</th>
                        <th className="p-3 font-medium min-w-[80px]">重量(g)</th>
                        <th className="p-3 font-medium min-w-[180px]">体积(长x宽x高)</th>
                        {validGroups.length > 0 && (
                            <th className="p-3 font-medium min-w-[140px] text-center sticky right-0 bg-muted z-30 border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">批量操作</th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y relative z-10">
                    {/* Inline Batch Setup Row */}
                    {validGroups.length > 0 && (
                        <tr className="bg-background hover:bg-muted/30 transition-colors">
                            {validGroups.map((g, index) => {
                                const isLast = index === validGroups.length - 1;
                                return (
                                    <td
                                        key={g.id}
                                        className={`p-2 align-middle sticky bg-background ${isLast ? 'border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                                        style={{ left: index * SPEC_COL_WIDTH, width: SPEC_COL_WIDTH, minWidth: SPEC_COL_WIDTH, maxWidth: SPEC_COL_WIDTH, zIndex: 20 }}
                                    >
                                        <select
                                            className="h-8 w-full rounded border border-input bg-background/90 px-1 text-xs focus:outline-none focus:border-primary truncate"
                                            value={batchFilters[g.id] || ''}
                                            onChange={e => setBatchFilters(prev => ({ ...prev, [g.id]: e.currentTarget.value }))}
                                            title="全部"
                                        >
                                            <option value="">全部</option>
                                            {g.values.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                );
                            })}
                            <td className="p-3 text-muted-foreground text-xs text-center font-medium">批量设置 ➔</td>
                            <td className="p-3"></td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary"
                                    value={batchData.priceCents}
                                    placeholder="修改"
                                    onChange={e => setBatchData({ ...batchData, priceCents: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary"
                                    value={batchData.regularPriceCents}
                                    placeholder="修改"
                                    onChange={e => setBatchData({ ...batchData, regularPriceCents: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary"
                                    value={batchData.purchaseCost}
                                    placeholder="修改"
                                    onChange={e => setBatchData({ ...batchData, purchaseCost: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    type="number"
                                    className="h-8 w-20 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary"
                                    value={batchData.stockQuantity}
                                    placeholder="修改"
                                    onChange={e => setBatchData({ ...batchData, stockQuantity: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-16 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary"
                                    value={batchData.weight}
                                    placeholder="修改"
                                    onChange={e => setBatchData({ ...batchData, weight: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-1">
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="长"
                                        value={batchData.length}
                                        onChange={e => setBatchData({ ...batchData, length: e.currentTarget.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="宽"
                                        value={batchData.width}
                                        onChange={e => setBatchData({ ...batchData, width: e.currentTarget.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-background/50 px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="高"
                                        value={batchData.height}
                                        onChange={e => setBatchData({ ...batchData, height: e.currentTarget.value })}
                                    />
                                </div>
                            </td>
                            <td className="p-3 align-middle sticky right-0 bg-background border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ zIndex: 20 }}>
                                <div className="flex items-center justify-center gap-1">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleApplyBatch}>
                                                    <Check className="h-4 w-4 text-primary" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                                <p>应用批量设置</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleClearBatch}>
                                                    <Eraser className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                                <p>清空这行配置</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </td>
                        </tr>
                    )}

                    {/* Data Rows */}
                    {variants.map((variant, rowIndex) => (
                        <tr key={variant.id} className="hover:bg-muted/30 transition-colors">
                            {/* Render dynamic spec columns with rowspan */}
                            {validGroups.map((g, colIndex) => {
                                const span = rowSpans[colIndex];
                                const isLast = colIndex === validGroups.length - 1;
                                // Render td only if this is the first row of the rowspan block
                                if (rowIndex % span === 0) {
                                    const valueId = variant.options[g.id];
                                    const valueName = g.values.find(v => v.id === valueId)?.name || '-';
                                    return (
                                        <td
                                            key={g.id}
                                            rowSpan={span}
                                            className={`p-3 align-top sticky bg-background border-r ${isLast ? 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                                            style={{ left: colIndex * SPEC_COL_WIDTH, width: SPEC_COL_WIDTH, minWidth: SPEC_COL_WIDTH, maxWidth: SPEC_COL_WIDTH, zIndex: 10 }}
                                        >
                                            <div className="pt-2 truncate" title={valueName}>{valueName}</div>
                                        </td>
                                    );
                                }
                                return null;
                            })}

                            <td className="p-3">
                                <div
                                    className="cursor-pointer"
                                    onClick={() => {
                                        const picker = (window as any).__OMNIDS_MEDIA_PICKER__;
                                        if (picker) {
                                            picker.open({
                                                presentation: 'dialog',
                                                mode: 'single',
                                                onSelect: (media: any[]) => {
                                                    if (media.length > 0) {
                                                        onUpdateVariant(variant.id, { image: media[0].id || media[0].url || '' });
                                                    }
                                                },
                                            });
                                        }
                                    }}
                                >
                                    {variant.image && variant.image.length > 0 ? (
                                        <SmartImage
                                            src={variant.image}
                                            alt="规格配图"
                                            className="w-10 h-10 rounded object-cover border hover:opacity-80 transition-opacity"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 border border-dashed rounded flex flex-col items-center justify-center bg-muted/20 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                            <Plus className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-full rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.skuCode}
                                    placeholder="选填"
                                    onChange={e => onUpdateVariant(variant.id, { skuCode: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.priceCents}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { priceCents: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.regularPriceCents}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { regularPriceCents: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.purchaseCost}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { purchaseCost: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    type="number"
                                    className="h-8 w-20 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.stockQuantity}
                                    onChange={e => onUpdateVariant(variant.id, { stockQuantity: Number.parseInt(e.currentTarget.value) || 0 })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-16 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.weight}
                                    placeholder="无"
                                    onChange={e => onUpdateVariant(variant.id, { weight: e.currentTarget.value })}
                                />
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-1">
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="长"
                                        value={variant.length}
                                        onChange={e => onUpdateVariant(variant.id, { length: e.currentTarget.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="宽"
                                        value={variant.width}
                                        onChange={e => onUpdateVariant(variant.id, { width: e.currentTarget.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="高"
                                        value={variant.height}
                                        onChange={e => onUpdateVariant(variant.id, { height: e.currentTarget.value })}
                                    />
                                </div>
                            </td>
                            {validGroups.length > 0 && (
                                <td className="p-3 text-center sticky right-0 bg-background border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ zIndex: 10 }}>
                                    <div className="text-xs text-muted-foreground">按上方筛选批量应用</div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
