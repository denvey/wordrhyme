/**
 * Currencies & Exchange Rates Management Page
 *
 * Single unified table showing currencies with inline exchange rates.
 * - Base currency shows "Base" badge in Rate column
 * - Non-base currencies show rate with click-to-edit
 * - Rate history accessible from each currency row
 * - Reference rates from open.er-api.com (free, no API key)
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { DollarSign, Star, RefreshCw, Plus, Pencil, ExternalLink } from 'lucide-react';
import { z } from 'zod';
import { AutoTable } from '@wordrhyme/auto-crud';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { useI18n } from '../../lib/i18n';
import { useActiveOrganization } from '../../lib/auth-client';
import { useCurrencyVisibility, useCurrencyPolicy } from '../../hooks/use-currency-policy';
import { PolicyAwareBanner } from '../../components/settings/PolicyAwareBanner';
import type { InfraPolicyMode } from '../../hooks/use-infra-policy';

// ============================================================================
// Preset Currencies (ISO 4217)
// ============================================================================

const PRESET_CURRENCIES = [
  { code: 'USD', symbol: '$', nameEn: 'US Dollar', nameZh: '美元', decimals: 2 },
  { code: 'EUR', symbol: '€', nameEn: 'Euro', nameZh: '欧元', decimals: 2 },
  { code: 'GBP', symbol: '£', nameEn: 'British Pound', nameZh: '英镑', decimals: 2 },
  { code: 'JPY', symbol: '¥', nameEn: 'Japanese Yen', nameZh: '日元', decimals: 0 },
  { code: 'CNY', symbol: '¥', nameEn: 'Chinese Yuan', nameZh: '人民币', decimals: 2 },
  { code: 'HKD', symbol: 'HK$', nameEn: 'Hong Kong Dollar', nameZh: '港币', decimals: 2 },
  { code: 'TWD', symbol: 'NT$', nameEn: 'New Taiwan Dollar', nameZh: '新台币', decimals: 2 },
  { code: 'KRW', symbol: '₩', nameEn: 'South Korean Won', nameZh: '韩元', decimals: 0 },
  { code: 'SGD', symbol: 'S$', nameEn: 'Singapore Dollar', nameZh: '新加坡元', decimals: 2 },
  { code: 'AUD', symbol: 'A$', nameEn: 'Australian Dollar', nameZh: '澳元', decimals: 2 },
  { code: 'CAD', symbol: 'C$', nameEn: 'Canadian Dollar', nameZh: '加元', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', nameEn: 'Swiss Franc', nameZh: '瑞士法郎', decimals: 2 },
  { code: 'NZD', symbol: 'NZ$', nameEn: 'New Zealand Dollar', nameZh: '新西兰元', decimals: 2 },
  { code: 'THB', symbol: '฿', nameEn: 'Thai Baht', nameZh: '泰铢', decimals: 2 },
  { code: 'INR', symbol: '₹', nameEn: 'Indian Rupee', nameZh: '印度卢比', decimals: 2 },
  { code: 'MYR', symbol: 'RM', nameEn: 'Malaysian Ringgit', nameZh: '马来西亚林吉特', decimals: 2 },
  { code: 'PHP', symbol: '₱', nameEn: 'Philippine Peso', nameZh: '菲律宾比索', decimals: 2 },
  { code: 'IDR', symbol: 'Rp', nameEn: 'Indonesian Rupiah', nameZh: '印尼盾', decimals: 0 },
  { code: 'VND', symbol: '₫', nameEn: 'Vietnamese Dong', nameZh: '越南盾', decimals: 0 },
  { code: 'BRL', symbol: 'R$', nameEn: 'Brazilian Real', nameZh: '巴西雷亚尔', decimals: 2 },
  { code: 'MXN', symbol: 'MX$', nameEn: 'Mexican Peso', nameZh: '墨西哥比索', decimals: 2 },
  { code: 'RUB', symbol: '₽', nameEn: 'Russian Ruble', nameZh: '俄罗斯卢布', decimals: 2 },
  { code: 'SAR', symbol: '﷼', nameEn: 'Saudi Riyal', nameZh: '沙特里亚尔', decimals: 2 },
  { code: 'AED', symbol: 'د.إ', nameEn: 'UAE Dirham', nameZh: '阿联酋迪拉姆', decimals: 2 },
  { code: 'TRY', symbol: '₺', nameEn: 'Turkish Lira', nameZh: '土耳其里拉', decimals: 2 },
  { code: 'ZAR', symbol: 'R', nameEn: 'South African Rand', nameZh: '南非兰特', decimals: 2 },
  { code: 'SEK', symbol: 'kr', nameEn: 'Swedish Krona', nameZh: '瑞典克朗', decimals: 2 },
  { code: 'NOK', symbol: 'kr', nameEn: 'Norwegian Krone', nameZh: '挪威克朗', decimals: 2 },
  { code: 'DKK', symbol: 'kr', nameEn: 'Danish Krone', nameZh: '丹麦克朗', decimals: 2 },
  { code: 'PLN', symbol: 'zł', nameEn: 'Polish Zloty', nameZh: '波兰兹罗提', decimals: 2 },
  { code: 'KWD', symbol: 'د.ك', nameEn: 'Kuwaiti Dinar', nameZh: '科威特第纳尔', decimals: 3 },
] as const;

// ============================================================================
// Table Schema (for AutoTable)
// ============================================================================

const currencyTableSchema = z.object({
  id: z.string(),
  code: z.string(),
  nameI18n: z.record(z.string(), z.string()),
  symbol: z.string(),
  decimalDigits: z.number(),
  isEnabled: z.number(),
  isBase: z.number(),
  currentRate: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Reference Rate Hook (free API, frontend only, no backend storage)
// ============================================================================

function useReferenceRates(baseCurrency: string | null) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!baseCurrency) return;

    let cancelled = false;
    setLoading(true);

    fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.result === 'success') {
          setRates(data.rates);
        }
      })
      .catch(() => {
        // Silently fail — reference rates are optional
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [baseCurrency]);

  const getRate = useCallback(
    (targetCode: string): string | null => {
      if (!rates || !targetCode) return null;
      const rate = rates[targetCode];
      return rate !== undefined ? String(rate) : null;
    },
    [rates]
  );

  return { getRate, loading };
}

// ============================================================================
// Types
// ============================================================================

type Currency = z.infer<typeof currencyTableSchema>;

interface ExchangeRate {
  id: string;
  organizationId: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  source: string;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CurrencyFormData {
  code: string;
  nameEn: string;
  nameZh: string;
  symbol: string;
  decimalDigits: number;
  isEnabled: boolean;
  initialRate: string;
}

// ============================================================================
// Reference Rate Hint Component
// ============================================================================

function ReferenceRateHint({
  baseCurrency,
  targetCurrency,
  getRate,
  loading,
  onApply,
}: {
  baseCurrency: string;
  targetCurrency: string;
  getRate: (code: string) => string | null;
  loading: boolean;
  onApply: (rate: string) => void;
}) {
  const refRate = getRate(targetCurrency);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading reference rate...
      </p>
    );
  }

  if (!refRate) return null;

  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
      <ExternalLink className="h-3 w-3" />
      Reference: 1 {baseCurrency} = {refRate} {targetCurrency}
      <button
        type="button"
        className="text-primary hover:underline cursor-pointer font-medium"
        onClick={() => onApply(refRate)}
      >
        Apply
      </button>
    </p>
  );
}

// ============================================================================
// Main Page
// ============================================================================

// ============================================================================
// Policy Options (shared with TenantPolicySection)
// ============================================================================

const POLICY_OPTIONS: { value: InfraPolicyMode; label: string; description: string }[] = [
  {
    value: 'unified',
    label: 'Unified platform configuration',
    description: 'Tenants cannot see or change currency settings.',
  },
  {
    value: 'allow_override',
    label: 'Allow tenant override',
    description: 'Optional — tenants can override, defaults to platform config.',
  },
  {
    value: 'require_tenant',
    label: 'Require tenant self-configuration',
    description: 'Platform does not provide a default. Tenants must configure their own.',
  },
];

// ============================================================================
// Main Page
// ============================================================================

export function CurrenciesPage() {
  const { locale } = useI18n();
  const utils = trpc.useUtils();

  // --- Policy & org state ---
  const { data: activeOrg } = useActiveOrganization();
  const isPlatform = activeOrg?.id === 'platform';
  const { data: visibility, isLoading: visibilityLoading } = useCurrencyVisibility();
  const mode = visibility?.mode ?? 'unified';
  const hasCustomConfig = visibility?.hasCustomConfig ?? false;
  const isEditable = isPlatform || mode === 'require_tenant' || (mode === 'allow_override' && hasCustomConfig);

  // --- Currency CRUD state ---
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [formData, setFormData] = useState<CurrencyFormData>({
    code: '',
    nameEn: '',
    nameZh: '',
    symbol: '',
    decimalDigits: 2,
    isEnabled: true,
    initialRate: '',
  });

  // --- Rate state ---
  const [rateDialog, setRateDialog] = useState<{ code: string; currentRate: string } | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [historyPair, setHistoryPair] = useState<{ base: string; target: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Currency | null>(null);

  // --- Queries ---
  const currenciesQuery = trpc.currency.currencies.list.useQuery({});
  const historyQuery = trpc.currency.rates.history.useQuery(
    {
      baseCurrency: historyPair?.base ?? '',
      targetCurrency: historyPair?.target ?? '',
      limit: 20,
    },
    { enabled: !!historyPair }
  );

  // --- Find base currency code ---
  const baseCurrencyCode = useMemo(() => {
    const currencies = currenciesQuery.data?.data;
    if (!currencies) return null;
    const base = (currencies as Currency[]).find((c) => c.isBase === 1);
    return base?.code ?? null;
  }, [currenciesQuery.data]);

  // --- Reference rates from free API ---
  const { getRate: getRefRate, loading: refLoading } = useReferenceRates(baseCurrencyCode);

  // --- Available preset currencies (exclude already added) ---
  const availablePresets = useMemo(() => {
    const existingCodes = new Set(
      (currenciesQuery.data?.data as Currency[] | undefined)?.map((c) => c.code) ?? []
    );
    return PRESET_CURRENCIES.filter((p) => !existingCodes.has(p.code));
  }, [currenciesQuery.data]);

  const selectPresetCurrency = (code: string) => {
    const preset = PRESET_CURRENCIES.find((p) => p.code === code);
    if (preset) {
      setFormData({
        ...formData,
        code: preset.code,
        nameEn: preset.nameEn,
        nameZh: preset.nameZh,
        symbol: preset.symbol,
        decimalDigits: preset.decimals,
      });
    }
  };

  // --- Currency mutations ---
  const createMutation = trpc.currency.currencies.create.useMutation({
    onSuccess: () => {
      toast.success('Currency created successfully');
      setIsCreateOpen(false);
      resetForm();
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error('Error creating currency', { description: error.message });
    },
  });

  const updateMutation = trpc.currency.currencies.update.useMutation({
    onSuccess: () => {
      toast.success('Currency updated successfully');
      setEditingCurrency(null);
      resetForm();
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error('Error updating currency', { description: error.message });
    },
  });

  const toggleMutation = trpc.currency.currencies.toggle.useMutation({
    onSuccess: () => {
      toast.success('Currency status updated');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error('Error toggling currency', { description: error.message });
    },
  });

  const deleteMutation = trpc.currency.currencies.delete.useMutation({
    onSuccess: () => {
      toast.success('Currency deleted');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error('Error deleting currency', { description: error.message });
    },
  });

  // --- Rate mutations ---
  const setRateMutation = trpc.currency.rates.set.useMutation({
    onSuccess: () => {
      toast.success('Exchange rate updated');
      setRateDialog(null);
      setRateValue('');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error('Error setting rate', { description: error.message });
    },
  });

  // --- Policy switch mutations ---
  const switchToCustomMutation = trpc.currency.switchToCustom.useMutation({
    onSuccess: () => {
      toast.success('Switched to custom configuration');
      invalidateAll();
      utils.currency.policy.getVisibility.invalidate();
    },
    onError: (error: Error) => {
      toast.error('Error switching to custom', { description: error.message });
    },
  });

  const resetToPlatformMutation = trpc.currency.resetToPlatform.useMutation({
    onSuccess: () => {
      toast.success('Reset to platform configuration');
      invalidateAll();
      utils.currency.policy.getVisibility.invalidate();
    },
    onError: (error: Error) => {
      toast.error('Error resetting to platform', { description: error.message });
    },
  });

  // --- Helpers ---
  const invalidateAll = () => {
    utils.currency.currencies.list.invalidate();
    utils.currency.rates.list.invalidate();
    utils.currency.rates.history.invalidate();
  };

  const resetForm = () => {
    setFormData({ code: '', nameEn: '', nameZh: '', symbol: '', decimalDigits: 2, isEnabled: true, initialRate: '' });
  };

  const openEdit = (currency: Currency) => {
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      nameEn: currency.nameI18n['en-US'] ?? '',
      nameZh: currency.nameI18n['zh-CN'] ?? '',
      symbol: currency.symbol,
      decimalDigits: currency.decimalDigits,
      isEnabled: currency.isEnabled === 1,
      initialRate: currency.currentRate ?? '',
    });
  };

  const handleCurrencySubmit = () => {
    const nameI18n: Record<string, string> = {};
    if (formData.nameEn) nameI18n['en-US'] = formData.nameEn;
    if (formData.nameZh) nameI18n['zh-CN'] = formData.nameZh;

    if (editingCurrency) {
      updateMutation.mutate({
        id: editingCurrency.id,
        data: {
          nameI18n,
          symbol: formData.symbol,
          decimalDigits: formData.decimalDigits,
          isEnabled: formData.isEnabled,
          rate: formData.initialRate || undefined,
        },
      });
    } else {
      createMutation.mutate({
        code: formData.code.toUpperCase(),
        nameI18n,
        symbol: formData.symbol,
        decimalDigits: formData.decimalDigits,
        isEnabled: formData.isEnabled ? 1 : 0,
        initialRate: formData.initialRate || undefined,
      });
    }
  };

  const openRateDialog = (currency: Currency) => {
    const currentRate = currency.currentRate ?? '';
    setRateDialog({ code: currency.code, currentRate });
    setRateValue(currentRate);
  };

  const handleRateSubmit = () => {
    if (!rateDialog || !baseCurrencyCode) return;
    const rate = Number.parseFloat(rateValue);
    if (isNaN(rate) || rate <= 0) {
      toast.error('Rate must be a positive number');
      return;
    }
    setRateMutation.mutate({
      baseCurrency: baseCurrencyCode,
      targetCurrency: rateDialog.code,
      rate: rateValue,
    });
  };

  const getName = (currency: Currency) => {
    return currency.nameI18n[locale] ?? currency.nameI18n['en-US'] ?? currency.code;
  };

  const formatDate = (date: Date | string) => new Date(date).toLocaleString();

  const isLoading = currenciesQuery.isLoading;

  // --- Rate input with reference hint (shared between create/edit/dialog) ---
  const renderRateInput = (
    id: string,
    targetCode: string,
    value: string,
    onChange: (val: string) => void,
  ) => {
    if (!baseCurrencyCode || targetCode === baseCurrencyCode) return null;

    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>
          Exchange Rate (1 {baseCurrencyCode} = ? {targetCode})
        </Label>
        <Input
          id={id}
          type="number"
          step="0.00000001"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., 7.25"
        />
        <ReferenceRateHint
          baseCurrency={baseCurrencyCode}
          targetCurrency={targetCode}
          getRate={getRefRate}
          loading={refLoading}
          onApply={onChange}
        />
        {value && (
          <p className="text-sm text-muted-foreground">
            1 {baseCurrencyCode} = {value} {targetCode}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-8 w-8" />
            Currencies
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage currencies and exchange rates for your organization
          </p>
        </div>
        {isEditable && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Currency
          </Button>
        )}
      </div>

      {/* Policy-aware banner for tenant users */}
      {!isPlatform && (
        <PolicyAwareBanner
          mode={mode}
          hasCustomConfig={hasCustomConfig}
          isLoading={visibilityLoading}
          showUnifiedBanner
          onSwitchToCustom={() => switchToCustomMutation.mutate()}
          onResetToPlatform={() => resetToPlatformMutation.mutate()}
        />
      )}

      {/* Create / Edit Currency Dialog */}
      <Dialog open={isCreateOpen || !!editingCurrency} onOpenChange={(open) => {
        if (!open) { setIsCreateOpen(false); setEditingCurrency(null); resetForm(); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCurrency ? `Edit ${editingCurrency.code}` : 'Add Currency'}</DialogTitle>
            <DialogDescription>
              {editingCurrency ? 'Update currency settings and exchange rate' : 'Add a new currency for your organization'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingCurrency ? (
              <>
                <div className="grid gap-2">
                  <Label>Currency</Label>
                  <Select
                    value={formData.code}
                    onValueChange={selectPresetCurrency}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePresets.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.symbol} {p.code} — {p.nameEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.code && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label className="text-muted-foreground text-xs">Code</Label>
                        <div className="font-mono text-sm bg-muted px-3 py-2 rounded">{formData.code}</div>
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-muted-foreground text-xs">Symbol</Label>
                        <Input
                          value={formData.symbol}
                          onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-muted-foreground text-xs">Decimals</Label>
                        <div className="text-sm bg-muted px-3 py-2 rounded">{formData.decimalDigits}</div>
                      </div>
                    </div>
                    {renderRateInput(
                      'initialRate',
                      formData.code,
                      formData.initialRate,
                      (val) => setFormData({ ...formData, initialRate: val }),
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    maxLength={10}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="decimalDigits">Decimal Digits</Label>
                  <Select
                    value={String(formData.decimalDigits)}
                    onValueChange={(v) => setFormData({ ...formData, decimalDigits: Number.parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 (e.g., JPY)</SelectItem>
                      <SelectItem value="2">2 (e.g., USD, EUR)</SelectItem>
                      <SelectItem value="3">3 (e.g., KWD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {renderRateInput(
                  'editRate',
                  editingCurrency.code,
                  formData.initialRate,
                  (val) => setFormData({ ...formData, initialRate: val }),
                )}
              </>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="isEnabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
              />
              <Label htmlFor="isEnabled">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditingCurrency(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCurrencySubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingCurrency ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Currency Table */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <AutoTable
          schema={currencyTableSchema}
          data={(currenciesQuery.data?.data ?? []) as Currency[]}
          exclude={['id', 'isBase', 'createdAt', 'updatedAt']}
          overrides={{
            code: {
              label: 'Code',
              cell: ({ row }) => {
                const c = row.original as Currency;
                return (
                  <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                    {c.code}
                  </code>
                );
              },
            },
            nameI18n: {
              label: 'Name',
              cell: ({ row }) => getName(row.original as Currency),
            },
            symbol: {
              label: 'Symbol',
            },
            decimalDigits: {
              label: 'Decimals',
            },
            currentRate: {
              label: 'Rate',
              cell: ({ row }) => {
                const currency = row.original as Currency;
                const isBase = currency.isBase === 1;
                const rate = currency.currentRate;

                if (isBase) {
                  return (
                    <Badge className="gap-1">
                      <Star className="h-3 w-3" />
                      Base
                    </Badge>
                  );
                }
                if (rate) {
                  return isEditable ? (
                    <button
                      className="inline-flex items-center gap-1.5 font-mono text-sm hover:text-primary cursor-pointer group"
                      onClick={() => openRateDialog(currency)}
                    >
                      {rate}
                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <span className="font-mono text-sm">{rate}</span>
                  );
                }
                return isEditable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => openRateDialog(currency)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Set rate
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                );
              },
            },
            isEnabled: {
              label: 'Status',
              cell: ({ row }) => {
                const c = row.original as Currency;
                return (
                  <Switch
                    checked={c.isEnabled === 1}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: c.id, enabled: checked })
                    }
                    disabled={(c.isBase === 1 && c.isEnabled === 1) || !isEditable}
                  />
                );
              },
            },
          }}
          actions={
            [
              ...(isEditable ? [
                {
                  label: 'Edit',
                  onClick: (row: any) => openEdit(row as Currency),
                },
                {
                  label: 'Delete',
                  variant: 'destructive',
                  separator: true,
                  onClick: (row: any) => {
                    const c = row as Currency;
                    if (c.isBase === 1) {
                      toast.error('Cannot delete the base currency');
                      return;
                    }
                    setDeleteTarget(c);
                  },
                },
              ] : []),
              ...(baseCurrencyCode ? [
                {
                  label: 'View History',
                  onClick: (row: any) => {
                    const c = row as Currency;
                    if (c.isBase === 1) return;
                    setHistoryPair({ base: baseCurrencyCode, target: c.code });
                  },
                },
              ] : []),
            ] as any
          }
          filterMode="simple"
          enableExport={false}
          enableRowSelection={false}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete currency {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The currency and its associated exchange rates will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Rate Dialog (standalone, from table row click) */}
      <Dialog open={!!rateDialog} onOpenChange={(open) => { if (!open) { setRateDialog(null); setRateValue(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Exchange Rate</DialogTitle>
            <DialogDescription>
              {baseCurrencyCode && rateDialog
                ? `Set the rate: 1 ${baseCurrencyCode} = ? ${rateDialog.code}`
                : 'Set the exchange rate'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rateInput">
                Rate (1 {baseCurrencyCode ?? 'base'} = ? {rateDialog?.code ?? 'target'})
              </Label>
              <Input
                id="rateInput"
                type="number"
                step="0.00000001"
                min="0"
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                placeholder="e.g., 7.25"
                autoFocus
              />
              {baseCurrencyCode && rateDialog && (
                <ReferenceRateHint
                  baseCurrency={baseCurrencyCode}
                  targetCurrency={rateDialog.code}
                  getRate={getRefRate}
                  loading={refLoading}
                  onApply={setRateValue}
                />
              )}
              {baseCurrencyCode && rateDialog && rateValue && (
                <p className="text-sm text-muted-foreground">
                  1 {baseCurrencyCode} = {rateValue} {rateDialog.code}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRateDialog(null); setRateValue(''); }}>
              Cancel
            </Button>
            <Button onClick={handleRateSubmit} disabled={setRateMutation.isPending}>
              {setRateMutation.isPending ? 'Saving...' : 'Save Rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate History Sheet */}
      <Sheet open={!!historyPair} onOpenChange={() => setHistoryPair(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              Rate History: {historyPair?.base} → {historyPair?.target}
            </SheetTitle>
            <SheetDescription>Historical exchange rates for this currency pair</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {historyQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : historyQuery.data?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No history available</p>
            ) : (
              <div className="space-y-4">
                {historyQuery.data?.map((rate: ExchangeRate) => (
                  <div key={rate.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-mono text-lg">{rate.rate}</div>
                      <div className="text-sm text-muted-foreground">{formatDate(rate.effectiveAt)}</div>
                    </div>
                    <Badge variant={rate.source === 'manual' ? 'secondary' : 'default'}>
                      {rate.source}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Platform admin: tenant policy configuration */}
      {isPlatform && <CurrencyTenantPolicySection />}
    </div>
  );
}

// ============================================================================
// Tenant Policy Section (platform admin only)
// ============================================================================

function CurrencyTenantPolicySection() {
  const { policy, isLoading, setPolicy, isSettingPolicy } = useCurrencyPolicy();
  const [pendingMode, setPendingMode] = useState<InfraPolicyMode | null>(null);

  const currentMode = policy?.mode ?? 'unified';
  const selectedMode = pendingMode ?? currentMode;
  const isDirty = pendingMode !== null && pendingMode !== currentMode;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!isDirty) return;
    try {
      await setPolicy(pendingMode!);
      setPendingMode(null);
      toast.success('Currency tenant policy updated');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update policy';
      toast.error(msg);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold mb-1">Tenant Policy</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Control how tenants access currency configuration.
      </p>
      <div className="space-y-2">
        {POLICY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedMode === option.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
              } ${isSettingPolicy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="currency-policy"
              value={option.value}
              checked={selectedMode === option.value}
              onChange={() => setPendingMode(option.value)}
              className="mt-0.5"
              disabled={isSettingPolicy}
            />
            <div>
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
      {isDirty && (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingMode(null)}
            disabled={isSettingPolicy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSettingPolicy}
          >
            {isSettingPolicy ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default CurrenciesPage;
