# Webhook System 实施计划

**OpenSpec ID**: `core-webhook-system`
**架构方案**: Option A - Transactional Outbox + BullMQ (稳健型)
**预估工期**: 2-3 天
**批准状态**: 待批准

---

## 📋 目标概览

实现一个生产级 Webhook 系统，支持：
- ✅ 用户配置 Webhook 端点（URL、订阅事件、重试策略）
- ✅ 异步可靠推送 Domain Events 到外部系统
- ✅ HMAC-SHA256 请求签名验证
- ✅ 指数退避重试机制
- ✅ 完整的交付日志和监控
- ✅ 多租户隔离和权限控制

---

## 🏗️ 系统架构

### 核心流程

```
┌──────────────┐
│ Domain Event │ (EventBus)
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ Event Handler   │ ← 监听 EventBus，扩展订阅端点
│ (WebhookEvent   │
│  Handler)       │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ webhook_outbox 表   │ ← 事务性写入（幂等性保障）
│ (Transactional)     │
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│ Outbox Bridge   │ ← 后台轮询，持有分布式锁
│ (Poller/Worker) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ BullMQ Queue    │ ← jobId = dedupe_key（去重）
│ (core_webhook)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Dispatcher      │ ← 执行 HTTP POST + HMAC 签名
│ (Worker)        │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ webhook_deliveries  │ ← 记录交付结果（状态、响应码、错误）
└─────────────────────┘
```

---

## 📦 后端实现计划

### 1. 数据库 Schema

#### 1.1 表结构

**`webhook_endpoints`** - Webhook 端点配置

```typescript
{
  id: text (PK, UUID)
  tenant_id: text (NOT NULL, indexed)
  url: text (NOT NULL)
  secret: text (NOT NULL)  // HMAC 签名密钥
  events: text[] (NOT NULL, GIN indexed)
  enabled: boolean (default: true, indexed)
  retry_policy: jsonb (NOT NULL)  // { attempts, backoffMs, maxBackoffMs }
  created_at: timestamptz
  updated_at: timestamptz

  UNIQUE (tenant_id, url)
}
```

**`webhook_deliveries`** - 交付历史记录

```typescript
{
  id: text (PK, UUID)
  tenant_id: text (NOT NULL, indexed)
  endpoint_id: text (FK → webhook_endpoints, CASCADE)
  event_type: text (NOT NULL)
  payload: jsonb (NOT NULL)
  status: text (CHECK: 'pending' | 'success' | 'failed', indexed)
  attempts: integer (default: 0)
  last_attempt_at: timestamptz
  response_code: integer
  error: text
  dedupe_key: text (NOT NULL, UNIQUE)  // event_id:endpoint_id
  created_at: timestamptz (indexed DESC)
  updated_at: timestamptz
}
```

**`webhook_outbox`** - 事务性 Outbox（可靠推送）

```typescript
{
  id: text (PK, UUID)
  tenant_id: text (NOT NULL, indexed)
  endpoint_id: text (FK → webhook_endpoints, CASCADE)
  event_type: text (NOT NULL)
  payload: jsonb (NOT NULL)
  dedupe_key: text (NOT NULL, UNIQUE)
  available_at: timestamptz (indexed ASC)  // 调度时间
  locked_at: timestamptz
  lock_token: text
  created_at: timestamptz
}
```

#### 1.2 迁移文件

- **文件**: `apps/server/drizzle/0007_webhook_system.sql`
- **包含**: CREATE TABLE + 索引 + 外键约束

---

### 2. 目录结构

```
apps/server/src/webhooks/
├── dto/
│   ├── create-webhook.dto.ts        # Zod schema: createWebhook
│   ├── update-webhook.dto.ts        # Zod schema: updateWebhook
│   ├── webhook-delivery.dto.ts      # Zod schema: deliveryQuery
│   └── retry-policy.dto.ts          # Zod schema: retryPolicy
├── webhook.module.ts                # NestJS Module（注入依赖）
├── webhook.service.ts               # CRUD 端点 + test() 方法
├── webhook.dispatcher.ts            # HTTP POST 执行器 + HMAC 签名
├── webhook.outbox-bridge.ts         # Outbox 轮询 → BullMQ 入队
├── webhook.event-handler.ts         # EventBus 监听器 → Outbox 写入
├── webhook.queue-handler.ts         # BullMQ Worker 注册
├── webhook.repository.ts            # Drizzle 数据访问层
├── webhook.rate-limit.ts            # 令牌桶限流器
├── webhook.hmac.ts                  # HMAC 签名工具
├── webhook.logger.ts                # 结构化日志辅助
└── webhook.router.ts                # tRPC Router
```

