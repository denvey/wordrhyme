# Multi-Currency System Implementation Tasks

> 零决策实施计划 - 所有约束已在 constraints.md 中确定

---

## Phase 1: 数据层

### Task 1.1: 创建 Drizzle Schema
**文件**: `packages/db/src/schema/currency.ts`

```typescript
// 创建以下表:
// - currencies (组织级)
// - exchange_rates (组织级)
// - exchange_rate_versions (每组织版本)

// 约束:
// - currencies: UNIQUE(organization_id, code), partial unique on is_base=1
// - exchange_rates: CHECK(rate > 0), FK to currencies
// - 所有表包含审计字段
```

**验收**:
- [x] Schema 定义完成
- [x] 类型导出

---

### Task 1.2: 扩展 transactions 表
**文件**: `packages/db/src/schema/billing.ts`

```typescript
// 添加字段:
// - base_currency: text (nullable)
// - base_amount_cents: integer (nullable)
// - settlement_currency: text (nullable)
// - settlement_amount_cents: integer (nullable)
// - exchange_rate: decimal(18,8) (nullable)
// - exchange_rate_at: timestamp (nullable)
```

**验收**:
- [x] 字段添加完成
- [x] 类型更新

---

### Task 1.3: 生成并应用迁移
**命令**: `pnpm db:generate && pnpm db:migrate`

**验收**:
- [x] 迁移文件生成
- [x] 迁移成功应用
- [x] 表结构正确

---

### Task 1.4: 种子数据
**文件**: `packages/db/src/seed/currencies.ts`

```typescript
// 为每个现有组织:
// 1. 创建 USD 货币 (is_base = 1)
// 2. 创建 exchange_rate_versions 记录 (version = 1)
// 3. 标准化 plans.currency 为大写
```

**验收**:
- [x] 种子脚本完成
- [x] 现有租户有默认货币

---

## Phase 2: 服务层 (后端)

### Task 2.1: CurrencyRepository
**文件**: `apps/server/src/billing/repos/currency.repo.ts`

```typescript
// 方法:
// - findByOrganization(organizationId): Currency[]
// - findEnabled(organizationId): Currency[]
// - findBase(organizationId): Currency
// - create(organizationId, input): Currency
// - update(organizationId, code, input): void
// - setBase(organizationId, code): void (事务: 清除旧 is_base, 设新 is_base)
// - toggle(organizationId, code): void
```

**验收**:
- [x] 所有方法实现
- [x] setBase 在事务中执行

---

### Task 2.2: ExchangeRateRepository
**文件**: `apps/server/src/billing/repos/exchange-rate.repo.ts`

```typescript
// 方法:
// - getRate(organizationId, base, target): ExchangeRate | null
//   查询: effective_at <= now, 按 effective_at DESC 取第一条
// - getAllRates(organizationId): ExchangeRateMap
// - getVersion(organizationId): number
// - setRate(organizationId, base, target, rate, source, userId): void
//   必须递增版本号
// - incrementVersion(organizationId): number
```

**验收**:
- [x] 所有方法实现
- [x] 版本号递增正确

---

### Task 2.3: ExchangeRateService
**文件**: `apps/server/src/billing/services/exchange-rate.service.ts`

```typescript
@Injectable()
export class ExchangeRateService {
  // 注入 ExchangeRateRepository, CurrencyRepository

  async getRate(tenantId: string, base: string, target: string): Promise<ExchangeRate | null>;
  async getAllRates(tenantId: string): Promise<ExchangeRateResponse>;
  async getVersion(tenantId: string): Promise<number>;
  async setManualRate(tenantId: string, base: string, target: string, rate: number, userId: string): Promise<void>;
  async syncFromProvider(tenantId: string, provider: string, userId: string): Promise<void>;
}
```

**验收**:
- [x] 服务实现
- [x] 写操作递增版本号
- [x] 审计字段填充

---

### Task 2.4: CurrencyConversionService
**文件**: `apps/server/src/billing/services/currency-conversion.service.ts`

