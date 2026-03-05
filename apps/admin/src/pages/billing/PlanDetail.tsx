/**
 * Plan Detail Page (Tasks 7.2, 7.3)
 *
 * Shows plan info + PlanItem configuration with capability selector.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Badge,
} from '@wordrhyme/ui';

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  const { data: plan, isLoading } = (trpc as any).billing.plans.getWithItems.useQuery(
    { id: planId! },
    { enabled: !!planId },
  );

  const { data: items = [], refetch: refetchItems } = (trpc as any).billing.planItems.list.useQuery(
    { planId: planId! },
    { enabled: !!planId },
  );

  const deleteMutation = (trpc as any).billing.planItems.delete.useMutation({
    onSuccess: () => {
      toast.success('Plan item deleted');
      refetchItems();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) return <div className="container mx-auto py-8">Loading...</div>;
  if (!plan) return <div className="container mx-auto py-8">Plan not found</div>;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings/billing/plans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{plan.name}</h1>
          <p className="text-muted-foreground">{plan.description}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
            {plan.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant="outline">
            {plan.priceCents / 100} {plan.currency?.toUpperCase()} / {plan.interval}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Plan Items (Capabilities)</CardTitle>
          <AddPlanItemDialog planId={planId!} onSuccess={refetchItems} />
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No capabilities configured. Add one to define what this plan includes.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="py-2">Capability</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Limit</th>
                  <th className="py-2">Reset</th>
                  <th className="py-2">Overage</th>
                  <th className="py-2">Scope</th>
                  <th className="py-2 w-[50px]" />
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2 font-mono text-sm">{item.subject}</td>
                    <td className="py-2">
                      <Badge variant="outline">{item.type}</Badge>
                    </td>
                    <td className="py-2">{item.type === 'metered' ? item.amount ?? 'Unlimited' : '-'}</td>
                    <td className="py-2">{item.resetStrategy} / {item.resetMode}</td>
                    <td className="py-2">{item.overagePolicy}</td>
                    <td className="py-2">{item.quotaScope}</td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Dialog for adding a plan item with capability selector (Task 7.3)
 */
function AddPlanItemDialog({ planId, onSuccess }: { planId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    subject: '',
    type: 'metered' as 'boolean' | 'metered',
    amount: 100,
    resetMode: 'period' as 'period' | 'never',
    overagePolicy: 'deny' as 'deny' | 'charge' | 'throttle' | 'downgrade',
    overagePriceCents: 0,
    resetStrategy: 'hard' as 'hard' | 'soft' | 'capped',
    resetCap: 0,
    quotaScope: 'tenant' as 'tenant' | 'user',
  });

  const { data: capabilities = [] } = (trpc as any).billing.capabilities.list.useQuery(
    { status: 'approved', search: search || undefined },
    { enabled: open },
  );

  const createMutation = (trpc as any).billing.planItems.create.useMutation({
    onSuccess: () => {
      toast.success('Plan item added');
      setOpen(false);
      onSuccess();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = () => {
    createMutation.mutate({
      planId,
      subject: form.subject,
      type: form.type,
      amount: form.type === 'metered' ? form.amount : undefined,
      resetMode: form.resetMode,
      overagePolicy: form.overagePolicy,
      overagePriceCents: form.overagePolicy === 'charge' ? form.overagePriceCents : undefined,
      resetStrategy: form.resetStrategy,
      resetCap: form.resetStrategy === 'capped' ? form.resetCap : undefined,
      quotaScope: form.quotaScope,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Capability
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Plan Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Capability</Label>
            <Input
              placeholder="Search capabilities..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
            <div className="max-h-32 overflow-y-auto border rounded-md">
              {capabilities.map((cap: any) => (
                <button
                  key={cap.subject}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                    form.subject === cap.subject ? 'bg-accent font-medium' : ''
                  }`}
                  onClick={() => setForm({ ...form, subject: cap.subject, type: cap.type })}
                >
                  <span className="font-mono">{cap.subject}</span>
                  <span className="text-muted-foreground ml-2">({cap.type})</span>
                  {cap.description && (
                    <span className="text-muted-foreground ml-2 text-xs">- {cap.description}</span>
                  )}
                </button>
              ))}
              {capabilities.length === 0 && (
                <p className="text-muted-foreground text-center py-4 text-sm">No approved capabilities found</p>
              )}
            </div>
          </div>

          {form.type === 'metered' && (
            <div className="space-y-2">
              <Label>Quota Limit</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, amount: parseInt(e.target.value) || 0 })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Reset Mode</Label>
              <Select value={form.resetMode} onValueChange={(v: string) => setForm({ ...form, resetMode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="period">Per Period</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Overage Policy</Label>
              <Select value={form.overagePolicy} onValueChange={(v: string) => setForm({ ...form, overagePolicy: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deny">Deny</SelectItem>
                  <SelectItem value="charge">Charge</SelectItem>
                  <SelectItem value="throttle">Throttle</SelectItem>
                  <SelectItem value="downgrade">Downgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.overagePolicy === 'charge' && (
            <div className="space-y-2">
              <Label>Overage Price (cents per unit)</Label>
              <Input
                type="number"
                value={form.overagePriceCents}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, overagePriceCents: parseInt(e.target.value) || 0 })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Reset Strategy</Label>
              <Select value={form.resetStrategy} onValueChange={(v: string) => setForm({ ...form, resetStrategy: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hard">Hard Reset</SelectItem>
                  <SelectItem value="soft">Soft (Rollover)</SelectItem>
                  <SelectItem value="capped">Capped Rollover</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quota Scope</Label>
              <Select value={form.quotaScope} onValueChange={(v: string) => setForm({ ...form, quotaScope: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.subject || createMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PlanDetailPage };
