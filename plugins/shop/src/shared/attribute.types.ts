import type { I18nField } from './i18n-field';

export type AttributeType = 'select' | 'multiselect' | 'text';

export interface Attribute {
    id: string;
    name: I18nField;
    slug: string;
    type: AttributeType;
    sortOrder: number;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
}

export interface AttributeValue {
    id: string;
    attributeId: string;
    value: I18nField;
    slug: string;
    colorHex?: string;
    image?: string;
    sortOrder: number;
    organizationId: string;
    createdAt: string;
}

export interface ProductAttribute {
    id: string;
    productId: string;
    attributeId: string;
    visible: boolean;
    isVariation: boolean;
    sortOrder: number;
    organizationId: string;
}