```typescript
@Injectable()
export class CurrencyConversionService {
  async convert(params: ConvertParams): Promise<ConversionResult> {
    // 1. 如果 from === to, 直接返回
    // 2. 获取汇率
    // 3. 如果无汇率, isConverted = false, 返回原货币
    // 4. 计算: Math.round(amountCents * rate) 使用 Banker's 舍入
    // 5. 返回 ConversionResult
  }

  async batch(params: BatchConvertParams): Promise<Record<string, ConversionResult>>;
}

// Banker's 舍入实现
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) === 0.5) {
    return rounded % 2 === 0 ? rounded : rounded - Math.sign(value);
  }
  return rounded;
}
```

**验收**:
- [x] Banker's 舍入正确
- [x] 无汇率回退正确

---

### Task 2.5: 扩展 PaymentService
**文件**: `apps/server/src/billing/services/payment.service.ts`

```typescript
// 修改 createPaymentIntent:
// 1. 获取 plan 基准价格和货币
// 2. 获取结算货币的汇率 (从数据库)
// 3. 如果无汇率, 抛出 MissingExchangeRateError
// 4. 计算 settlement_amount_cents (Banker's 舍入)
// 5. 创建 transaction 时填充所有 FX 字段
// 6. 调用支付网关
```

**验收**:
- [x] FX 字段正确填充
- [x] 无汇率时抛出错误

---

### Task 2.6: tRPC Router - currencies
**文件**: `apps/server/src/trpc/routers/billing/currencies.ts`

```typescript
// 路由:
// - list: protectedProcedure
// - getEnabled: protectedProcedure
// - getBase: protectedProcedure
// - setBase: adminProcedure
// - create: adminProcedure
// - toggle: adminProcedure
```

**验收**:
- [x] 所有路由实现
- [x] 权限正确

---

### Task 2.7: tRPC Router - exchangeRates
**文件**: `apps/server/src/trpc/routers/billing/exchange-rates.ts`

```typescript
// 路由:
// - getAll: protectedProcedure
// - getVersion: protectedProcedure
// - set: adminProcedure
// - syncNow: adminProcedure
```

**验收**:
- [x] 所有路由实现
- [x] 权限正确

---

### Task 2.8: tRPC Router - conversion
**文件**: `apps/server/src/trpc/routers/billing/conversion.ts`

```typescript
// 路由:
// - convert: protectedProcedure
// - batch: protectedProcedure
```

**验收**:
- [x] 所有路由实现

---

## Phase 3: 前端

### Task 3.1: CurrencyContext
**文件**: `packages/ui/src/providers/CurrencyContext.tsx`

```typescript
interface CurrencyContextValue {
  organizationId: string;
  baseCurrency: string;
  userCurrency: string;
  setUserCurrency: (code: string) => void;  // 触发响应式更新
  currencies: Currency[];
  rates: Record<string, number>;
  version: number;
  isLoading: boolean;
}

// localStorage key: `wr:currency:${organizationId}`
// 版本号检查逻辑
// 货币切换时自动重新渲染使用此 Context 的组件
```

**验收**:
- [x] Context 定义完成
- [x] 版本号检查正确

---

### Task 3.2: CurrencyProvider
**文件**: `packages/ui/src/providers/CurrencyProvider.tsx`

```typescript
// 功能:
// 1. 接收服务端预取的数据（baseCurrency, rates, currencies, version）
// 2. 管理用户货币选择状态（useState）
// 3. 创建 p 函数并绑定到 Context
// 4. 提供 Context 值给子组件

// SSR 约束:
// - 必须是 'use client' 组件
// - 通过 Props 接收服务端数据（非 fetch）
// - 禁止将 p 挂载到 window

'use client';

export function CurrencyProvider({
  baseCurrency,
  rates,
  currencies,
  version,
  children
}: CurrencyProviderProps) {
  const [userCurrency, setUserCurrency] = useState(() =>
    getStoredCurrency() || baseCurrency
  );

  const p = useMemo(
    () => createPriceFormatter({ baseCurrency, rates, userCurrency, currencies }),
    [baseCurrency, rates, userCurrency, currencies]
  );

  // ... 提供 Context
}
```

