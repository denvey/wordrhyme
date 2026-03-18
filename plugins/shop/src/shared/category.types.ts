import type { I18nField } from './i18n-field';

export const MAX_CATEGORY_DEPTH = 5;

export interface Category {
    id: string;
    name: I18nField;
    slug: string;
    description?: I18nField;
    mainImage?: string;
    parentId?: string | null;
    nestedLevel: number;
    sortOrder: number;
    isEnabled: boolean;
    seoTitle?: I18nField;
    seoDescription?: I18nField;
    organizationId: string;
    aclTags: string[];
    denyTags: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CategoryTree extends Category {
    children: CategoryTree[];
}
