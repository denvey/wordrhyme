import React, { useEffect } from 'react';
import type { SpecGroup, VariantData } from './types';
import { useVariantEditor } from './useVariantEditor';
import { SpecDefiner } from './SpecDefiner';
import { BatchActions } from './BatchActions';
import { VariantTable } from './VariantTable';

interface VariantEditorProps {
    initialSpecs?: SpecGroup[];
    initialVariants?: VariantData[];
    onChange?: (specs: SpecGroup[], variants: VariantData[]) => void;
}

export function VariantEditor({ initialSpecs = [], initialVariants = [], onChange }: VariantEditorProps) {
    const {
        specGroups,
        variants,
        addSpecGroup,
        updateSpecGroup,
        removeSpecGroup,
        addSpecValue,
        updateSpecValue,
        removeSpecValue,
        reorderSpecGroups,
        reorderSpecValues,
        updateVariant,
        applyBatchSettings,
    } = useVariantEditor(initialSpecs, initialVariants);

    // Sync upward if needed
    useEffect(() => {
        if (onChange) {
            onChange(specGroups, variants);
        }
    }, [specGroups, variants, onChange]);

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-900">
                <span className="font-semibold text-blue-700 dark:text-blue-300">商品规格配置：</span>您可以拖拽排序规格名与属性值。表格将实时合并和生成对应交叉 SKU。
            </div>

            <SpecDefiner
                groups={specGroups}
                onAddGroup={addSpecGroup}
                onUpdateGroup={updateSpecGroup}
                onRemoveGroup={removeSpecGroup}
                onAddValue={addSpecValue}
                onRemoveValue={removeSpecValue}
                onReorderGroups={reorderSpecGroups}
                onReorderValues={reorderSpecValues}
            />

            {specGroups.some(g => g.values.length > 0) && (
                <div className="space-y-3 mt-8">
                    <BatchActions onApply={applyBatchSettings} />
                    <VariantTable
                        specGroups={specGroups}
                        variants={variants}
                        onUpdateVariant={updateVariant}
                    />
                </div>
            )}
        </div>
    );
}

export type { SpecGroup, SpecValue, VariantData } from './types';