**验收**:
- [x] Provider 实现
- [x] SSR 数据通过 Props 传递
- [x] 货币切换触发重新渲染

---

### Task 3.2.1: 服务端数据预取
**文件**: `packages/ui/src/currency/server.ts`

```typescript
// SSR 专用：服务端预取货币数据
import 'server-only';

export async function fetchCurrencyData(organizationId: string) {
  // 直接调用后端服务（非 tRPC client）
  const [currencies, rates, version] = await Promise.all([
    currencyRepo.findEnabled(organizationId),
    exchangeRateRepo.getAllRates(organizationId),
    exchangeRateRepo.getVersion(organizationId),
  ]);

  const baseCurrency = currencies.find(c => c.isBase)?.code || 'USD';

  return {
    baseCurrency,
    currencies,
    rates,
    version,
  };
}
```

**验收**:
- [x] 服务端预取函数实现
- [x] 与 i18n 的 fetchMessagesInternal 模式一致

---

### Task 3.3: useCurrency Hook
**文件**: `packages/ui/src/hooks/useCurrency.ts`

```typescript
export function useCurrency(): UseCurrencyReturn {
  const context = useContext(CurrencyContext);
  // ... 包含 p 函数
  return {
    p: createPriceFormatter(context),
    currency: context.userCurrency,
    setCurrency: context.setUserCurrency,
    baseCurrency: context.baseCurrency,
    rates: context.rates,
    currencies: context.currencies,
    isLoading: context.isLoading,
    version: context.version,
  };
}
```

**验收**:
- [x] Hook 实现
- [x] p 函数正确

---

### Task 3.4: p 价格格式化函数
**文件**: `packages/ui/src/price/formatter.ts`

```typescript
// 实现 PriceFormatter 接口的所有方法:
// - 主函数 (amountCents, from, toOrOptions) => string
// - raw() => RawResult
// - format() => string
// - withNote() => string
// - parts() => PriceParts
// - symbol() => string
// - amount() => number
// - value() => number

// 包含 Intl.NumberFormat 缓存
```

**验收**:
- [x] 所有方法实现
- [x] Formatter 缓存正确
- [x] Banker's 舍入正确

---

### Task 3.5: Banker's 舍入工具
**文件**: `packages/ui/src/price/rounding.ts`

```typescript
/**
 * Banker's rounding (half to even)
 * 0.5 向最近的偶数舍入
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;

  if (decimal === 0.5) {
    // 如果整数部分是偶数，向下舍入；否则向上舍入
    return floor % 2 === 0 ? floor : floor + 1;
  }

  return Math.round(value);
}
```

**验收**:
- [x] 边界测试通过
- [x] 与后端一致

---

### Task 3.6: PriceDisplay 组件
**文件**: `packages/ui/src/components/currency/PriceDisplay.tsx`

```typescript
interface PriceDisplayProps {
  amount: number;        // cents
  currency: string;      // ISO 4217
  showNote?: boolean;    // 显示"参考价格"
  className?: string;
}

export function PriceDisplay({ amount, currency, showNote, className }: PriceDisplayProps) {
  const { p } = useCurrency();

  return (
    <span className={className}>
      {showNote ? p.withNote(amount, currency) : p(amount, currency)}
    </span>
  );
}
```

**验收**:
- [x] 组件实现
- [x] 正确使用 useCurrency

---

### Task 3.7: CurrencySelector 组件
**文件**: `packages/ui/src/components/currency/CurrencySelector.tsx`

```typescript
interface CurrencySelectorProps {
  value: string;
  onChange: (code: string) => void;
  showFlags?: boolean;
}

// 使用 Select 组件
// 只显示 enabled 的货币
```

