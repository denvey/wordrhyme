import { LayoutDashboard } from 'lucide-react';
import { PluginSlot } from '../lib/extensions';
import { useTranslation } from "../lib/i18n"
import { useCurrency } from '../lib/currency';
import { CurrencySwitcher, CurrencyBadge } from '../components/currency/CurrencySwitcher';

export function DashboardPage() {
    const { t } = useTranslation();

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <LayoutDashboard className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Dashboard</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Stats Cards */}
                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">{t('Installed Plugins')}</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>

                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">{t('Active Users')}</h3>
                    <p className="text-3xl font-bold mt-2">1</p>
                </div>

                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">API Requests (24h)</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>
            </div>

            <div className="mt-8 p-6 rounded-xl bg-card border border-border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
                <ul className="space-y-3 text-muted-foreground">
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
                        Install your first plugin from the Plugins page
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">2</span>
                        Configure your organization settings
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">3</span>
                        Invite team members to your workspace
                    </li>
                </ul>
            </div>

            <PluginSlot name="dashboard.widgets" layout="grid" />

            {/* 多货币测试 */}
            <CurrencyTestSection />
        </div>
    );
}

function CurrencyTestSection() {
    const { currency, currencies, baseCurrency, p, convert, isReady } = useCurrency();

    if (!isReady) {
        return (
            <div className="mt-8 p-6 rounded-xl bg-card border border-border shadow-sm">
                <p className="text-muted-foreground">货币数据加载中...</p>
            </div>
        );
    }

    const testAmounts = [999, 9999, 123456, 9999999];

    return (
        <div className="mt-8 p-6 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">多货币测试</h2>
                <div className="flex items-center gap-3">
                    <CurrencyBadge />
                    <CurrencySwitcher showName className="w-48" />
                </div>
            </div>

            <div className="space-y-6">
                {/* 基本价格展示 */}
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        基本价格 <span className="text-xs">(原始金额为 {baseCurrency.code})</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {testAmounts.map((cents) => (
                            <div key={cents} className="p-4 rounded-lg bg-muted/50">
                                <p className="text-xs text-muted-foreground mb-1">
                                    {baseCurrency.symbol}{(cents / Math.pow(10, baseCurrency.decimalDigits)).toFixed(baseCurrency.decimalDigits)} ({cents} cents)
                                </p>
                                <p className="text-lg font-semibold">{p(cents)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 价格区间 */}
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">价格区间</h3>
                    <div className="flex flex-wrap gap-4">
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">基础套餐</p>
                            <p className="text-lg font-semibold">{p(999)} - {p(2999)}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">专业套餐</p>
                            <p className="text-lg font-semibold">{p(4999)} - {p(19999)}</p>
                        </div>
                    </div>
                </div>

                {/* 折扣价格 */}
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">折扣价格</h3>
                    <div className="flex flex-wrap gap-4">
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">8 折优惠</p>
                            <p>
                                <span className="line-through text-muted-foreground">{p(9999)}</span>
                                {' '}
                                <span className="text-destructive font-semibold">{p(7999)}</span>
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">限时特价</p>
                            <p>
                                <span className="line-through text-muted-foreground">{p(49999)}</span>
                                {' '}
                                <span className="text-destructive font-semibold">{p(29999)}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* 多货币对比 */}
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        多货币对比 ({baseCurrency.symbol}99.99 在各货币下)
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        {currencies.map((c) => {
                            const converted = convert(9999, baseCurrency.code, c.code);
                            const digits = c.decimalDigits;
                            const display = (converted / Math.pow(10, digits)).toFixed(digits);
                            return (
                                <div
                                    key={c.code}
                                    className={`p-3 rounded-lg ${c.code === currency.code ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}
                                >
                                    <p className="text-xs text-muted-foreground">
                                        {c.symbol} {c.code} {c.isBase && '(Base)'} {c.currentRate && `× ${c.currentRate}`}
                                    </p>
                                    <p className="font-mono mt-1 font-semibold">{c.symbol}{display}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 当前货币信息 */}
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">当前货币信息</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">代码</p>
                            <p className="font-mono mt-1">{currency.code}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">符号</p>
                            <p className="font-mono mt-1">{currency.symbol}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">小数位</p>
                            <p className="font-mono mt-1">{currency.decimalDigits}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">汇率 (相对 {baseCurrency.code})</p>
                            <p className="font-mono mt-1">{currency.currentRate ?? '1 (Base)'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
