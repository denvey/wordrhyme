/**
 * Plan Detail Page — RBAC-style matrix editor for plan entitlements
 *
 * Uses GroupedCheckboxList with custom renderItem.
 * 2-column grid layout. Metered config shown inline as summary,
 * edited via Dialog.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Search, Settings2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  GroupedCheckboxList,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@wordrhyme/ui';
import type { GroupedCheckboxItem, RenderItemFn, GroupConfig } from '@wordrhyme/ui';

// ─── Types ───

interface ProcedureItem {
  procedureName: string;
  path: string;
  subject: string | null;
  source: string;
  free: boolean;
  declaredSubject: string | null;
}

interface PluginGroup {
  pluginId: string;
  procedures: ProcedureItem[];
  declaredSubjects: string[];
  moduleDefault: string | null;
  configuredCount: number;
  totalCount: number;
}

interface PlanItemConfig {
  subject: string;
  procedurePath?: string;
  groupKey?: string | null;
  type: 'boolean' | 'metered';
  amount?: number;
  resetMode: 'period' | 'never';
  overagePolicy: 'deny' | 'charge' | 'throttle' | 'downgrade';
  overagePriceCents?: number;
  resetStrategy: 'hard' | 'soft' | 'capped';
  resetCap?: number;
  quotaScope: 'tenant' | 'user';
}

function getPlanItemConfigError(config: PlanItemConfig): string | null {
  if (config.type !== 'metered') {
    return null;
  }

  if (config.overagePolicy === 'charge' && !config.overagePriceCents) {
    return 'Overage Price is required when Overage Policy is Charge.';
  }

  if (config.resetStrategy === 'capped' && !config.resetCap) {
    return 'Reset Cap is required when Reset Strategy is Capped.';
  }

  return null;
}

// ─── Metered Config Dialog ───

function MeteredConfigDialog({
  open,
  onOpenChange,
  config,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PlanItemConfig;
  onApply: (updated: Partial<PlanItemConfig>) => void;
}) {
  const [local, setLocal] = useState(config);
  const validationError = getPlanItemConfigError(local);

  useEffect(() => {
    if (open) setLocal(config);
  }, [open, config]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Entitlement Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={local.type} onValueChange={(v: string) => setLocal({ ...local, type: v as any, ...(v === 'metered' && !local.amount ? { amount: 100 } : {}) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="boolean">Boolean (on/off)</SelectItem>
                <SelectItem value="metered">Metered (quota)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Metered fields (only shown when type is metered) */}
          {local.type === 'metered' && (
            <>
              <div className="space-y-2">
                <Label>Quota Limit</Label>
                <Input
                  type="number"
                  value={local.amount ?? 100}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLocal({ ...local, amount: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Reset Mode</Label>
                <Select value={local.resetMode} onValueChange={(v: string) => setLocal({ ...local, resetMode: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="period">Per Period</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Overage Policy</Label>
                <Select
                  value={local.overagePolicy}
                  onValueChange={(v: string) =>
                    setLocal({
                      ...local,
                      overagePolicy: v as PlanItemConfig['overagePolicy'],
                      ...(v !== 'charge' ? { overagePriceCents: undefined } : {}),
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deny">Deny</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                    <SelectItem value="throttle">Throttle</SelectItem>
                    <SelectItem value="downgrade">Downgrade</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {local.overagePolicy === 'charge' && (
                <div className="space-y-2">
                  <Label>Overage Price (cents / unit)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={local.overagePriceCents ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLocal({ ...local, overagePriceCents: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Reset Strategy</Label>
                <Select
                  value={local.resetStrategy}
                  onValueChange={(v: string) =>
                    setLocal({
                      ...local,
                      resetStrategy: v as PlanItemConfig['resetStrategy'],
                      ...(v !== 'capped' ? { resetCap: undefined } : {}),
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="capped">Capped</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {local.resetStrategy === 'capped' && (
                <div className="space-y-2">
                  <Label>Reset Cap</Label>
                  <Input
                    type="number"
                    min={1}
                    value={local.resetCap ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLocal({ ...local, resetCap: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Quota Scope</Label>
                <Select
                  value={local.quotaScope}
                  onValueChange={(v: string) => setLocal({ ...local, quotaScope: v as PlanItemConfig['quotaScope'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={validationError !== null}
            onClick={() => { onApply(local); onOpenChange(false); }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  // Fetch plan + items in one query
  const { data: planData, isLoading: planLoading, refetch: refetchPlanData } = (trpc as any).billing.plans.getWithItems.useQuery(
    { id: planId! },
    { enabled: !!planId },
  );

  const plan = planData?.plan ?? planData;  // 兼容: 后端返回 { plan, items } 或直接返回 plan 对象
  const existingItems: any[] = planData?.items ?? [];

  // Fetch all plugin procedures (grouped)
  const { data: groups = [] } = (trpc as any).billing.billingConfig.listPluginProcedures.useQuery();

  // Local state — key 为 procedure path，每个 procedure 独立配置
  const [itemConfigs, setItemConfigs] = useState<Map<string, PlanItemConfig>>(new Map());
  const [initialConfigs, setInitialConfigs] = useState<Map<string, PlanItemConfig>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state — dialogPath 为当前正在编辑配置的 procedure path
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPath, setDialogPath] = useState<string | null>(null);

  // Ref 用于 deep comparison，避免 existingItems 引用变化导致无限循环
  const prevItemsRef = useRef<string>('');

  // Save mutation
  const saveMutation = (trpc as any).billing.planItems.saveBatch.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Saved: ${result.created} added, ${result.updated} updated, ${result.removed} removed`);
      refetchPlanData();
      setInitialConfigs(new Map(itemConfigs));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { checkboxItems, groupConfigs, pathToGroupKey } = useMemo(() => {
    const items: GroupedCheckboxItem[] = [];
    const configs: GroupConfig[] = [];
    const nextPathToGroupKey = new Map<string, string | null>();

    for (const group of groups as PluginGroup[]) {
      configs.push({
        key: group.pluginId,
        label: `📦 ${group.pluginId}`,
        description: `${group.totalCount} procedures`,
      });

      for (const proc of group.procedures) {
        const procPath = `pluginApis.${group.pluginId}.${proc.procedureName}`;
        const effectiveGroupKey = proc.declaredSubject ?? proc.subject;
        nextPathToGroupKey.set(procPath, effectiveGroupKey);

        const item: GroupedCheckboxItem = {
          id: procPath,
          group: group.pluginId,
          label: proc.procedureName,
          subgroup: effectiveGroupKey ?? undefined,
          description: effectiveGroupKey
            ? `group: ${effectiveGroupKey}`
            : 'No billing subject declared',
        };
        items.push(item);
      }
    }

    return {
      checkboxItems: items,
      groupConfigs: configs,
      pathToGroupKey: nextPathToGroupKey,
    };
  }, [groups]);

  // Initialize from existing items — 按 procedure path 保存
  // 使用 JSON 序列化做 deep comparison，避免引用变化导致无限循环
  useEffect(() => {
    const serialized = JSON.stringify(existingItems);
    if (serialized === prevItemsRef.current) return; // 数据未变，跳过
    prevItemsRef.current = serialized;

    const configMap = new Map<string, PlanItemConfig>();
    const ids = new Set<string>();

    for (const item of existingItems) {
      const baseConfig: PlanItemConfig = {
        subject: item.subject,
        procedurePath: item.procedurePath ?? undefined,
        groupKey: item.groupKey ?? null,
        type: item.type,
        amount: item.amount ?? undefined,
        resetMode: item.resetMode ?? 'period',
        overagePolicy: item.overagePolicy ?? 'deny',
        overagePriceCents: item.overagePriceCents ?? undefined,
        resetStrategy: item.resetStrategy ?? 'hard',
        resetCap: item.resetCap ?? undefined,
        quotaScope: item.quotaScope ?? 'tenant',
      };

      const itemKey = item.procedurePath ?? item.subject;
      configMap.set(itemKey, baseConfig);
      ids.add(itemKey);
    }

    setSelectedIds(ids);
    setItemConfigs(new Map(configMap));
    setInitialConfigs(new Map(configMap));
  }, [existingItems]);

  // Filter
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return checkboxItems;
    const term = searchTerm.toLowerCase();
    return checkboxItems.filter(item =>
      item.label.toLowerCase().includes(term) ||
      item.group.toLowerCase().includes(term) ||
      (item.description || '').toLowerCase().includes(term)
    );
  }, [checkboxItems, searchTerm]);

  // ─── Handlers ───

  const handleSelectionChange = useCallback((newSelectedIds: Set<string>) => {
    setItemConfigs(prev => {
      const next = new Map(prev);
      for (const id of newSelectedIds) {
        if (!next.has(id)) {
          next.set(id, {
            subject: id,
            procedurePath: id,
            groupKey: pathToGroupKey.get(id) ?? null,
            type: 'boolean',
            resetMode: 'period',
            overagePolicy: 'deny',
            resetStrategy: 'hard',
            quotaScope: 'tenant',
          });
        }
      }

      for (const id of prev.keys()) {
        if (!newSelectedIds.has(id)) {
          next.delete(id);
        }
      }

      return next;
    });

    setSelectedIds(newSelectedIds);
  }, [pathToGroupKey]);

  const updateItemConfig = (path: string, updates: Partial<PlanItemConfig>) => {
    setItemConfigs(prev => {
      const next = new Map(prev);
      const existing = next.get(path);
      if (existing) {
        next.set(path, { ...existing, ...updates });
      }
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    if (itemConfigs.size !== initialConfigs.size) return true;
    for (const [key, val] of itemConfigs) {
      const init = initialConfigs.get(key);
      if (!init) return true;
      if (JSON.stringify(val) !== JSON.stringify(init)) return true;
    }
    return false;
  }, [itemConfigs, initialConfigs]);

  const handleSave = () => {
    const items = Array.from(itemConfigs.values());
    const invalidItem = items.find((item) => getPlanItemConfigError(item) !== null);
    if (invalidItem) {
      toast.error(getPlanItemConfigError(invalidItem)!);
      return;
    }

    saveMutation.mutate({ planId: planId!, items });
  };

  const handleReset = () => {
    setItemConfigs(new Map(initialConfigs));
    setSelectedIds(new Set(initialConfigs.keys()));
    toast.info('Changes reverted');
  };

  const openMeteredDialog = (path: string) => {
    setDialogPath(path);
    setDialogOpen(true);
  };

  // ─── Custom renderItem: compact 2-col friendly ───

  const renderItem: RenderItemFn = useCallback((item, checked, disabled, toggleItem) => {
    const config = itemConfigs.get(item.id);

    return (
      <div
        key={item.id}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors ${checked ? 'bg-primary/5' : ''}`}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(c) => toggleItem(item.id, c === true)}
          className="shrink-0"
        />

        {/* Name */}
        <span className="font-mono text-sm truncate min-w-0 flex-1" title={item.label}>
          {item.label}
        </span>

        {/* Inline config summary */}
        {checked && (
          <div className="flex items-center gap-1 shrink-0">
            {config?.type === 'metered' ? (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-muted"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  openMeteredDialog(item.id);
                }}
              >
                📊 {config.amount ?? '∞'}/{config.resetMode === 'period' ? 'period' : '∞'}
              </Badge>
            ) : null}
            {checked && config?.type === 'metered' && config.overagePolicy !== 'deny' ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                {config.overagePolicy}
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                openMeteredDialog(item.id);
              }}
            >
              <Settings2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }, [itemConfigs]);

  // ─── Render ───

  if (planLoading) return <div className="container mx-auto py-8">Loading...</div>;
  if (!plan) return <div className="container mx-auto py-8">Plan not found</div>;

  const dialogConfig = dialogPath ? itemConfigs.get(dialogPath) : null;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings/billing/plans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{plan.name}</h1>
          <p className="text-muted-foreground">{plan.description}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
            {plan.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant="outline">
            {plan.priceCents / 100} {plan.currency?.toUpperCase()} / {plan.interval}
          </Badge>
        </div>
      </div>

      {/* Matrix Card */}
      <div className="rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Entitlements</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Check procedures to include. Each procedure is configured independently.
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search procedures..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 bg-muted/30 border-b text-sm flex items-center justify-between">
          <span className="text-muted-foreground">
            {selectedIds.size} entitlements · {Array.from(itemConfigs.values()).filter(c => c.type === 'metered').length} metered
          </span>
          {hasChanges && (
            <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
              Unsaved changes
            </span>
          )}
        </div>

        {/* GroupedCheckboxList */}
        <div className="p-2">
          {filteredItems.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No plugin procedures detected.</p>
          ) : (
            <GroupedCheckboxList
              items={filteredItems}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
              groups={groupConfigs}
              renderItem={renderItem}
              columns={2}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saveMutation.isPending}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Metered Config Dialog */}
      {dialogConfig && (
        <MeteredConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          config={dialogConfig}
          onApply={(updated) => {
            if (dialogPath) {
              updateItemConfig(dialogPath, updated);
            }
          }}
        />
      )}
    </div>
  );
}

export { PlanDetailPage };
