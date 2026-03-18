import type { I18nField } from './i18n-field';

export interface VariantCombination {
    attributeValues: Array<{
        attributeId: string;
        valueId: string;
        slug: string;
    }>;
    suggestedName: I18nField;
}

export const RECOMMENDED_MAX_VARIANTS = 100;

/**
 * Generate variant matrix from variation attributes (cartesian product).
 *
 * Example: 2 attributes (3 values x 2 values) → 6 combinations.
 */
export function generateVariantMatrix(
    variationAttributes: Array<{
        attributeId: string;
        values: Array<{ id: string; slug: string; value: I18nField }>;
    }>,
): VariantCombination[] {
    if (variationAttributes.length === 0) return [];

    // Start with first attribute's values as seeds
    let combinations: VariantCombination[] = variationAttributes[0]!.values.map((v) => ({
        attributeValues: [
            { attributeId: variationAttributes[0]!.attributeId, valueId: v.id, slug: v.slug },
        ],
        suggestedName: { ...v.value },
    }));

    // Cartesian product with remaining attributes
    for (let i = 1; i < variationAttributes.length; i++) {
        const attr = variationAttributes[i]!;
        const next: VariantCombination[] = [];

        for (const combo of combinations) {
            for (const val of attr.values) {
                const name: I18nField = {};
                for (const [locale, existing] of Object.entries(combo.suggestedName)) {
                    const valText = val.value[locale] ?? val.slug;
                    name[locale] = `${existing}-${valText}`;
                }
                next.push({
                    attributeValues: [
                        ...combo.attributeValues,
                        { attributeId: attr.attributeId, valueId: val.id, slug: val.slug },
                    ],
                    suggestedName: name,
                });
            }
        }

        combinations = next;
    }

    return combinations;
}
