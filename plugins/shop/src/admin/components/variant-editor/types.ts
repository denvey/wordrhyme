export interface SpecValue {
    id: string;
    name: string;
    image?: string;
}

export interface SpecGroup {
    id: string;
    name: string;
    hasImage: boolean;
    values: SpecValue[];
}

export interface VariantData {
    id: string; // "new-xxx" for unsaved, or real skuId
    skuCode: string;
    priceCents: string;
    regularPriceCents: string;
    purchaseCost: string;
    stockQuantity: number;
    weight: string;
    length: string;
    width: string;
    height: string;
    image?: string;
    // Map of spec group ID to the spec value ID it represents
    options: Record<string, string>; 
}
