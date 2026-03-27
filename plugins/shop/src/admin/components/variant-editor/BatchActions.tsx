import React, { useState } from 'react';
import type { VariantData } from './types';

interface BatchActionsProps {
    onApply: (data: Partial<VariantData>) => void;
}

export function BatchActions({ onApply }: BatchActionsProps) {
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

    const handleApply = () => {
        const payload: Partial<VariantData> = {};
        if (batchData.priceCents !== '') payload.priceCents = batchData.priceCents;
        if (batchData.regularPriceCents !== '') payload.regularPriceCents = batchData.regularPriceCents;
        if (batchData.purchaseCost !== '') payload.purchaseCost = batchData.purchaseCost;
        if (batchData.stockQuantity !== '') payload.stockQuantity = parseInt(batchData.stockQuantity) || 0;
        if (batchData.weight !== '') payload.weight = batchData.weight;
        if (batchData.length !== '') payload.length = batchData.length;
        if (batchData.width !== '') payload.width = batchData.width;
        if (batchData.height !== '') payload.height = batchData.height;

        onApply(payload);
    };

    return (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-lg border">
            <div>
                <label className="text-xs text-muted-foreground block mb-1">售价</label>
                <input
                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm"
                    value={batchData.priceCents}
                    onChange={e => setBatchData({ ...batchData, priceCents: e.target.value })}
                />
            </div>
            <div>
                <label className="text-xs text-muted-foreground block mb-1">划线价</label>
                <input
                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm"
                    value={batchData.regularPriceCents}
                    onChange={e => setBatchData({ ...batchData, regularPriceCents: e.target.value })}
                />
            </div>
            <div>
                <label className="text-xs text-muted-foreground block mb-1">成本价</label>
                <input
                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm"
                    value={batchData.purchaseCost}
                    onChange={e => setBatchData({ ...batchData, purchaseCost: e.target.value })}
                />
            </div>
            <div>
                <label className="text-xs text-muted-foreground block mb-1">库存</label>
                <input
                    type="number"
                    className="h-8 w-24 rounded border border-input bg-transparent px-2 text-sm"
                    value={batchData.stockQuantity}
                    onChange={e => setBatchData({ ...batchData, stockQuantity: e.target.value })}
                />
            </div>
            <div>
                <label className="text-xs text-muted-foreground block mb-1">重量(g)</label>
                <input
                    className="h-8 w-20 rounded border border-input bg-transparent px-2 text-sm"
                    value={batchData.weight}
                    onChange={e => setBatchData({ ...batchData, weight: e.target.value })}
                />
            </div>
            <div>
                <label className="text-xs text-muted-foreground block mb-1">长宽高</label>
                <div className="flex gap-1">
                    <input
                        className="h-8 w-14 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="长"
                        value={batchData.length}
                        onChange={e => setBatchData({ ...batchData, length: e.target.value })}
                    />
                    <input
                        className="h-8 w-14 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="宽"
                        value={batchData.width}
                        onChange={e => setBatchData({ ...batchData, width: e.target.value })}
                    />
                    <input
                        className="h-8 w-14 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="高"
                        value={batchData.height}
                        onChange={e => setBatchData({ ...batchData, height: e.target.value })}
                    />
                </div>
            </div>
            <button
                className="h-8 px-4 font-medium text-sm text-primary-foreground bg-primary rounded"
                onClick={handleApply}
            >
                批量设置
            </button>
        </div>
    );
}