---

### 3. 核心模块职责

#### 3.1 WebhookService (`webhook.service.ts`)

- `create(tenantId, input)` - 创建端点，生成 secret
- `list(tenantId)` - 列出租户的所有端点
- `update(tenantId, id, input)` - 更新配置，支持 secret 轮换
- `delete(tenantId, id)` - 删除端点
- `test(tenantId, id, payload?)` - 发送测试事件（入队合成 payload）
- `deliveries(tenantId, id, query)` - 查询交付历史（分页）

#### 3.2 WebhookDispatcher (`webhook.dispatcher.ts`)

```typescript
async dispatch(endpoint: Endpoint, delivery: Delivery): Promise<Result> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(delivery.payload);
  const signature = this.hmac.sign(endpoint.secret, timestamp, body);

  const headers = {
    'X-Webhook-Id': delivery.id,
    'X-Webhook-Timestamp': timestamp.toString(),
    'X-Webhook-Signature': `v1=${signature}`,
    'X-Webhook-Tenant': endpoint.tenantId,
    'Content-Type': 'application/json',
  };

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers,
    body,
    timeout: 10000,  // 10s timeout
  });

  return {
    status: response.ok ? 'success' : 'failed',
    code: response.status,
    error: response.ok ? null : await response.text(),
  };
}
```

#### 3.3 WebhookOutboxBridge (`webhook.outbox-bridge.ts`)

- **触发方式**: 定时任务（每 1 秒扫描一次）
- **锁定机制**: 使用 `locked_at` + `lock_token`（分布式锁）
- **处理逻辑**:
  1. SELECT 前 N 行 WHERE `available_at <= now()` AND `locked_at IS NULL`
  2. UPDATE 设置 `locked_at = now()`, `lock_token = uuid()`
  3. 对每行调用 `queueService.enqueue(jobId=dedupe_key)`
  4. 删除 outbox 行（或标记已处理）

#### 3.4 WebhookEventHandler (`webhook.event-handler.ts`)

```typescript
@Injectable()
export class WebhookEventHandler implements OnModuleInit {
  constructor(
    private eventBus: EventBus,
    private repository: WebhookRepository
  ) {}

  onModuleInit() {
    // 监听所有 domain events
    this.eventBus.on('notification.created', (event) => this.handle(event));
    // 未来扩展更多事件类型
  }

  private async handle(event: DomainEvent) {
    const eventType = this.extractEventType(event);
    const eventId = event.id || this.generateEventId(event);

    // 查找订阅此事件的端点
    const endpoints = await this.repository.findSubscribed(
      event.tenantId,
      eventType
    );

    // 写入 outbox（事务性）
    for (const endpoint of endpoints) {
      await this.repository.insertOutbox({
        tenantId: event.tenantId,
        endpointId: endpoint.id,
        eventType,
        payload: event,
        dedupeKey: `${eventId}:${endpoint.id}`,
      });
    }
  }
}
```

#### 3.5 WebhookQueueHandler (`webhook.queue-handler.ts`)

```typescript
@Injectable()
export class WebhookQueueHandler implements OnModuleInit {
  constructor(
    private queueService: QueueService,
    private dispatcher: WebhookDispatcher,
    private repository: WebhookRepository
  ) {}

  onModuleInit() {
    this.queueService.registerHandler('core_webhook_dispatch', this.handleJob.bind(this));
  }

  private async handleJob(data: JobData, job: Job) {
    const { deliveryId } = data;

    const delivery = await this.repository.findDelivery(deliveryId);
    const endpoint = await this.repository.findEndpoint(delivery.endpointId);

    // 执行 HTTP POST
    const result = await this.dispatcher.dispatch(endpoint, delivery);

    // 更新交付记录
    await this.repository.updateDelivery(deliveryId, {
      status: result.status,
      attempts: delivery.attempts + 1,
      lastAttemptAt: new Date(),
      responseCode: result.code,
      error: result.error,
    });

    if (result.status === 'failed') {
      throw new Error(result.error);  // 触发 BullMQ 重试
    }
  }
}
```

