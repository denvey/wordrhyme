# Change: Add Core Multi-Currency System (Revised)

## Why

WordRhyme 需要支持多货币定价能力，以满足全球化商业场景。

**修订说明**：本提案采用 **"基准价格 + 汇率换算"** 模式，需要同步修改 `GLOBALIZATION_GOVERNANCE.md` 治理文档（v0.1 → v0.2）。

---

## Design Decision: 汇率换算模式

### 核心原则

1. **基准货币统一**：管理员只需设置一种基准货币的价格
2. **汇率可控**：汇率由管理员手动设置或从 API 自动同步
3. **展示与结算分离**：前端展示用缓存汇率，结算用实时汇率
4. **结算绑定**：最终金额必须与结算货币绑定记录

### 两种汇率管理模式

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| 手动模式 | 管理员手动设置汇率 | 小型站点、固定汇率区 |
| 自动模式 | 定时从 API 同步汇率 | 大型 SaaS、实时汇率需求 |

---

## What Changes

### 1. 数据层

#### 1.1 货币配置表
```sql
currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,         -- 组织隔离
  code TEXT NOT NULL,                     -- ISO 4217 (大写)
  name_i18n JSONB NOT NULL,               -- {"en": "US Dollar", "zh-CN": "美元"}
  symbol TEXT NOT NULL,                   -- '$', '¥', '€'
  decimal_digits INT NOT NULL DEFAULT 2,  -- 2 for USD, 0 for JPY
  is_enabled INT NOT NULL DEFAULT 1,
  is_base INT NOT NULL DEFAULT 0,         -- 每组织仅一个基准货币
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  UNIQUE (organization_id, code),
  -- 每组织仅允许一个 is_base = 1
  CONSTRAINT single_base_per_organization UNIQUE (organization_id, is_base)
    WHERE is_base = 1
)
```

#### 1.2 汇率表
```sql
exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,          -- 组织隔离
  base_currency TEXT NOT NULL,            -- ISO 4217 (大写)
  target_currency TEXT NOT NULL,          -- ISO 4217 (大写)
  rate DECIMAL(18, 8) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL,                   -- 'manual' | 'api:provider_name'
  effective_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,                   -- null = 永不过期
  version INT NOT NULL DEFAULT 1,         -- 全局版本（每组织）
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  UNIQUE (organization_id, base_currency, target_currency, effective_at),
  FOREIGN KEY (organization_id, base_currency) REFERENCES currencies(organization_id, code),
  FOREIGN KEY (organization_id, target_currency) REFERENCES currencies(organization_id, code)
)

-- 索引：快速查询最新汇率
CREATE INDEX idx_exchange_rates_latest
ON exchange_rates (organization_id, base_currency, target_currency, effective_at DESC);
```

#### 1.3 汇率版本表（每组织全局版本）
```sql
exchange_rate_versions (
  organization_id TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
)
```

#### 1.3 套餐基准价格（简化）
```sql
-- plans 表保持不变，currency 为基准货币
plans (
  ...
  currency TEXT NOT NULL DEFAULT 'usd',  -- 基准货币
  price_cents INT NOT NULL,              -- 基准价格
  ...
)
```

#### 1.4 交易记录（增加汇率字段）
```sql
transactions (
  ...
  base_currency TEXT,           -- 基准货币
  base_amount_cents INT,        -- 基准金额
  settlement_currency TEXT,     -- 结算货币
  settlement_amount_cents INT,  -- 结算金额
  exchange_rate DECIMAL(18, 8), -- 结算时汇率
  exchange_rate_at TIMESTAMP,   -- 汇率获取时间
  ...
)
```

### 2. 服务层

#### 2.1 ExchangeRateService
```typescript
@Injectable()
export class ExchangeRateService {
  // 获取当前汇率（优先用缓存）
  async getRate(base: string, target: string): Promise<ExchangeRate>;

  // 获取所有汇率（前端缓存用）
  async getAllRates(base: string): Promise<ExchangeRateMap>;

  // 手动设置汇率
  async setManualRate(base: string, target: string, rate: number): Promise<void>;

  // 同步外部汇率（定时任务）
  async syncFromProvider(provider: string): Promise<void>;

  // 获取汇率版本号（前端缓存控制）
  async getVersion(): Promise<number>;
}
```