**验收**:
- [x] 组件实现
- [x] 只显示启用货币

---

### Task 3.8: StyledPrice 组件
**文件**: `packages/ui/src/components/currency/StyledPrice.tsx`

```typescript
// 使用 p.parts() 实现符号和数字分离样式
```

**验收**:
- [x] 组件实现
- [x] 样式分离正确

---

## Phase 4: Admin UI

### Task 4.1: 货币管理页面
**文件**: `apps/admin/src/pages/settings/currencies/index.tsx`

```typescript
// 功能:
// - 货币列表 (DataTable)
// - 添加货币按钮 (Dialog)
// - 编辑货币 (Dialog)
// - 启用/禁用开关
// - 设为基准货币按钮
```

**验收**:
- [x] 页面实现
- [x] CRUD 功能完整

---

### Task 4.2: 汇率管理页面
**文件**: `apps/admin/src/pages/settings/exchange-rates/index.tsx`

```typescript
// 功能:
// - 汇率列表 (基准货币 → 其他货币)
// - 手动设置汇率 (Dialog/Inline)
// - 同步外部 API 按钮
// - 显示最后更新时间和来源
```

**验收**:
- [x] 页面实现
- [x] 设置和同步功能完整

---

### Task 4.3: 套餐编辑页扩展
**文件**: `apps/admin/src/pages/billing/plans/[id].tsx`

```typescript
// 修改:
// - 显示基准货币价格
// - 显示换算后的其他货币价格 (只读)
// - 提示"价格通过汇率自动换算"
```

**验收**:
- [x] 价格显示正确
- [x] 换算预览正确

---

## Phase 5: 测试

### Task 5.1: 后端单元测试
**文件**: `apps/server/src/billing/__tests__/currency.spec.ts`

```typescript
// 测试:
// - CurrencyRepository CRUD
// - ExchangeRateRepository 版本递增
// - CurrencyConversionService Banker's 舍入
// - PaymentService FX 字段填充
```

---

### Task 5.2: PBT 测试
**文件**: `apps/server/src/billing/__tests__/currency.pbt.ts`

```typescript
// 使用 fast-check:
// - 转换幂等性 (往返误差 < 1 cent)
// - 正数保持
// - 零值保持
// - 版本单调递增
```

---

### Task 5.3: 前端单元测试
**文件**: `packages/ui/src/price/__tests__/formatter.spec.ts`

```typescript
// 测试:
// - p 主函数
// - p.parts
// - p.symbol
// - Banker's 舍入
// - Formatter 缓存
```

---

### Task 5.4: E2E 测试
**文件**: `apps/admin/e2e/currency.spec.ts`

```typescript
// 测试:
// - 创建货币
// - 设置汇率
// - 切换用户货币
// - 价格正确显示
```

---

## Phase 6: 治理文档更新

### Task 6.1: 更新 GLOBALIZATION_GOVERNANCE.md
**文件**: `docs/architecture/GLOBALIZATION_GOVERNANCE.md`

按照 `governance-change.md` 中的内容更新:
- 版本: v0.1 → v0.2
- 修改 §3.1, §3.4
- 新增 §3.5, §3.6

---

## 依赖关系

```
Phase 1 (数据层)
    │
    ▼
Phase 2 (服务层)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 3 (前端)    Phase 4 (Admin)
    │                  │
    └──────┬───────────┘
           ▼
    Phase 5 (测试)
           │
           ▼
    Phase 6 (文档)
```

---

## 预估工时

| Phase | 任务数 | 预估 |
|-------|--------|------|
| Phase 1: 数据层 | 4 | 2-3h |
| Phase 2: 服务层 | 8 | 4-6h |
| Phase 3: 前端 | 8 | 4-5h |
| Phase 4: Admin | 3 | 3-4h |
| Phase 5: 测试 | 4 | 3-4h |
| Phase 6: 文档 | 1 | 0.5h |
| **总计** | **28** | **16-22h** |
