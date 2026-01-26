# 计费、支付与用量系统实施计划

> 版本：v1.0
> 创建日期：2026-01-13
> 状态：待批准

---

## 1. 概述

### 1.1 目标
实现一个基于 Core + Plugin 架构的 SaaS 计费、支付和用量管理系统，支持：
- Interface-First：PaymentAdapter 接口由网关插件实现
- Dogfooding：内部会员系统使用与外部插件相同的 Payment API
- 混合计费：时间订阅 + 用量配额
- 智能扣费（Waterfall）：按优先级和过期时间排序扣费

### 1.2 架构决策
- **方案 A**：Core Billing Module + Plugin Adapters
- Core 拥有 PaymentService，暴露统一 API
- 网关（Stripe/Alipay）作为插件实现 PaymentAdapter 接口

---

## 2. 后端架构（Codex 设计）

### 2.1 目录结构

```
apps/server/src/billing/
├── adapters/
│   ├── payment-adapter.interface.ts      # PaymentAdapter 抽象
│   └── registry.ts                       # 适配器注册/发现
├── dto/
│   ├── payment-intent.dto.ts
│   └── usage.dto.ts
├── services/
│   ├── payment.service.ts                # createPaymentIntent / handleWebhook
│   ├── usage.service.ts                  # consume 瀑布扣费
│   ├── quota.service.ts                  # grant/refresh 额度
│   └── wallet.service.ts                 # 钱包充值/扣费
├── repos/
│   ├── billing.repo.ts                   # 事务性仓储
│   └── quota.repo.ts                     # 配额桶读写
├── events/
│   └── billing.events.ts                 # PAYMENT_SUCCESS 定义
├── billing.module.ts
└── index.ts
```

### 2.2 数据模型（Drizzle Schema）

```typescript
// apps/server/src/db/schema/billing.ts

// 套餐定义
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  interval: text('interval', { enum: ['month', 'year'] }).notNull(),
  intervalCount: integer('interval_count').notNull().default(1),
  currency: text('currency').notNull().default('usd'),
  priceCents: integer('price_cents').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 套餐权益项
export const planItems = pgTable('plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: text('plan_id').references(() => plans.id).notNull(),
  featureKey: text('feature_key').notNull(),
  type: text('type', { enum: ['boolean', 'metered'] }).notNull(),
  amount: integer('amount'),
  resetMode: text('reset_mode', { enum: ['period', 'never'] }).notNull(),
  priority: integer('priority').notNull().default(0),
  overagePriceCents: integer('overage_price_cents'),
  metadata: jsonb('metadata'),
});

// 用户配额桶
export const userQuotas = pgTable('user_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  featureKey: text('feature_key').notNull(),
  balance: integer('balance').notNull(),
  priority: integer('priority').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  sourceType: text('source_type', { enum: ['membership', 'shop_order', 'plugin'] }).notNull(),
  sourceId: text('source_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 用户钱包（超额计费）
export const wallets = pgTable('wallets', {
  userId: text('user_id').primaryKey(),
  balanceCents: integer('balance_cents').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 多态交易账本
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  sourceType: text('source_type', { enum: ['membership', 'shop_order', 'plugin'] }).notNull(),
  sourceId: text('source_id').notNull(),
  status: text('status', { enum: ['PENDING', 'PAID', 'FAILED'] }).notNull().default('PENDING'),
  metadata: jsonb('metadata'),
  gateway: text('gateway'),
  externalId: text('external_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 2.3 核心接口定义

```typescript
// PaymentAdapter 接口
export interface PaymentAdapter {
  readonly gateway: string;

  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    userId: string;
    sourceType: 'membership' | 'shop_order' | 'plugin';
    sourceId: string;
    mode: 'payment' | 'setup';
    metadata?: Record<string, unknown>;
  }): Promise<{ externalId: string; clientSecret?: string; payUrl?: string }>;

  handleWebhook(payload: unknown, signature: string | undefined): Promise<{
    externalId: string;
    status: 'PAID' | 'FAILED';
    raw: unknown;
  }>;
}

