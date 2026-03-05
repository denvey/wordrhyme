/**
 * Plan Management Page (Task 7.1)
 *
 * CRUD table for billing plans using AutoCrudTable.
 */
import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { createSelectSchema } from 'drizzle-zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { plans } from '@wordrhyme/db/schema';
import { trpc } from '../../lib/trpc';

const planSchema = createSelectSchema(plans);

function PlansContent() {
  const navigate = useNavigate();
  const resource = useAutoCrudResource({
    router: (trpc as any).billing.plans,
    schema: planSchema,
  });

  return (
    <AutoCrudTable
      title="Plans"
      schema={planSchema}
      resource={resource}
      fields={{
        id: { hidden: true },
        metadata: { hidden: true },
        createdAt: { hidden: true },
        updatedAt: { hidden: true },
        name: { label: 'Plan Name' },
        description: { label: 'Description' },
        interval: { label: 'Billing Interval' },
        intervalCount: { label: 'Interval Count' },
        currency: { label: 'Currency' },
        priceCents: { label: 'Price (cents)' },
        isActive: { label: 'Active' },
      }}
      table={{
        filterModes: ['simple'],
        defaultSort: [{ id: 'createdAt', desc: true }],
      }}
      {...{
        actions: [
          { type: 'view', onClick: (row: any) => navigate(`/settings/billing/plans/${row.id}`) },
          { type: 'custom', label: '配置权益', onClick: (row: any) => navigate(`/settings/billing/plans/${row.id}`) },
          { type: 'edit' },
          { type: 'delete', separator: true },
        ],
      } as any}
    />
  );
}

export default function PlansPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Plans</h1>
          <p className="text-muted-foreground">
            Manage billing plans and pricing
          </p>
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <PlansContent />
      </Suspense>
    </div>
  );
}

export { PlansPage };