---

### 4. tRPC Router

```typescript
export const webhookRouter = router({
  create: protectedProcedure
    .use(requirePermission('webhook:create'))
    .input(createWebhookSchema)
    .mutation(({ ctx, input }) => webhookService.create(ctx.tenantId, input)),

  list: protectedProcedure
    .use(requirePermission('webhook:read'))
    .query(({ ctx }) => webhookService.list(ctx.tenantId)),

  update: protectedProcedure
    .use(requirePermission('webhook:update'))
    .input(updateWebhookSchema)
    .mutation(({ ctx, input }) => webhookService.update(ctx.tenantId, input)),

  delete: protectedProcedure
    .use(requirePermission('webhook:delete'))
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => webhookService.delete(ctx.tenantId, input.id)),

  test: protectedProcedure
    .use(requirePermission('webhook:test'))
    .input(testWebhookSchema)
    .mutation(({ ctx, input }) => webhookService.test(ctx.tenantId, input)),

  deliveries: protectedProcedure
    .use(requirePermission('webhook:read'))
    .input(deliveryQuerySchema)
    .query(({ ctx, input }) => webhookService.deliveries(ctx.tenantId, input)),
});
```

**权限定义**:
- `webhook:create` - 创建 Webhook 端点
- `webhook:read` - 查看端点和日志
- `webhook:update` - 更新配置
- `webhook:delete` - 删除端点
- `webhook:test` - 发送测试事件

---

### 5. HMAC 签名实现

```typescript
// webhook.hmac.ts
export class WebhookHMAC {
  sign(secret: string, timestamp: number, body: string): string {
    const message = `${timestamp}.${body}`;
    return crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');
  }

  verify(secret: string, timestamp: number, body: string, signature: string): boolean {
    const expected = this.sign(secret, timestamp, body);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }
}
```

---

### 6. 幂等性保证

- **dedupe_key 生成规则**: `${eventId}:${endpointId}`
- **Outbox 唯一约束**: `UNIQUE(dedupe_key)` 防止重复插入
- **BullMQ jobId**: 使用 `dedupe_key` 作为 jobId，BullMQ 自动去重
- **Worker 二次检查**: 查询 `webhook_deliveries` 是否已有 `status=success` 的相同 dedupe_key

---

### 7. 重试策略

```typescript
// BullMQ Job Options
const jobOptions = {
  jobId: dedupeKey,
  attempts: retryPolicy.attempts || 5,
  backoff: {
    type: 'exponential',
    delay: retryPolicy.backoffMs || 1000,
  },
  timeout: 10000,  // 10s 请求超时
};

// 错误分类
// - 可重试: 429, 5xx, 超时
// - 不可重试: 4xx (除 429)
```

---

### 8. 速率限制

- **实现方式**: 令牌桶（Token Bucket）
- **限流粒度**:
  - 每个端点: 60 req/min
  - 每个租户: 600 req/min
- **存储**: Redis（key: `webhook:ratelimit:{endpoint_id}`)
- **触发动作**: 达到限制后延迟入队（BullMQ delay）

---

## 🎨 前端实现计划

### 1. 路由设计

```typescript
// apps/admin/src/App.tsx
<Routes>
  <Route path="/settings/webhooks" element={<WebhookListPage />} />
  <Route path="/settings/webhooks/:id" element={<WebhookDetailPage />} />
</Routes>
```

**详情页 Tab 参数**: `/settings/webhooks/:id?tab=deliveries`

---

### 2. 组件结构

#### 2.1 主列表页 (`WebhookListPage.tsx`)

