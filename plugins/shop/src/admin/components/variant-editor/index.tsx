import React, { useEffect } from 'react';
import type { SpecGroup, VariantData } from './types';
import { useVariantEditor } from './useVariantEditor';
import { SpecDefiner } from './SpecDefiner';
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
        <div className="space-y-6">            <SpecDefiner
                groups={specGroups}
                onAddGroup={addSpecGroup}
                onUpdateGroup={updateSpecGroup}
                onRemoveGroup={removeSpecGroup}
                onAddValue={addSpecValue}
                onUpdateValue={updateSpecValue}
                onRemoveValue={removeSpecValue}
                onReorderGroups={reorderSpecGroups}
                onReorderValues={reorderSpecValues}
            />

            {specGroups.some(g => g.values.length > 0) && (
                <div className="space-y-3 mt-8">
                    <VariantTable
                        specGroups={specGroups}
                        variants={variants}
                        onUpdateVariant={updateVariant}
                        onApplyBatchSettings={applyBatchSettings}
                    />
                </div>
            )}
        </div>
    );
}

export type { SpecGroup, SpecValue, VariantData } from './types';
export { ParameterEditor, type CustomParameter } from './ParameterEditor';
