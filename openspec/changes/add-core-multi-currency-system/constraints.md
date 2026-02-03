# Multi-Currency System Constraints (Final)

> 本文档记录多货币功能的所有约束条件（规划阶段确认版）

---

## 1. 核心设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 模式 | 基准价格 + 汇率换算 | 管理员只需维护一套价格 |
| 作用域 | **组织级隔离** | 每组织独立货币配置和汇率（使用 organization_id） |
| 汇率来源 | 仅从数据库读取 | 外部 API 只用于后台同步 |
| 前端 API | `useCurrency()` Hook | 与 i18n 的 `useTranslation()` 一致，SSR 安全 |
| 响应式更新 | Context + Hook 模式 | 货币切换时页面自动更新，无需刷新 |
| 舍入规则 | Banker's 舍入 (half-to-even) | 所有转换边界统一 |
| 缓存策略 | 纯版本号（无 TTL） | 版本号变化时刷新 |
| 无汇率处理 | 显示回退基准货币，结算拒绝 | 用户知情 + 财务安全 |

---

## 2. 数据库约束

### 2.1 currencies 表

| 约束 | 规则 |
|------|------|
| 主键 | UUID |
| 组织隔离 | `organization_id NOT NULL` |
| 货币代码 | ISO 4217 大写，`UNIQUE (organization_id, code)` |
| 单一基准 | 每组织仅一个 `is_base = 1` (partial unique) |
| 审计字段 | `created_by`, `updated_by`, `created_at`, `updated_at` |

### 2.2 exchange_rates 表

| 约束 | 规则 |
|------|------|
| 汇率正数 | `CHECK (rate > 0)` |
| 外键完整 | base_currency, target_currency → currencies(organization_id, code) |
| 唯一性 | `UNIQUE (organization_id, base_currency, target_currency, effective_at)` |
| 审计字段 | `created_by`, `updated_by`, `created_at`, `updated_at` |

### 2.3 exchange_rate_versions 表

| 约束 | 规则 |
|------|------|
| 主键 | `organization_id` |
| 版本递增 | 任何汇率变更时 `version += 1` |

### 2.4 transactions 表扩展

| 字段 | 约束 |
|------|------|
| base_currency | 结算时 NOT NULL |
| base_amount_cents | 结算时 NOT NULL |
| settlement_currency | 结算时 NOT NULL |
| settlement_amount_cents | 结算时 NOT NULL |
| exchange_rate | 结算时 NOT NULL |
| exchange_rate_at | 结算时 NOT NULL |

---

## 3. 服务层约束

### 3.1 ExchangeRateService

```typescript
interface ExchangeRateService {
  // 获取当前汇率（仅从数据库）
  getRate(organizationId: string, base: string, target: string): Promise<ExchangeRate | null>;

  // 获取所有汇率（用于前端缓存）
  getAllRates(organizationId: string): Promise<ExchangeRateMap>;

  // 获取版本号
  getVersion(organizationId: string): Promise<number>;

  // 设置手动汇率（递增版本号）
  setManualRate(organizationId: string, base: string, target: string, rate: number, userId: string): Promise<void>;

  // 从外部 API 同步（递增版本号）
  syncFromProvider(organizationId: string, provider: string, userId: string): Promise<void>;
}
```

**约束**：
- 所有汇率读取仅从数据库
- 任何写操作必须递增 `exchange_rate_versions.version`
- 必须记录 `created_by` / `updated_by`

### 3.2 CurrencyConversionService

```typescript
interface CurrencyConversionService {
  convert(params: {
    organizationId: string;
    amountCents: number;    // 输入：整数 cents
    fromCurrency: string;
    toCurrency: string;
  }): Promise<ConversionResult>;
}

interface ConversionResult {
  amountCents: number;      // 输出：整数 cents
  currency: string;
  rate: number;
  rateAt: Date;
  isConverted: boolean;     // false = 回退到基准货币
}
```

**约束**：
- 输入输出统一为整数 cents
- 舍入规则：Banker's 舍入 (Math.round 用 half-to-even)
- 无汇率时：`isConverted = false`，返回原始货币

### 3.3 结算流程约束

```typescript
// 结算必须：
// 1. 获取数据库最新汇率
// 2. 如果无汇率，拒绝并抛出 MissingExchangeRateError
// 3. 计算 settlement_amount_cents（Banker's 舍入）
// 4. 在 transaction 中保存所有 FX 快照字段（非 null）
// 5. 调用 PaymentService
```

---

## 4. API 约束

### 4.1 tRPC Router

| 路由 | 权限 | 输入 | 输出 |
|------|------|------|------|
| `currencies.list` | 已登录 | organizationId | Currency[] |
| `currencies.getEnabled` | 已登录 | organizationId | Currency[] |
| `currencies.getBase` | 已登录 | organizationId | Currency |
| `currencies.setBase` | **Admin** | organizationId, code | void |
| `currencies.create` | **Admin** | organizationId, input | Currency |
| `currencies.toggle` | **Admin** | organizationId, code | void |
| `exchangeRates.getAll` | 已登录 | organizationId | ExchangeRateResponse |
| `exchangeRates.getVersion` | 已登录 | organizationId | number |
| `exchangeRates.set` | **Admin** | organizationId, input | void |
| `exchangeRates.syncNow` | **Admin** | organizationId, provider | void |
| `conversion.convert` | 已登录 | organizationId, input | ConversionResult |
| `conversion.batch` | 已登录 | organizationId, input | Record<string, ConversionResult> |