```
WebhookListPage
├── PageHeader
│   ├── Title: "Webhooks"
│   └── CreateButton (打开 Dialog)
├── WebhookTable (TanStack Table)
│   ├── Columns: URL | Events | Status Toggle | Last Delivery | Actions
│   └── Pagination
└── CreateWebhookDialog (shadcn Dialog)
    └── WebhookForm
```

#### 2.2 详情页 (`WebhookDetailPage.tsx`)

```
WebhookDetailPage
├── Breadcrumbs: Settings / Webhooks / {url}
├── PageHeader (Title + Delete Button)
├── Tabs (shadcn Tabs)
│   ├── TabsList: [Configuration, Deliveries, Testing]
│   │
│   ├── ConfigurationTab
│   │   ├── WebhookForm (Edit Mode)
│   │   └── SecretSection (Display + Rotate)
│   │
│   ├── DeliveriesTab
│   │   ├── DeliveryStats (Success Rate)
│   │   ├── FilterBar (Status + Date Range)
│   │   └── DeliveriesTable (TanStack Table)
│   │       └── ExpandableRow (Request/Response Details)
│   │
│   └── TestingTab
│       ├── EventSelector
│       ├── PayloadEditor (JSON)
│       ├── SendTestButton
│       └── TestResultLog (实时反馈)
```

---

### 3. TanStack Query Keys

```typescript
export const webhookKeys = {
  all: ['webhooks'] as const,
  lists: () => [...webhookKeys.all, 'list'] as const,
  detail: (id: string) => [...webhookKeys.all, 'detail', id] as const,
  deliveries: (id: string, query: object) => [
    ...webhookKeys.detail(id),
    'deliveries',
    query,
  ] as const,
};
```

**使用示例**:

```typescript
// 列表查询
const { data: webhooks } = trpc.webhook.list.useQuery(undefined, {
  queryKey: webhookKeys.lists(),
});

// 详情查询
const { data: webhook } = trpc.webhook.detail.useQuery({ id }, {
  queryKey: webhookKeys.detail(id),
});

// 交付日志查询（分页）
const { data: deliveries } = trpc.webhook.deliveries.useQuery(
  { id, page, status },
  { queryKey: webhookKeys.deliveries(id, { page, status }) }
);
```

---

### 4. 表单设计 (Zod Schema)

```typescript
import { z } from 'zod';

export const webhookFormSchema = z.object({
  url: z
    .string()
    .url('必须是有效的 URL')
    .startsWith('https://', '为了安全，必须使用 HTTPS'),
  events: z.array(z.string()).min(1, '至少选择一个事件类型'),
  enabled: z.boolean().default(true),
  retryPolicy: z.object({
    attempts: z.number().min(0).max(10).default(5),
    backoffMs: z.number().min(100).max(60000).default(1000),
  }).optional(),
});

export type WebhookFormValues = z.infer<typeof webhookFormSchema>;
```

**表单组件**:

```typescript
// WebhookForm.tsx
<Form {...form}>
  <FormField name="url" label="Webhook URL">
    <Input placeholder="https://your-app.com/webhook" />
  </FormField>

  <FormField name="events" label="订阅事件">
    <MultiSelectCombobox
      options={eventOptions}
      placeholder="选择事件类型..."
    />
  </FormField>

  <FormField name="enabled" label="启用状态">
    <Switch />
  </FormField>

  <Accordion>
    <AccordionItem value="advanced">
      <AccordionTrigger>高级配置</AccordionTrigger>
      <AccordionContent>
        <FormField name="retryPolicy.attempts" label="最大重试次数">
          <Input type="number" min={0} max={10} />
        </FormField>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</Form>
```

---

### 5. 交付日志表格

#### 5.1 列定义

```typescript
const columns: ColumnDef<WebhookDelivery>[] = [
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'eventType',
    header: '事件类型',
    cell: ({ row }) => <Badge variant="outline">{row.original.eventType}</Badge>,
  },
  {
    accessorKey: 'createdAt',
    header: '时间',
    cell: ({ row }) => format(new Date(row.original.createdAt), 'MMM d, HH:mm:ss'),
  },
  {
    header: '响应码',
    cell: ({ row }) => (
      <Badge variant={row.original.responseCode === 200 ? 'success' : 'destructive'}>
        {row.original.responseCode || '-'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant="ghost" onClick={() => row.toggleExpanded()}>
        查看详情
      </Button>
    ),
  },
];
```

