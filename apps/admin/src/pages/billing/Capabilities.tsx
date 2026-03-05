/**
 * Capability Approval Page (Task 7.4)
 *
 * Lists pending capabilities for platform admin to approve/reject.
 */
import { useState } from 'react';
import { Shield, Check, X, RefreshCw } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@wordrhyme/ui';

export default function CapabilitiesPage() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const { data: capabilities = [], refetch } = (trpc as any).billing.capabilities.list.useQuery(
    { status: statusFilter },
  );

  const reviewMutation = (trpc as any).billing.capabilities.review.useMutation({
    onSuccess: () => {
      toast.success('Capability reviewed');
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Capabilities</h1>
          <p className="text-muted-foreground">
            Review and approve plugin capabilities for billing
          </p>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {capabilities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No {statusFilter} capabilities found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {capabilities.map((cap: any) => (
            <Card key={cap.subject}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-medium">{cap.subject}</p>
                  <p className="text-sm text-muted-foreground">{cap.description || 'No description'}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">{cap.type}</Badge>
                    <Badge variant="secondary">{cap.source}</Badge>
                    {cap.unit && <Badge variant="outline">Unit: {cap.unit}</Badge>}
                    {cap.pluginId && <Badge variant="outline">Plugin: {cap.pluginId}</Badge>}
                  </div>
                </div>
                {statusFilter === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => reviewMutation.mutate({ subject: cap.subject, action: 'approve' })}
                      disabled={reviewMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reviewMutation.mutate({ subject: cap.subject, action: 'reject' })}
                      disabled={reviewMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
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

export { CapabilitiesPage };