// PaymentService
export class PaymentService {
  createPaymentIntent(params: {
    userId: string;
    amountCents: number;
    currency: string;
    sourceType: 'membership' | 'shop_order' | 'plugin';
    sourceId: string;
    mode: 'payment' | 'setup';
    metadata?: Record<string, unknown>;
    gateway: string;
  }): Promise<{ transactionId: string; clientSecret?: string; payUrl?: string }>;

  handleWebhook(params: {
    gateway: string;
    payload: unknown;
    signature?: string;
  }): Promise<void>;
}

// UsageService
export class UsageService {
  consume(params: {
    userId: string;
    featureKey: string;
    amount: number;
    allowOverage: boolean;
  }): Promise<{ consumed: number; overageChargedCents?: number }>;
}

// QuotaService
export class QuotaService {
  grant(params: {
    userId: string;
    featureKey: string;
    amount: number;
    priority: number;
    expiresAt?: Date;
    sourceType: 'membership' | 'shop_order' | 'plugin';
    sourceId: string;
  }): Promise<void>;
}
```

### 2.4 瀑布扣费算法

```typescript
async consume(params) {
  await db.transaction(async (tx) => {
    // 1. 查询所有有效配额桶，按优先级降序、过期时间升序排序
    const buckets = await tx.select().from(userQuotas)
      .where(and(
        eq(userQuotas.userId, params.userId),
        eq(userQuotas.featureKey, params.featureKey),
        gt(userQuotas.balance, 0),
        or(isNull(userQuotas.expiresAt), gt(userQuotas.expiresAt, new Date()))
      ))
      .orderBy(desc(userQuotas.priority), asc(userQuotas.expiresAt));

    // 2. 迭代扣除
    let remaining = params.amount;
    for (const bucket of buckets) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, bucket.balance);
      await tx.update(userQuotas)
        .set({ balance: sql`${userQuotas.balance} - ${deduct}` })
        .where(eq(userQuotas.id, bucket.id));
      remaining -= deduct;
    }

    // 3. 超额处理
    if (remaining > 0) {
      if (!params.allowOverage) throw new QuotaExceededError();
      // 扣钱包余额
      await tx.update(wallets)
        .set({ balanceCents: sql`${wallets.balanceCents} - ${remaining}` })
        .where(eq(wallets.userId, params.userId));
    }

    // 4. 记录用量（不可变）
    await tx.insert(usageRecords).values({
      userId: params.userId,
      featureKey: params.featureKey,
      amount: params.amount,
      occurredAt: new Date(),
    });
  });
}
```

---

## 3. 前端架构（Gemini 设计）

### 3.1 路由配置

```tsx
// apps/admin/src/App.tsx
<Route path="billing">
  <Route index element={<Navigate to="plans" replace />} />
  <Route path="plans" element={<PlansPage />} />
  <Route path="settings" element={<BillingSettingsPage />} />
</Route>

<Route path="members/:memberId/billing" element={<UserBillingDetailPage />} />
```

### 3.2 侧边栏菜单

```
Billing (Group)
├── Plans (/billing/plans) - Icon: CreditCard
└── Settings (/billing/settings) - Icon: Settings2
```

### 3.3 组件架构

#### PlansPage
```
PlansPage
├── PageHeader (Title + "Create Plan" Action)
├── PlanList (Table)
└── PlanEditor (Sheet/Dialog)
    ├── PlanBasicInfoForm
    └── PlanItemsManager
        ├── PlanItemCard
        └── PlanItemForm
```

#### BillingSettingsPage
```
BillingSettingsPage
└── Tabs [General | Gateways | Invoices]
    ├── Tab: General
    │   ├── CurrencySelect
    │   └── TaxSettings
    └── Tab: Gateways
        ├── GatewayList
        └── GatewayConfigForm (json-schema-form)
```

#### UserBillingDetailPage
```
UserBillingDetailPage
├── WalletOverview
├── QuotaWaterfall (核心可视化组件)
├── SubscriptionCard
└── TransactionHistoryTable
```

### 3.4 QuotaWaterfall 组件

```typescript
interface QuotaBucket {
  id: string;
  name: string;
  priority: number;
  remaining: number;
  total: number;
  expiresAt?: Date | null;
  source: 'plan' | 'addon' | 'gift';
}