#### 2.2 CurrencyConversionService
```typescript
@Injectable()
export class CurrencyConversionService {
  // 转换金额（用于展示）
  async convert(
    amount: number,
    from: string,
    to: string,
    mode: 'display' | 'settlement'
  ): Promise<ConversionResult>;

  // 批量转换（前端初始化）
  async convertBatch(
    amount: number,
    from: string,
    targets: string[]
  ): Promise<Record<string, ConversionResult>>;
}

interface ConversionResult {
  amount: number;
  currency: string;
  rate: number;
  rateAt: Date;
  source: string;  // 'cache' | 'realtime'
}
```

### 3. tRPC Router

```typescript
// billing.currencies
billing.currencies.list()
billing.currencies.getEnabled()
billing.currencies.getBase()           // 获取基准货币
billing.currencies.setBase(code)       // 设置基准货币
billing.currencies.create(input)
billing.currencies.toggle(code)

// billing.exchangeRates
billing.exchangeRates.getAll()          // 获取所有汇率
billing.exchangeRates.getVersion()      // 获取版本号（前端缓存用）
billing.exchangeRates.set(input)        // 手动设置汇率
billing.exchangeRates.syncNow()         // 立即同步（管理员）

// billing.conversion
billing.conversion.convert(input)       // 单次转换
billing.conversion.batch(input)         // 批量转换（前端初始化）
```

### 4. 前端集成

#### 4.1 汇率缓存机制（类似 i18n）
```typescript
// 缓存结构
interface ExchangeRateCache {
  version: number;
  baseCurrency: string;
  rates: Record<string, number>;  // { 'CNY': 7.2, 'EUR': 0.92 }
  fetchedAt: number;
}

// localStorage key
const CACHE_KEY = 'wr:exchange_rates';

// 版本检查（类似 i18n）
async function checkRateVersion(): Promise<boolean> {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return true;

  const { version } = JSON.parse(cached);
  const serverVersion = await trpc.billing.exchangeRates.getVersion();
  return version < serverVersion;
}
```

#### 4.2 Smart Components
```typescript
// 价格展示组件
<PriceDisplay
  baseAmount={1999}           // cents
  baseCurrency="USD"
  displayCurrency={userCurrency}  // 用户选择的货币
  showNote={true}             // 显示"参考价格"提示
/>
// 输出: ¥143.93 (参考价格)

// 货币选择器
<CurrencySelector
  value={userCurrency}
  onChange={setUserCurrency}
  showFlags={true}
/>
```

#### 4.3 useCurrency() Hook（与 useTranslation 一致）

与 i18n 的 `useTranslation()` 模式完全一致，通过 React Context 实现**响应式更新**：

```typescript
// 与 useTranslation() 用法一致
function PricingCard({ plan }: { plan: Plan }) {
  const { p, currency, setCurrency } = useCurrency();

  return (
    <div>
      {/* 货币切换时自动重新渲染，无需刷新页面 */}
      <p className="price">{p(plan.priceCents, plan.currency)}</p>

      {/* 切换货币 */}
      <CurrencySelector
        value={currency}
        onChange={setCurrency}  // 触发 Context 更新 → 组件重新渲染
      />
    </div>
  );
}
```

**响应式更新原理**：
1. `setCurrency(code)` 更新 Context 中的 `userCurrency`
2. React 自动重新渲染所有使用 `useCurrency()` 的组件
3. 页面价格立即更新，无需刷新

#### 4.4 p 价格函数（类似 i18n 的 `t`）

```typescript
// ============================================================
// 全局价格函数 p (price) - 类似 $t (translate)
// ============================================================

// 基本用法：转换并格式化
p(1999, 'USD')           // → "¥143.93" (转换到用户当前货币)
p(1999, 'USD', 'CNY')    // → "¥143.93" (显式指定目标货币)
p(1999, 'USD', 'USD')    // → "$19.99"  (不转换，仅格式化)

// 返回原始数据
p.raw(1999, 'USD')
// → { amount: 14393, currency: 'CNY', formatted: '¥143.93', rate: 7.2 }

// 仅格式化（不转换）
p.format(1999, 'USD')    // → "$19.99"
p.format(14393, 'CNY')   // → "¥143.93"

// 带参考价格标注
p.withNote(1999, 'USD')  // → "¥143.93 (参考价格)"

// 返回分离的部分（符号 + 数字）
p.parts(1999, 'USD')
// → { symbol: '¥', value: '143.93', position: 'prefix' }

p.parts(1999, 'USD', 'JPY')
// → { symbol: '¥', value: '2,980', position: 'prefix' }

// 仅符号
p.symbol('USD')          // → "$"
p.symbol('CNY')          // → "¥"
p.symbol('EUR')          // → "€"

// 仅转换后的数字（cents）
p.amount(1999, 'USD')           // → 14393 (转换到用户货币的 cents)
p.amount(1999, 'USD', 'CNY')    // → 14393 (显式目标货币)
p.amount(1999, 'USD', 'USD')    // → 1999  (不转换)

// 仅转换后的数字（小数形式）
p.value(1999, 'USD')            // → 143.93 (转换后的小数)
p.value(1999, 'USD', 'JPY')     // → 2980   (日元无小数)

// 配置选项
p(1999, 'USD', {
  to: 'CNY',              // 目标货币
  showNote: true,         // 显示参考标注
  decimals: 2,            // 小数位数
})
```

