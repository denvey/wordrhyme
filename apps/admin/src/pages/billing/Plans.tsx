/**
 * Plans Page — Billing plan management
 *
 * Stats cards at top + AutoCrudTable with "Configure" button.
 */
import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, BarChart3, Users, AlertTriangle } from 'lucide-react';
import { createSelectSchema } from 'drizzle-zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { plans } from '@wordrhyme/db/schema';
import { trpc } from '../../lib/trpc';
import { Card, CardContent, Badge } from '@wordrhyme/ui';

const planSchema = createSelectSchema(plans);

function StatsCards() {
  const { data: stats } = (trpc as any).billing.billingConfig.getStats.useQuery();

  if (!stats) return null;

  const cards = [
    {
      icon: CreditCard,
      label: 'Plans',
      value: stats.planCount,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      icon: Users,
      label: 'Active Subscriptions',
      value: stats.activeSubscriptionCount,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      icon: BarChart3,
      label: 'Procedures',
      value: `${stats.totalProcedureCount - stats.unconfiguredProcedureCount}/${stats.totalProcedureCount}`,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      sub: 'configured',
    },
    {
      icon: AlertTriangle,
      label: 'Unconfigured',
      value: stats.unconfiguredProcedureCount,
      color: stats.unconfiguredProcedureCount > 0 ? 'text-amber-600' : 'text-green-600',
      bg: stats.unconfiguredProcedureCount > 0
        ? 'bg-amber-50 dark:bg-amber-950/30'
        : 'bg-green-50 dark:bg-green-950/30',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {cards.map(({ icon: Icon, label, value, color, bg, sub }) => (
        <Card key={label} className="overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}{sub ? ` ${sub}` : ''}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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
            Manage billing plans and configure entitlements
          </p>
        </div>
      </div>

      <StatsCards />

      <Suspense fallback={<div>Loading...</div>}>
        <PlansContent />
      </Suspense>
    </div>
  );
}

export { PlansPage };