#### 5.2 展开行内容

```typescript
// ExpandableDeliveryRow.tsx
<div className="p-4 bg-muted">
  <Tabs defaultValue="request">
    <TabsList>
      <TabsTrigger value="request">请求</TabsTrigger>
      <TabsTrigger value="response">响应</TabsTrigger>
    </TabsList>

    <TabsContent value="request">
      <CodeBlock language="json">
        {JSON.stringify(delivery.payload, null, 2)}
      </CodeBlock>
    </TabsContent>

    <TabsContent value="response">
      {delivery.error ? (
        <Alert variant="destructive">
          <AlertTitle>错误</AlertTitle>
          <AlertDescription>{delivery.error}</AlertDescription>
        </Alert>
      ) : (
        <p>HTTP {delivery.responseCode} - 推送成功</p>
      )}
    </TabsContent>
  </Tabs>
</div>
```

---

### 6. 实时测试反馈

```typescript
// TestingTab.tsx
const testMutation = trpc.webhook.test.useMutation();
const [testResultId, setTestResultId] = useState<string | null>(null);

// 轮询测试结果
const { data: testResult } = trpc.webhook.deliveries.useQuery(
  { id: webhookId, deliveryId: testResultId },
  {
    enabled: !!testResultId,
    refetchInterval: (data) => {
      // 状态为 pending 时每秒轮询
      if (data?.status === 'pending') return 1000;
      return false;  // 停止轮询
    },
  }
);

const handleTest = async () => {
  const result = await testMutation.mutateAsync({ id: webhookId });
  setTestResultId(result.deliveryId);
  toast.info('测试事件已发送，等待响应...');
};

// 显示实时结果
{testResult && (
  <Alert variant={testResult.status === 'success' ? 'default' : 'destructive'}>
    <AlertTitle>{testResult.status === 'success' ? '✅ 成功' : '❌ 失败'}</AlertTitle>
    <AlertDescription>
      响应码: {testResult.responseCode} | 耗时: {testResult.duration}ms
    </AlertDescription>
  </Alert>
)}
```

---

### 7. 响应式设计

#### 移动端适配

```typescript
// WebhookTable.tsx (移动端简化列)
const isMobile = useMediaQuery('(max-width: 768px)');

const mobileColumns = [
  { accessorKey: 'url', header: 'URL' },
  { accessorKey: 'status', header: '状态' },
  { id: 'actions', header: '操作' },
];

const desktopColumns = [
  { accessorKey: 'url', header: 'URL' },
  { accessorKey: 'events', header: '事件数' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'lastDelivery', header: '最后推送' },
  { id: 'actions', header: '操作' },
];

const columns = isMobile ? mobileColumns : desktopColumns;
```

---

### 8. 错误处理

#### 表单验证

```typescript
// 使用 react-hook-form + Zod 自动验证
<FormField
  name="url"
  render={({ field, fieldState }) => (
    <>
      <Input {...field} />
      {fieldState.error && (
        <p className="text-sm text-destructive">{fieldState.error.message}</p>
      )}
    </>
  )}
/>
```

#### API 错误

```typescript
// 全局 Toast 错误处理
const createMutation = trpc.webhook.create.useMutation({
  onError: (error) => {
    toast.error(`创建失败: ${error.message}`);
  },
  onSuccess: () => {
    toast.success('Webhook 创建成功！');
    queryClient.invalidateQueries(webhookKeys.lists());
  },
});
```

---

## 🧪 测试计划

### 后端测试

#### 单元测试

- ✅ HMAC 签名生成和验证（时间戳容差测试）
- ✅ dedupe_key 生成规则（碰撞测试）
- ✅ 重试逻辑（可重试 vs 不可重试错误）
- ✅ 令牌桶限流器（并发场景）

#### 集成测试