#### 4.4 实现原理

```typescript
// packages/ui/src/price/global.ts

import { getCurrencyContext } from './context';

interface PriceOptions {
  to?: string;
  showNote?: boolean;
  decimals?: number;
}

interface RawResult {
  amount: number;
  currency: string;
  formatted: string;
  rate: number;
  isConverted: boolean;
}

// 主函数
function p(
  amountCents: number,
  fromCurrency: string,
  toOrOptions?: string | PriceOptions
): string {
  const ctx = getCurrencyContext();

  // 解析参数
  const options: PriceOptions = typeof toOrOptions === 'string'
    ? { to: toOrOptions }
    : toOrOptions ?? {};

  const targetCurrency = options.to ?? ctx.userCurrency;
  const rate = ctx.rates[targetCurrency] ?? 1;

  // 转换
  const convertedAmount = fromCurrency === targetCurrency
    ? amountCents
    : Math.round(amountCents * rate);

  // 格式化
  const formatted = formatCurrency(convertedAmount, targetCurrency, options.decimals);

  // 添加标注
  if (options.showNote && fromCurrency !== targetCurrency) {
    return `${formatted} (${ctx.referenceNote})`;  // i18n: "参考价格"
  }

  return formatted;
}

// 返回原始数据
p.raw = (amountCents: number, fromCurrency: string, to?: string): RawResult => {
  const ctx = getCurrencyContext();
  const targetCurrency = to ?? ctx.userCurrency;
  const rate = ctx.rates[targetCurrency] ?? 1;
  const isConverted = fromCurrency !== targetCurrency;
  const amount = isConverted ? Math.round(amountCents * rate) : amountCents;

  return {
    amount,
    currency: targetCurrency,
    formatted: formatCurrency(amount, targetCurrency),
    rate: isConverted ? rate : 1,
    isConverted,
  };
};

// 仅格式化
p.format = (amountCents: number, currency: string, decimals?: number): string => {
  return formatCurrency(amountCents, currency, decimals);
};

// 带标注
p.withNote = (amountCents: number, fromCurrency: string, to?: string): string => {
  return p(amountCents, fromCurrency, { to, showNote: true });
};

// 返回分离部分（符号 + 数字）
interface PriceParts {
  symbol: string;      // 货币符号
  value: string;       // 格式化的数字
  position: 'prefix' | 'suffix';  // 符号位置
  currency: string;    // 货币代码
  isConverted: boolean;
}

p.parts = (amountCents: number, fromCurrency: string, to?: string): PriceParts => {
  const ctx = getCurrencyContext();
  const targetCurrency = to ?? ctx.userCurrency;
  const rate = ctx.rates[targetCurrency] ?? 1;
  const isConverted = fromCurrency !== targetCurrency;
  const convertedAmount = isConverted ? Math.round(amountCents * rate) : amountCents;

  const currencyConfig = ctx.currencies[targetCurrency];
  const decimalDigits = currencyConfig?.decimalDigits ?? 2;
  const amount = convertedAmount / Math.pow(10, decimalDigits);

  // 使用 Intl.NumberFormat 的 formatToParts
  const formatter = new Intl.NumberFormat(ctx.locale, {
    style: 'currency',
    currency: targetCurrency,
  });

  const parts = formatter.formatToParts(amount);
  const symbolPart = parts.find(p => p.type === 'currency');
  const symbolIndex = parts.findIndex(p => p.type === 'currency');
  const valueParts = parts.filter(p =>
    p.type === 'integer' || p.type === 'decimal' || p.type === 'fraction' || p.type === 'group'
  );

  return {
    symbol: symbolPart?.value ?? currencyConfig?.symbol ?? targetCurrency,
    value: valueParts.map(p => p.value).join(''),
    position: symbolIndex === 0 ? 'prefix' : 'suffix',
    currency: targetCurrency,
    isConverted,
  };
};

// 仅获取货币符号
p.symbol = (currency: string): string => {
  const ctx = getCurrencyContext();
  return ctx.currencies[currency]?.symbol ?? currency;
};

// 仅转换后的数字（cents）
p.amount = (amountCents: number, fromCurrency: string, to?: string): number => {
  const ctx = getCurrencyContext();
  const targetCurrency = to ?? ctx.userCurrency;

  if (fromCurrency === targetCurrency) {
    return amountCents;
  }

  const rate = ctx.rates[targetCurrency] ?? 1;
  return Math.round(amountCents * rate);
};

// 仅转换后的数字（小数形式）
p.value = (amountCents: number, fromCurrency: string, to?: string): number => {
  const ctx = getCurrencyContext();
  const targetCurrency = to ?? ctx.userCurrency;
  const convertedCents = p.amount(amountCents, fromCurrency, to);

  const currencyConfig = ctx.currencies[targetCurrency];
  const decimalDigits = currencyConfig?.decimalDigits ?? 2;

  return convertedCents / Math.pow(10, decimalDigits);
};

// 格式化工具函数
function formatCurrency(amountCents: number, currency: string, decimals?: number): string {
  const ctx = getCurrencyContext();
  const currencyConfig = ctx.currencies[currency];
  const decimalDigits = decimals ?? currencyConfig?.decimalDigits ?? 2;

  const amount = amountCents / Math.pow(10, decimalDigits);

  return new Intl.NumberFormat(ctx.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimalDigits,
    maximumFractionDigits: decimalDigits,
  }).format(amount);
}

export { p };
```

