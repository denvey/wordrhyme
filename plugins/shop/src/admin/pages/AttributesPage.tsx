import React, { useState } from 'react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { useShopApi } from '../trpc';
import { attributeSchema } from '../schemas';

export function AttributesPage() {
    const shopApi = useShopApi();
    const resource = useAutoCrudResource({
        router: shopApi.attributes as any,
        schema: attributeSchema,
    });

    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Attributes</h1>
                <p className="text-muted-foreground text-sm">Manage product attributes and their values</p>
            </div>

            <AutoCrudTable
                title="Attributes"
                schema={attributeSchema}
                resource={resource}
                fields={{
                    id: { hidden: true },
                    organizationId: { hidden: true },
                    aclTags: { hidden: true },
                    denyTags: { hidden: true },
                    createdAt: { hidden: true },
                    updatedAt: { hidden: true },
                    name: { label: 'Name' },
                    slug: { label: 'Slug' },
                    type: { label: 'Type' },
                    sortOrder: { label: 'Sort Order' },
                }}
                table={{
                    filterModes: ['simple'],
                    defaultSort: [{ id: 'sortOrder', desc: false }],
                }}
            />

            {/* TODO: Attribute values panel - expand per row to manage values */}
        </div>
    );
}

export default AttributesPage;
