/**
 * Billing Advanced Settings Page
 *
 * Advanced settings for module defaults.
 * Final entitlements are configured in plan / role pages.
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

export default function BillingSettingsPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Billing Advanced Settings</h1>
          <p className="text-muted-foreground">
            开发者声明仅用于推荐和快捷分组；最终生效的 entitlement 请在套餐或角色配置页维护。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Model</CardTitle>
          <CardDescription>
            平台不再依赖按 procedure 的 billing override 参与运行时决策。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• 开发者元数据用于 UI 默认分组、快捷勾选和 drift 提示。</p>
          <p>• 套餐页/角色页保存的最终配置，才是运行时实际生效的授权结果。</p>
          <p>• 这里保留模块默认值，作为未声明 procedure 的兜底策略。</p>
        </CardContent>
      </Card>

      <ModuleDefaultsTab />
    </div>
  );
}

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
          <CardDescription>Set default billing subject for undeclared procedures in a plugin</CardDescription>
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
            <Label>Default Subject (or \"free\")</Label>
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

export { BillingSettingsPage };