#### 4.5 全局注入

```typescript
// packages/ui/src/providers/CurrencyProvider.tsx

import { p } from '../price/global';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // ... 初始化逻辑

  // 注入全局 (类似 i18n 的 $t)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).p = p;
    }
  }, []);

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
}

// TypeScript 全局类型声明
declare global {
  function p(amount: number, from: string, toOrOptions?: string | PriceOptions): string;
  namespace p {
    function raw(amount: number, from: string, to?: string): RawResult;
    function format(amount: number, currency: string, decimals?: number): string;
    function withNote(amount: number, from: string, to?: string): string;
    function parts(amount: number, from: string, to?: string): PriceParts;
    function symbol(currency: string): string;
    function amount(amount: number, from: string, to?: string): number;  // cents
    function value(amount: number, from: string, to?: string): number;   // decimal
  }
}
```

#### 4.6 使用示例

```tsx
// 组件中使用
function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div>
      <h3>{plan.name}</h3>
      {/* 自动转换到用户货币 */}
      <p className="price">{p(plan.priceCents, plan.currency)}</p>

      {/* 带参考标注 */}
      <p className="price-note">{p.withNote(plan.priceCents, plan.currency)}</p>

      {/* 原始数据用于逻辑判断 */}
      {(() => {
        const { amount, isConverted } = p.raw(plan.priceCents, plan.currency);
        return isConverted && <span className="converted-badge">已换算</span>;
      })()}
    </div>
  );
}

// 模板字符串中使用
const message = `本月消费: ${p(totalCents, 'USD')}`;

// 列表渲染
{products.map(p => (
  <li key={p.id}>
    {p.name} - {p(p.priceCents, p.currency)}
  </li>
))}

// 使用 parts 实现自定义样式
function StyledPrice({ amount, currency }: { amount: number; currency: string }) {
  const { symbol, value, position } = p.parts(amount, currency);

  return (
    <span className="price">
      {position === 'prefix' && <span className="symbol">{symbol}</span>}
      <span className="value">{value}</span>
      {position === 'suffix' && <span className="symbol">{symbol}</span>}
    </span>
  );
}

// 输出 HTML:
// <span class="price">
//   <span class="symbol">¥</span>
//   <span class="value">143.93</span>
// </span>

// CSS 示例:
// .price .symbol { font-size: 0.6em; vertical-align: top; }
// .price .value { font-size: 2em; font-weight: bold; }
```

#### 4.7 全局化函数族

| 函数 | 含义 | 用途 |
|------|------|------|
| `$t('key')` | translate | 翻译文本 |
| `p(amount, currency)` | price | 价格转换+格式化 |
| `$d(date, format)` | date | 日期格式化（未来） |
| `$n(number, style)` | number | 数字格式化（未来） |

