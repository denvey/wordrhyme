/**
 * Subscription Management Page (Task 7.8)
 *
 * Lists and manages subscriptions for the current organization.
 */
import { useState } from 'react';
import { Receipt, XCircle, ArrowUpDown } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useActiveOrganization } from '../../lib/auth-client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@wordrhyme/ui';

export default function SubscriptionsPage() {
  const org = useActiveOrganization();
  const orgId = (org as any)?.data?.id;

  const { data: subscriptions = [], refetch } = (trpc as any).billing.getAllTenantSubscriptions.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId },
  );

  const cancelMutation = (trpc as any).billing.cancelSubscription.useMutation({
    onSuccess: () => { toast.success('Subscription canceled'); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColors: Record<string, string> = {
    active: 'default',
    trialing: 'secondary',
    past_due: 'destructive',
    canceled: 'outline',
    expired: 'outline',
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <Receipt className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">Manage active and historical subscriptions</p>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No subscriptions found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Plan: {sub.planId}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant={statusColors[sub.status] as any || 'outline'}>
                      {sub.status}
                    </Badge>
                    {sub.cancelAtPeriodEnd && <Badge variant="outline">Cancels at period end</Badge>}
                    {sub.scheduledPlanId && (
                      <Badge variant="outline">
                        <ArrowUpDown className="h-3 w-3 mr-1" />
                        Changing to: {sub.scheduledPlanId}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Period: {new Date(sub.currentPeriodStart).toLocaleDateString()} — {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    {sub.renewalCount > 0 && ` | Renewals: ${sub.renewalCount}`}
                  </p>
                </div>
                {['active', 'trialing'].includes(sub.status) && (
                  <div className="flex gap-2">
                    <ChangePlanDialog subscriptionId={sub.id} onSuccess={refetch} />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate({ subscriptionId: sub.id })}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangePlanDialog({ subscriptionId, onSuccess }: { subscriptionId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');

  const mutation = (trpc as any).billing.changePlan.useMutation({
    onSuccess: () => { toast.success('Plan change scheduled'); setOpen(false); onSuccess(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowUpDown className="h-4 w-4 mr-1" /> Change Plan
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Change Plan</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New Plan ID</Label>
            <Input value={newPlanId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPlanId(e.target.value)} placeholder="plan_id" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate({ subscriptionId, newPlanId })} disabled={!newPlanId}>
            Confirm Change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SubscriptionsPage };
