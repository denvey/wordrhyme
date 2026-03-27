import React, { useMemo } from 'react';
import type { SpecGroup, VariantData } from './types';
import { Plus } from 'lucide-react';

interface VariantTableProps {
    specGroups: SpecGroup[];
    variants: VariantData[];
    onUpdateVariant: (id: string, data: Partial<VariantData>) => void;
}

export function VariantTable({ specGroups, variants, onUpdateVariant }: VariantTableProps) {
    const validGroups = useMemo(() => specGroups.filter(g => g.values.length > 0), [specGroups]);

    // calculate rowspans for each spec group
    // For a group at index i, its rowspan is the product of lengths of all validGroups from i+1 to end.
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

    return (
        <div className="border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 border-b">
                    <tr>
                        {validGroups.map(g => (
                            <th key={g.id} className="p-3 font-medium min-w-[80px]">
                                {g.name}
                            </th>
                        ))}
                        <th className="p-3 font-medium min-w-[100px]">规格配图</th>
                        <th className="p-3 font-medium min-w-[120px]">SKU 编码</th>
                        <th className="p-3 font-medium min-w-[100px]">售价</th>
                        <th className="p-3 font-medium min-w-[100px]">划线价</th>
                        <th className="p-3 font-medium min-w-[100px]">成本价</th>
                        <th className="p-3 font-medium min-w-[80px]">库存</th>
                        <th className="p-3 font-medium min-w-[80px]">重量(g)</th>
                        <th className="p-3 font-medium min-w-[180px]">长 x 宽 x 高</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {variants.map((variant, rowIndex) => (
                        <tr key={variant.id} className="hover:bg-muted/30 transition-colors">
                            {/* Render dynamic spec columns with rowspan */}
                            {validGroups.map((g, colIndex) => {
                                const span = rowSpans[colIndex];
                                // Render td only if this is the first row of the rowspan block
                                if (rowIndex % span === 0) {
                                    const valueId = variant.options[g.id];
                                    const valueName = g.values.find(v => v.id === valueId)?.name || '-';
                                    return (
                                        <td
                                            key={g.id}
                                            rowSpan={span}
                                            className="p-3 align-top bg-background border-r"
                                        >
                                            <div className="pt-2">{valueName}</div>
                                        </td>
                                    );
                                }
                                return null;
                            })}

                            <td className="p-3">
                                <div className="w-10 h-10 border border-dashed rounded flex flex-col items-center justify-center bg-muted/20 text-muted-foreground cursor-pointer hover:border-primary hover:text-primary transition-colors">
                                    <Plus className="h-4 w-4" />
                                </div>
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-full rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.skuCode}
                                    placeholder="选填"
                                    onChange={e => onUpdateVariant(variant.id, { skuCode: e.target.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.priceCents}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { priceCents: e.target.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.regularPriceCents}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { regularPriceCents: e.target.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.purchaseCost}
                                    placeholder="0"
                                    onChange={e => onUpdateVariant(variant.id, { purchaseCost: e.target.value })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    type="number"
                                    className="h-8 w-20 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.stockQuantity}
                                    onChange={e => onUpdateVariant(variant.id, { stockQuantity: parseInt(e.target.value) || 0 })}
                                />
                            </td>
                            <td className="p-3">
                                <input
                                    className="h-8 w-16 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary"
                                    value={variant.weight}
                                    placeholder="无"
                                    onChange={e => onUpdateVariant(variant.id, { weight: e.target.value })}
                                />
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-1">
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="长"
                                        value={variant.length}
                                        onChange={e => onUpdateVariant(variant.id, { length: e.target.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="宽"
                                        value={variant.width}
                                        onChange={e => onUpdateVariant(variant.id, { width: e.target.value })}
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <input
                                        className="h-8 w-12 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-primary text-center"
                                        placeholder="高"
                                        value={variant.height}
                                        onChange={e => onUpdateVariant(variant.id, { height: e.target.value })}
                                    />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