- ✅ EventBus → Outbox 写入（租户隔离）
- ✅ Outbox Bridge 锁定机制（多实例竞争）
- ✅ BullMQ 入队幂等性（重复 jobId）
- ✅ Worker 执行 HTTP POST（超时、429、5xx 重试）
- ✅ 交付日志查询（分页、筛选）

---

### 前端测试

#### 单元测试

- ✅ 表单验证（HTTPS、事件必选）
- ✅ Status Badge 渲染（颜色映射）
- ✅ Query Key 生成规则

#### E2E 测试 (Playwright)

- ✅ 创建 Webhook 端点流程
- ✅ 编辑配置并轮换 Secret
- ✅ 发送测试事件并查看结果
- ✅ 查看交付日志并筛选失败记录
- ✅ 删除端点

---

## 📊 可观测性

### 日志字段（结构化）

```json
{
  "level": "info",
  "service": "webhook",
  "tenantId": "tenant-123",
  "endpointId": "endpoint-456",
  "deliveryId": "delivery-789",
  "eventType": "notification.created",
  "dedupeKey": "evt-001:endpoint-456",
  "attempt": 2,
  "status": "success",
  "responseCode": 200,
  "latencyMs": 235,
  "timestamp": "2026-01-12T10:30:00Z"
}
```

### 性能指标

- `webhook_deliveries_total{status,tenant_id}` - 交付总数
- `webhook_delivery_latency_ms{endpoint_id}` - 延迟直方图
- `webhook_queue_depth{queue}` - 队列深度
- `webhook_retry_count{endpoint_id}` - 重试次数

---

## 📅 实施阶段

### Phase 1: 基础架构（Day 1）

- [ ] 创建数据库迁移文件（0007）
- [ ] 实现 Webhook Repository（Drizzle CRUD）
- [ ] 实现 HMAC 工具类
- [ ] 创建 tRPC Router 骨架

### Phase 2: 核心逻辑（Day 1-2）

- [ ] 实现 WebhookService（CRUD + test）
- [ ] 实现 WebhookDispatcher（HTTP + 签名）
- [ ] 实现 EventHandler（EventBus 监听）
- [ ] 实现 Outbox Bridge（轮询 + 入队）
- [ ] 实现 Queue Handler（Worker）

### Phase 3: 前端 UI（Day 2）

- [ ] 创建 Webhook List 页面
- [ ] 创建 Webhook Detail 页面（3 个 Tab）
- [ ] 实现表单验证和提交
- [ ] 实现交付日志表格和筛选
- [ ] 实现测试功能和实时反馈

### Phase 4: 测试和优化（Day 3）

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 性能测试（大量端点场景）
- [ ] 错误处理完善
- [ ] 文档补充

---

## ⚠️ 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Outbox 轮询性能问题 | 高频扫描导致数据库负载 | 使用 `available_at` 索引 + 限制批次大小（N=100） |
| 目标端点响应慢 | 阻塞 Worker | 设置 10s 超时 + 并发限制（Worker concurrency=5） |
| Secret 泄露 | 安全风险 | 前端仅显示掩码，复制需要二次确认 |
| EventBus 事件扩展 | 新事件类型需要手动注册 | 文档化事件注册流程，提供自动发现工具 |

---

## 🎯 验收标准

- ✅ 所有 tRPC API 端点正常工作
- ✅ HMAC 签名验证通过第三方工具验证
- ✅ 重试机制按预期执行（5xx 重试，4xx 失败）
- ✅ 交付日志完整记录所有推送尝试
- ✅ UI 支持创建/编辑/删除/测试端点
- ✅ 交付日志支持筛选和分页
- ✅ 测试覆盖率 ≥ 80%
- ✅ 多租户隔离测试通过

---

## 📚 后续优化（v2.x）

- [ ] 支持 Webhook 签名验证的 SDK（Node.js/Python）
- [ ] 支持自定义 HTTP Headers
- [ ] 支持 Webhook 事件日志的长期归档
- [ ] 支持 Webhook 交付的实时 WebSocket 推送
- [ ] 支持基于事件内容的高级筛选规则
- [ ] 支持 Webhook 端点的健康检查（主动探测）

---

**批准确认**: 请确认此计划后，我将进入实施阶段。
