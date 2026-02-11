/**
 * Languages Management Page
 *
 * Manage supported languages for the organization.
 * Uses tablecn pattern: generate Zod schema directly from Drizzle table.
 *
 * @see design.md D1: 语言管理
 */
import { Suspense } from 'react';
import { Languages } from 'lucide-react';
import { createSelectSchema } from 'drizzle-zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { i18nLanguages } from '@wordrhyme/db/schema';
import { trpc } from '../../lib/trpc';

// Generate Zod schema directly from Drizzle table - no intermediate layer needed
const languageSchema = createSelectSchema(i18nLanguages);

function LanguagesContent() {
  const resource = useAutoCrudResource({
    router: trpc.i18n.languages as any,
    schema: languageSchema,
  });

  return (
    <AutoCrudTable
      title="Languages"
      schema={languageSchema}
      resource={resource}
      fields={{
        id: { hidden: true },
        organizationId: { hidden: true },
        createdAt: { hidden: true },
        updatedAt: { hidden: true },
        locale: { label: 'Locale Code' },
        nativeName: { label: 'Native Name' },
        direction: { label: 'Text Direction' },
        isDefault: { label: 'Default' },
        isEnabled: { label: 'Status' },
        sortOrder: { label: 'Order' },
      }}
      table={{
        filterModes: ['simple', 'advanced'],
        defaultSort: [{ id: 'createdAt', desc: true }],
      }}
    />
  );
}

export default function LanguagesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <Languages className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Languages</h1>
          <p className="text-muted-foreground">
            Manage supported languages and locales for your organization
          </p>
        </div>
      </div>

      <Suspense fallback={<div>加载中...</div>}>
        <LanguagesContent />
      </Suspense>
    </div>
  );
}

export { LanguagesPage };