interface QuotaWaterfallProps {
  buckets: QuotaBucket[];
  unit: string; // e.g., "tokens"
}
```

**视觉规范**：
- 按 priority DESC, expiresAt ASC 排序
- 顶部项高亮，标记"下一个消耗"
- 即将过期（<3天）显示橙/红色
- 低优先级桶显示灰色

### 3.5 tRPC 接口

```typescript
// billing.plans
billing.plans.list()
billing.plans.create(input)
billing.plans.update(id, input)
billing.plans.toggleStatus(id)
billing.plans.addItem(planId, item)
billing.plans.removeItem(itemId)

// billing.user
billing.user.getWallet(userId)
billing.user.getTransactions(userId, pagination)
billing.user.grantAddon(userId, quota)

// billing.settings
billing.settings.getPublicKey()
billing.settings.updateConfig(config)
```

---

## 4. 实施步骤

### Phase 1: 数据层（预计 2-3 步）
- [ ] 创建 Drizzle Schema（plans, planItems, userQuotas, wallets, transactions）
- [ ] 生成迁移文件并应用
- [ ] 创建 Repository 层

### Phase 2: 核心服务（预计 4-5 步）
- [ ] 实现 PaymentAdapter 接口定义
- [ ] 实现 PaymentService（createPaymentIntent, handleWebhook）
- [ ] 实现 QuotaService（grant）
- [ ] 实现 UsageService（consume 瀑布扣费）
- [ ] 实现 WalletService

### Phase 3: 事件集成（预计 1-2 步）
- [ ] 定义 PAYMENT_SUCCESS 事件
- [ ] 集成 EventBus 发布

### Phase 4: tRPC Router（预计 2-3 步）
- [ ] 创建 billing.plans router
- [ ] 创建 billing.user router
- [ ] 创建 billing.settings router

### Phase 5: Admin UI（预计 3-4 步）
- [ ] 实现 PlansPage
- [ ] 实现 BillingSettingsPage
- [ ] 实现 UserBillingDetailPage
- [ ] 实现 QuotaWaterfall 组件

### Phase 6: 插件适配器示例（预计 1-2 步）
- [ ] 创建 Stripe PaymentAdapter 插件
- [ ] Webhook 端点配置

---

## 5. 配置示例

```json
{
  "plans": [
    {
      "id": "pro_monthly",
      "name": "Pro Monthly",
      "interval": "month",
      "intervalCount": 1,
      "priceCents": 2900,
      "currency": "usd",
      "items": [
        {
          "featureKey": "ai.tokens",
          "type": "metered",
          "amount": 1000,
          "resetMode": "period",
          "priority": 50,
          "overagePriceCents": null
        }
      ]
    },
    {
      "id": "booster_pack",
      "name": "Booster Pack",
      "interval": "one_time",
      "priceCents": 900,
      "currency": "usd",
      "items": [
        {
          "featureKey": "ai.tokens",
          "type": "metered",
          "amount": 500,
          "resetMode": "never",
          "priority": 10,
          "overagePriceCents": null
        }
      ]
    }
  ]
}
```

---

## 6. 与现有系统整合

### 6.1 对齐 ENTITLEMENT_SYSTEM.md
- `plan_items.featureKey` 对应 `capability_id`
- `type/resetMode/amount/priority` 扩展 `plan_grants.limit/overage_policy`
- 订阅激活时由 MembershipModule 调用 `QuotaService.grant`

### 6.2 EventBus 集成
- 定义事件：`PAYMENT_SUCCESS`
- Payload：`{ transactionId, userId, sourceType, sourceId, amountCents, currency, gateway }`
- MembershipModule 订阅此事件以发放配额

---

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Webhook 重复调用 | 基于 externalId 幂等检查 |
| 配额扣减并发 | 事务 + FOR UPDATE 行锁 |
| 货币混币 | 统一 cents 存储，currency 列必填 |
| 适配器故障 | 超时隔离，遵循 plugin-runtime 规则 |

---

**请确认此计划，确认后进入阶段 4 实施。**
