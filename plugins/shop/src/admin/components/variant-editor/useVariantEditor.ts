import { useState, useEffect } from 'react';
import type { SpecGroup, SpecValue, VariantData } from './types';
import { generateVariants } from './utils';

export function useVariantEditor(initialSpecs: SpecGroup[], initialVariants: VariantData[]) {
    const [specGroups, setSpecGroups] = useState<SpecGroup[]>(initialSpecs);
    const [variants, setVariants] = useState<VariantData[]>(initialVariants);

    // Auto-sync variants when specGroups change
    useEffect(() => {
        setVariants(prev => generateVariants(specGroups, prev));
    }, [specGroups]);

    const addSpecGroup = (name: string) => {
        setSpecGroups(prev => [
            ...prev,
            {
                id: `group-${crypto.randomUUID()}`,
                name,
                hasImage: false,
                values: [],
            },
        ]);
    };

    const updateSpecGroup = (groupId: string, data: Partial<SpecGroup>) => {
        setSpecGroups(prev =>
            prev.map(g => (g.id === groupId ? { ...g, ...data } : g))
        );
    };

    const removeSpecGroup = (groupId: string) => {
        setSpecGroups(prev => prev.filter(g => g.id !== groupId));
    };

    const addSpecValue = (groupId: string, valueName: string) => {
        setSpecGroups(prev =>
            prev.map(g => {
                if (g.id !== groupId) return g;
                return {
                    ...g,
                    values: [
                        ...g.values,
                        { id: `value-${crypto.randomUUID()}`, name: valueName },
                    ],
                };
            })
        );
    };

    const updateSpecValue = (groupId: string, valueId: string, data: Partial<SpecValue>) => {
        setSpecGroups(prev =>
            prev.map(g => {
                if (g.id !== groupId) return g;
                return {
                    ...g,
                    values: g.values.map(v => (v.id === valueId ? { ...v, ...data } : v)),
                };
            })
        );
    };

    const removeSpecValue = (groupId: string, valueId: string) => {
        setSpecGroups(prev =>
            prev.map(g => {
                if (g.id !== groupId) return g;
                return {
                    ...g,
                    values: g.values.filter(v => v.id !== valueId),
                };
            })
        );
    };

    const reorderSpecGroups = (oldIndex: number, newIndex: number) => {
        setSpecGroups(prev => {
            const arr = [...prev];
            const [moved] = arr.splice(oldIndex, 1);
            arr.splice(newIndex, 0, moved);
            return arr;
        });
    };

    const reorderSpecValues = (groupId: string, oldIndex: number, newIndex: number) => {
        setSpecGroups(prev =>
            prev.map(g => {
                if (g.id !== groupId) return g;
                const arr = [...g.values];
                const [moved] = arr.splice(oldIndex, 1);
                arr.splice(newIndex, 0, moved);
                return { ...g, values: arr };
            })
        );
    };

    // Variant table functions
    const updateVariant = (variantId: string, data: Partial<VariantData>) => {
        setVariants(prev =>
            prev.map(v => (v.id === variantId ? { ...v, ...data } : v))
        );
    };

    const applyBatchSettings = (data: Partial<VariantData>, filters?: Record<string, string>) => {
        setVariants(prev =>
            prev.map(v => {
                // Check if it passes filters
                if (filters) {
                    const pass = Object.entries(filters).every(([groupId, valId]) => {
                        return !valId || v.options[groupId] === valId;
                    });
                    if (!pass) return v;
                }

                return {
                    ...v,
                    ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
                    ...(data.regularPriceCents !== undefined && { regularPriceCents: data.regularPriceCents }),
                    ...(data.purchaseCost !== undefined && { purchaseCost: data.purchaseCost }),
                    ...(data.stockQuantity !== undefined && { stockQuantity: data.stockQuantity }),
                    ...(data.weight !== undefined && { weight: data.weight }),
                    ...(data.length !== undefined && { length: data.length }),
                    ...(data.width !== undefined && { width: data.width }),
                    ...(data.height !== undefined && { height: data.height }),
                };
            })
        );
    };

    return {
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
        setSpecGroups,
        setVariants,
    };
}