### 4.2 ExchangeRateResponse 结构

```typescript
interface ExchangeRateResponse {
  baseCurrency: string;
  rates: Record<string, {
    rate: number;
    effectiveAt: string;
    expiresAt: string | null;
    source: string;
  }>;
  version: number;
}
```

---

## 5. 前端约束

### 5.1 useCurrency() Hook

与 i18n 的 `useTranslation()` 模式一致，通过 Context + Hook 实现响应式更新：

```typescript
interface UseCurrencyReturn {
  // 核心
  $p: PriceFormatter;           // 价格格式化函数
  currency: string;             // 当前用户货币
  setCurrency: (code: string) => void;  // 切换货币（触发响应式更新）

  // 数据
  baseCurrency: string;         // 组织基准货币
  rates: Record<string, number>;
  currencies: Currency[];

  // 状态
  isLoading: boolean;
  version: number;
}

// 使用示例（与 useTranslation 一致）
function PricingCard({ plan }: { plan: Plan }) {
  const { $p, currency, setCurrency } = useCurrency();

  return (
    <div>
      {/* 货币切换时自动重新渲染，无需刷新页面 */}
      <p className="price">{$p(plan.priceCents, plan.currency)}</p>
    </div>
  );
}
```

### 5.2 $p 函数签名

```typescript
interface PriceFormatter {
  (amountCents: number, fromCurrency: string, toOrOptions?: string | PriceOptions): string;
  raw(amountCents: number, fromCurrency: string, to?: string): RawResult;
  format(amountCents: number, currency: string, decimals?: number): string;
  withNote(amountCents: number, fromCurrency: string, to?: string): string;
  parts(amountCents: number, fromCurrency: string, to?: string): PriceParts;
  symbol(currency: string): string;
  amount(amountCents: number, fromCurrency: string, to?: string): number;
  value(amountCents: number, fromCurrency: string, to?: string): number;
}
```

### 5.3 Intl.NumberFormat 缓存

```typescript
// 按 (locale, currency, fractionDigits) 缓存
const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${locale}:${currency}:${fractionDigits}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }));
  }
  return formatterCache.get(key)!;
}
```

### 5.4 缓存策略

```typescript
// 仅基于版本号失效（无 TTL）
interface CurrencyCache {
  organizationId: string;
  version: number;
  baseCurrency: string;
  rates: Record<string, number>;
  currencies: Currency[];
}

// localStorage key: `wr:currency:${organizationId}`

// 检查版本
async function shouldRefreshCache(organizationId: string): Promise<boolean> {
  const cached = getCachedData(organizationId);
  if (!cached) return true;

  const serverVersion = await trpc.exchangeRates.getVersion({ organizationId });
  return cached.version < serverVersion;
}
```

---

## 6. 禁止行为

| 禁止 | 原因 |
|------|------|
| ❌ 插件处理货币/汇率 | GLOBALIZATION §3.4 |
| ❌ 结算使用缓存汇率 | 财务风险 |
| ❌ 交易记录缺少汇率快照 | 审计要求 |
| ❌ 全局 $p() 函数 | SSR 反模式 |
| ❌ 前端计算金额（除格式化外） | 治理约束 |
| ❌ 货币代码小写 | ISO 4217 标准 |
| ❌ 外部 API 作为实时汇率源 | 仅用于后台同步 |

---

## 7. PBT (Property-Based Testing) 属性

### 7.1 转换属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|----------|
| 幂等性 | `convert(convert(x, A, B), B, A) ≈ x` (舍入误差内) | 生成随机金额和货币对，验证往返误差 < 1 cent |
| 正数保持 | `amount > 0 → converted > 0` | 生成正整数，验证输出正整数 |
| 零值保持 | `convert(0, A, B) = 0` | 验证零值转换 |
| 舍入边界 | 舍入结果在 ±0.5 cents 内 | 验证 Banker's 舍入规则 |

### 7.2 数据属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|----------|
| 单一基准 | `count(is_base=1 per organization) = 1` | 尝试设置多个 is_base=1 |
| 汇率正数 | `rate > 0` | 尝试插入 0 或负数 |
| 版本单调递增 | `version_after > version_before` | 连续写操作验证版本递增 |

### 7.3 缓存属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|----------|
| 版本一致性 | 服务端版本变更后，客户端检测到过期 | 模拟版本变更，验证 shouldRefreshCache |

---

## 8. 迁移策略

### 8.1 步骤

1. **创建表**：currencies, exchange_rates, exchange_rate_versions
2. **扩展 transactions**：添加 FX 快照字段（允许 null）
3. **种子数据**：为每个组织创建默认货币（USD）并设为 is_base
4. **回填**：现有 plans.currency 标准化为大写
5. **外键**：添加 plans.currency → currencies 外键

### 8.2 回滚策略

- 删除新增字段和表
- 保留 plans.currency 原值

---

## 9. 成功标准

### 功能
- [ ] 每组织可独立配置货币
- [ ] 每组织可设置基准货币
- [ ] 管理员可手动设置汇率
- [ ] 管理员可从外部 API 同步汇率
- [ ] 前端正确显示换算价格
- [ ] 无汇率时回退基准货币 + 标记
- [ ] 结算使用数据库最新汇率
- [ ] 交易记录包含完整 FX 快照

### 技术
- [ ] useCurrency() Hook 工作正常
- [ ] Intl.NumberFormat 有缓存
- [ ] 版本号正确触发缓存刷新
- [ ] Banker's 舍入正确实现
- [ ] 审计字段完整
