import type { SpecGroup, VariantData } from './types';

// cartesian product of arrays
export function cartesian<T>(...a: T[][]): T[][] {
    return a.reduce<T[][]>((acc, arr) => 
        acc.flatMap(d => arr.map(e => [...d, e])), 
    [[]]);
}

export function generateVariants(
    specGroups: SpecGroup[],
    existingVariants: VariantData[]
): VariantData[] {
    // If no specs or empty spec values in all groups, return empty
    const validGroups = specGroups.filter(g => g.values.length > 0);
    if (validGroups.length === 0) return [];

    // Group values by SpecGroup ID to create permutations
    const valueSets = validGroups.map(group =>
        group.values.map(val => ({ groupId: group.id, valueId: val.id }))
    );

    const permutations = cartesian(...valueSets);

    return permutations.map(combo => {
        // Find existing variant for this exact combination
        const options: Record<string, string> = {};
        for (const item of combo) {
            options[item.groupId] = item.valueId;
        }

        const existing = existingVariants.find(v => {
            // Check if every key matches
            return Object.entries(options).every(
                ([k, vId]) => v.options[k] === vId
            ) && Object.keys(v.options).length === Object.keys(options).length;
        });

        if (existing) {
            return existing;
        }

        // Return a fresh variant
        return {
            id: `new-${crypto.randomUUID()}`,
            skuCode: '',
            priceCents: '',
            regularPriceCents: '',
            purchaseCost: '',
            stockQuantity: 0,
            weight: '',
            length: '',
            width: '',
            height: '',
            image: '',
            options,
        };
    });
}