#### 4.8 Hooks（补充）

```typescript
// 获取汇率上下文
const {
  baseCurrency,
  userCurrency,
  setUserCurrency,
  rates,
  convert,        // 等同于 p.raw
  format,         // 等同于 p.format
  isLoading
} = useCurrency();

// 使用 Hook（组件内需要响应式更新时）
const displayPrice = convert(1999, 'USD', userCurrency);
// { amount: 14393, currency: 'CNY', rate: 7.2 }
```

### 5. 结算流程

```typescript
// 支付时的结算流程
async function createPayment(planId: string, settlementCurrency: string) {
  // 1. 获取套餐基准价格
  const plan = await getPlan(planId);
  const baseCurrency = plan.currency;
  const baseAmount = plan.priceCents;

  // 2. 获取实时汇率（非缓存）
  const { rate, rateAt } = await exchangeRateService.getRate(
    baseCurrency,
    settlementCurrency,
    { mode: 'settlement' }
  );

  // 3. 计算结算金额
  const settlementAmount = Math.round(baseAmount * rate);

  // 4. 创建交易记录（绑定所有信息）
  const transaction = await createTransaction({
    baseCurrency,
    baseAmountCents: baseAmount,
    settlementCurrency,
    settlementAmountCents: settlementAmount,
    exchangeRate: rate,
    exchangeRateAt: rateAt,
    // ...
  });

  // 5. 调用支付网关
  return paymentService.createPaymentIntent({
    amountCents: settlementAmount,
    currency: settlementCurrency,
    // ...
  });
}
```

---

## Governance Document Changes

需要修改 `GLOBALIZATION_GOVERNANCE.md`：

### 移除的约束
- ~~❌ Core 自动换汇~~ → ✅ Core 提供换算服务
- ~~❌ 前端计算金额~~ → ✅ 前端可用缓存汇率展示（非结算）

### 新增的约束
- ✅ 结算必须使用实时汇率
- ✅ 交易记录必须包含汇率快照
- ✅ 汇率来源必须可审计
- ✅ 前端展示必须标注"参考价格"

---

## Impact

### Affected Specs
- `GLOBALIZATION_GOVERNANCE.md` - 需要版本升级 v0.1 → v0.2

### Affected Code
| 路径 | 变更类型 |
|------|----------|
| `packages/db/src/schema/` | 新增 currencies, exchange_rates |
| `apps/server/src/billing/services/` | 新增 ExchangeRateService, CurrencyConversionService |
| `apps/server/src/billing/adapters/` | 扩展支付流程支持汇率 |
| `apps/server/src/trpc/routers/billing/` | 新增 currencies, exchangeRates router |
| `packages/ui/src/providers/` | 新增 CurrencyProvider |
| `packages/ui/src/components/currency/` | 新增 PriceDisplay, CurrencySelector |
| `apps/admin/src/pages/settings/` | 新增 currencies + exchange rates 管理页 |

---

## Dependencies

### 前置依赖
- `add-core-i18n-system` - 共享缓存机制和版本控制模式

### 治理文档变更
- 需要先完成 `GLOBALIZATION_GOVERNANCE.md` 更新
- 变更需要记录在 Changelog

---

## Success Criteria

### 功能验收
- [ ] 管理员可设置基准货币
- [ ] 管理员可手动设置汇率
- [ ] （可选）管理员可配置自动汇率同步
- [ ] 前端正确展示换算价格 + 参考提示
- [ ] 前端汇率有版本控制和缓存
- [ ] 结算时使用实时汇率
- [ ] 交易记录包含完整汇率快照

### 合规验收
- [ ] 治理文档已更新到 v0.2
- [ ] 所有汇率变更可审计
- [ ] 前端展示有"参考价格"标注
- [ ] 结算金额与汇率可追溯

---

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| 汇率波动导致损失 | 管理员可设置汇率缓冲(+2%)、支付确认页显示最终金额 |
| 展示价格与结算差异大 | 设置汇率过期时间、差异过大时强制刷新 |
| 汇率 API 故障 | 回退到最近手动汇率、告警通知 |
| 精度问题 | 使用 DECIMAL(18,8)、统一舍入规则 |

---

## Status

- **Phase**: Research Complete → Ready for Governance Update
- **Decision**: 汇率换算模式（需更新治理文档）
- **Priority**: 与 i18n 同步实施
