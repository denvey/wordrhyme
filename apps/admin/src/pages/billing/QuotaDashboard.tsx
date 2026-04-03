/**
 * Quota Dashboard Page (Tasks 7.9, 7.10)
 *
 * Shows per-subject quota usage + grant dialog for admins.
 */
import { useState } from 'react';
import { BarChart3, Gift, Save } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useActiveOrganization } from '../../lib/auth-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Input,
  Label,
} from '@wordrhyme/ui';

export default function QuotaDashboardPage() {
  const org = useActiveOrganization();
  const orgId = (org as any)?.data?.id;

  const { data: quotas = [], refetch } = (trpc as any).billing.getTenantQuotas.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId },
  );

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Quota Dashboard</h1>
          <p className="text-muted-foreground">View and manage resource quotas</p>
        </div>
        <div className="ml-auto">
          <GrantQuotaDialog organizationId={orgId} onSuccess={refetch} />
        </div>
      </div>

      {quotas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No quotas provisioned yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotas.map((q: any) => {
            const used = (q.totalGranted ?? 0) - (q.totalBalance ?? 0);
            const total = q.totalGranted ?? 0;
            const pct = total > 0 ? Math.round((used / total) * 100) : 0;

            return (
              <Card key={q.subject}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono">{q.subject}</CardTitle>
                  <CardDescription>
                    {q.bucketCount ?? 0} bucket(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{used} used</span>
                    <span>{q.totalBalance ?? 0} remaining</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pct}% used of {total} total
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Admin Grant Quota Dialog (Task 7.10) */
function GrantQuotaDialog({ organizationId, onSuccess }: { organizationId: string | undefined; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    amount: 100,
    sourceId: 'admin-grant-' + Date.now(),
  });

  const mutation = (trpc as any).billing.grantTenantQuota.useMutation({
    onSuccess: () => { toast.success('Quota granted'); setOpen(false); onSuccess(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!organizationId) return;
    mutation.mutate({
      organizationId,
      subject: form.subject,
      amount: form.amount,
      priority: 100,
      sourceType: 'admin_grant',
      sourceId: form.sourceId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Gift className="h-4 w-4 mr-1" /> Grant Quota
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Grant Quota</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Capability Subject</Label>
            <Input
              value={form.subject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, subject: e.target.value })}
              placeholder="core.storage"
            />
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, amount: Number.parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Source ID</Label>
            <Input
              value={form.sourceId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, sourceId: e.target.value })}
              placeholder="admin-grant-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.subject || !organizationId}>
            <Save className="h-4 w-4 mr-1" /> Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { QuotaDashboardPage };
