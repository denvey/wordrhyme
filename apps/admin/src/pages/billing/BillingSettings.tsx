/**
 * Billing Settings Page (Tasks 7.5, 7.6, 7.7)
 *
 * Tabs: L4 Override | L2 Module Default | Default Policy
 */
import { useState } from 'react';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@wordrhyme/ui';

type Tab = 'overrides' | 'modules' | 'policy';

export default function BillingSettingsPage() {
  const [tab, setTab] = useState<Tab>('overrides');

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Billing Settings</h1>
          <p className="text-muted-foreground">
            Configure billing overrides, module defaults, and default policy
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b pb-2">
        {([
          { key: 'overrides' as Tab, label: 'L4 Overrides' },
          { key: 'modules' as Tab, label: 'L2 Module Defaults' },
          { key: 'policy' as Tab, label: 'Default Policy' },
        ]).map(({ key, label }) => (
          <Button
            key={key}
            variant={tab === key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'overrides' && <OverridesTab />}
      {tab === 'modules' && <ModuleDefaultsTab />}
      {tab === 'policy' && <DefaultPolicyTab />}
    </div>
  );
}

/** L4 Override Management (Task 7.5) */
function OverridesTab() {
  const { data: overrides = [], refetch } = (trpc as any).billing.billingConfig.listOverrides.useQuery({});

  const deleteMutation = (trpc as any).billing.billingConfig.deleteOverride.useMutation({
    onSuccess: () => { toast.success('Override deleted'); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>L4 Procedure Overrides</CardTitle>
          <CardDescription>Override billing subject for specific plugin procedures</CardDescription>
        </div>
        <AddOverrideDialog onSuccess={refetch} />
      </CardHeader>
      <CardContent>
        {overrides.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No overrides configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Plugin</th>
                <th className="py-2">Procedure</th>
                <th className="py-2">Subject</th>
                <th className="py-2 w-[50px]" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o: any) => (
                <tr key={o.key} className="border-b">
                  <td className="py-2 font-mono">{o.pluginId}</td>
                  <td className="py-2 font-mono">{o.procedureName}</td>
                  <td className="py-2">
                    {o.subject === 'free' ? (
                      <Badge variant="secondary">free</Badge>
                    ) : (
                      <span className="font-mono">{o.subject}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ pluginId: o.pluginId, procedureName: o.procedureName })}
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
  );
}

function AddOverrideDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pluginId: '', procedureName: '', subject: '' });

  const mutation = (trpc as any).billing.billingConfig.setOverride.useMutation({
    onSuccess: () => { toast.success('Override added'); setOpen(false); onSuccess(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Override</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add L4 Override</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plugin ID</Label>
            <Input value={form.pluginId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, pluginId: e.target.value })} placeholder="hello-world" />
          </div>
          <div className="space-y-2">
            <Label>Procedure Name</Label>
            <Input value={form.procedureName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, procedureName: e.target.value })} placeholder="sayHello" />
          </div>
          <div className="space-y-2">
            <Label>Subject (or "free")</Label>
            <Input value={form.subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, subject: e.target.value })} placeholder="plugin.premium" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.pluginId || !form.procedureName || !form.subject}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** L2 Module Default Management (Task 7.6) */
function ModuleDefaultsTab() {
  const { data: defaults = [], refetch } = (trpc as any).billing.billingConfig.listModuleDefaults.useQuery();

  const deleteMutation = (trpc as any).billing.billingConfig.deleteModuleDefault.useMutation({
    onSuccess: () => { toast.success('Module default deleted'); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>L2 Module Defaults</CardTitle>
          <CardDescription>Set default billing subject for all undeclared procedures in a plugin</CardDescription>
        </div>
        <AddModuleDefaultDialog onSuccess={refetch} />
      </CardHeader>
      <CardContent>
        {defaults.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No module defaults configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Plugin</th>
                <th className="py-2">Default Subject</th>
                <th className="py-2 w-[50px]" />
              </tr>
            </thead>
            <tbody>
              {defaults.map((d: any) => (
                <tr key={d.key} className="border-b">
                  <td className="py-2 font-mono">{d.pluginId}</td>
                  <td className="py-2">
                    {d.subject === 'free' ? (
                      <Badge variant="secondary">free</Badge>
                    ) : (
                      <span className="font-mono">{d.subject}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ pluginId: d.pluginId })}>
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
  );
}

function AddModuleDefaultDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pluginId: '', subject: '' });

  const mutation = (trpc as any).billing.billingConfig.setModuleDefault.useMutation({
    onSuccess: () => { toast.success('Module default added'); setOpen(false); onSuccess(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Default</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Module Default</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plugin ID</Label>
            <Input value={form.pluginId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, pluginId: e.target.value })} placeholder="my-plugin" />
          </div>
          <div className="space-y-2">
            <Label>Default Subject (or "free")</Label>
            <Input value={form.subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, subject: e.target.value })} placeholder="plugin.defaultCap" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.pluginId || !form.subject}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Default Policy Configuration (Task 7.7) */
function DefaultPolicyTab() {
  const { data, refetch } = (trpc as any).billing.billingConfig.getDefaultPolicy.useQuery();

  const mutation = (trpc as any).billing.billingConfig.setDefaultPolicy.useMutation({
    onSuccess: () => { toast.success('Default policy updated'); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const currentPolicy = data?.policy ?? 'allow';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Undeclared Policy</CardTitle>
        <CardDescription>
          What happens when a plugin procedure has no billing subject at any layer (L4/L3/L2).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {(['allow', 'deny', 'audit'] as const).map((policy) => (
            <Button
              key={policy}
              variant={currentPolicy === policy ? 'default' : 'outline'}
              onClick={() => mutation.mutate({ policy })}
              disabled={mutation.isPending}
            >
              {policy === 'allow' && 'Allow (no billing check)'}
              {policy === 'deny' && 'Deny (block access)'}
              {policy === 'audit' && 'Audit (allow + log)'}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Current policy: <Badge variant="outline">{currentPolicy}</Badge>
        </p>
      </CardContent>
    </Card>
  );
}

export { BillingSettingsPage };
