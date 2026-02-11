# 多租户开发注意事项

> WordRhyme 多租户架构开发指南

## 概述

WordRhyme 采用严格的多租户隔离架构。所有数据和操作都绑定到特定租户（Organization），确保租户间的数据完全隔离。本指南帮助开发者理解并正确实现多租户功能。

## 核心原则

### 数据隔离模型

```
┌─────────────────────────────────────────────────────────┐
│                    Platform Level                        │
│  ┌─────────────────────────────────────────────────────┐│
│  │                  Organization A                      ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   ││
│  │  │   Users     │ │   Content   │ │   Plugins   │   ││
│  │  │ (Tenant A)  │ │ (Tenant A)  │ │ (Tenant A)  │   ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘   ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │                  Organization B                      ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   ││
│  │  │   Users     │ │   Content   │ │   Plugins   │   ││
│  │  │ (Tenant B)  │ │ (Tenant B)  │ │ (Tenant B)  │   ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 黄金规则

| 规则 | 说明 |
|------|------|
| **租户必需** | 所有业务操作必须在租户上下文中执行 |
| **自动过滤** | 查询自动添加 `organization_id` 过滤 |
| **禁止跨租户** | 不能访问其他租户的数据 |
| **权限租户绑定** | 权限始终与租户关联 |

---

## 租户上下文

### 上下文来源

```typescript
// 通过 tRPC Context 获取
const { organizationId, userId } = ctx;

// 通过 AsyncLocalStorage 获取（NestJS 服务内）
const ctx = requestContextStorage.getStore();
const organizationId = ctx?.organizationId;

// 通过 PluginContext 获取
const { organizationId, userId } = pluginContext;
```

### 上下文传播

```
HTTP Request
     │
     ▼
Middleware (解析 Organization)
     │
     ▼
AsyncLocalStorage (存储上下文)
     │
     ▼
Service / Repository (自动获取)
     │
     ▼
Database Query (自动添加过滤)
```

---

## 数据库设计

### 表结构要求

```sql
-- 所有业务表必须包含 organization_id
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(255) NOT NULL,  -- 必需字段
  title VARCHAR(255) NOT NULL,
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 必须创建租户索引
CREATE INDEX idx_content_org ON content(organization_id);
CREATE INDEX idx_content_org_created ON content(organization_id, created_at DESC);
```

### 插件表命名

```sql
-- 插件表必须遵循命名规范
CREATE TABLE plugin_{pluginId}_{tableName} (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,  -- 使用 tenant_id 字段
  -- 其他字段...
);
```

---

## 查询实践

### ✅ 正确做法

```typescript
// Repository 自动添加租户过滤
@Injectable()
export class ContentRepository {
  async findAll(organizationId: string): Promise<Content[]> {
    return this.db
      .select()
      .from(content)
      .where(eq(content.organizationId, organizationId))
      .orderBy(desc(content.createdAt));
  }

  async findById(id: string, organizationId: string): Promise<Content | null> {
    const [result] = await this.db
      .select()
      .from(content)
      .where(
        and(
          eq(content.id, id),
          eq(content.organizationId, organizationId)  // 必须检查租户
        )
      );
    return result || null;
  }
}
```

### ❌ 错误做法

```typescript
// 危险！没有租户过滤
async findById(id: string): Promise<Content | null> {
  const [result] = await this.db
    .select()
    .from(content)
    .where(eq(content.id, id));  // 可能返回其他租户的数据！
  return result || null;
}
```

### 使用 Scoped DB

```typescript
// 推荐：使用 scoped-db 自动处理租户隔离
import { ScopedDb } from '../db/scoped-db';

@Injectable()
export class ContentService {
  constructor(private readonly scopedDb: ScopedDb) {}

  async findAll(): Promise<Content[]> {
    // ScopedDb 自动从 AsyncLocalStorage 获取 organizationId
    return this.scopedDb.content.findMany();
  }
}
```

---

## 权限模型

### 权限绑定租户

```typescript
// 权限格式
{resource}:{action}

// 权限检查始终在租户上下文中
const can = await permissionService.check(
  userId,
  organizationId,  // 必须指定租户
  'content:write'
);
```

### 角色层级

```
Platform Admin (跨租户)
       │
       ▼
Organization Admin (单租户)
       │
       ▼
Organization Member (单租户)
```

### 跨租户访问

```typescript
// Platform Admin 可以访问所有租户
if (userRole === 'platform_admin') {
  // 可以使用 organizationId = 'platform' 查看所有数据
  const allContent = await repository.findAll('platform');
}

// 普通用户只能访问自己的租户
const myContent = await repository.findAll(user.organizationId);
```

---

## API 设计

### 路由设计

```typescript
// 租户在 URL 中（推荐用于公开 API）
GET /api/org/:orgSlug/content/:id

// 租户从 Session 获取（推荐用于内部 API）
GET /api/content/:id  // organizationId 从认证上下文获取
```

### tRPC 实现

```typescript
export const contentRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // ctx.organizationId 自动从认证中获取
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organization context required',
        });
      }

      const content = await contentService.findById(
        input.id,
        ctx.organizationId  // 传递租户 ID
      );

      if (!content) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Content not found',
        });
      }

      return content;
    }),
});
```

---

## 缓存策略

### 缓存键命名

```typescript
// 必须包含租户 ID
const cacheKey = `tenant:${organizationId}:content:${contentId}`;

// 使用 CacheManager 自动处理
const cache = await cacheManager.forTenant(organizationId);
await cache.set('content', contentId, data);
```

### 缓存失效

```typescript
// 失效特定租户的缓存
await cache.invalidatePattern(`tenant:${organizationId}:content:*`);

// 不要使用无租户前缀的键
// ❌ await cache.set('content', id, data);
// ✅ await tenantCache.set('content', id, data);
```

---

## 事件系统

### 事件命名

```typescript
// 事件必须包含租户信息
interface ContentCreatedEvent {
  organizationId: string;
  contentId: string;
  createdBy: string;
  // ...
}

eventBus.emit('content.created', {
  organizationId: ctx.organizationId,
  contentId: content.id,
  createdBy: ctx.userId,
});
```

### 事件订阅

```typescript
// 订阅时检查租户
eventBus.on('content.created', async (event) => {
  // 只处理当前租户的事件
  if (event.organizationId !== myOrganizationId) {
    return;
  }

  await processContent(event.contentId);
});
```

---

## 插件开发

### 自动隔离

```typescript
// 插件上下文自动包含租户信息
async function onEnable(ctx: PluginContext) {
  // ctx.organizationId 自动设置
  ctx.logger.info('Plugin enabled', {
    organizationId: ctx.organizationId,
  });

  // Database Capability 自动添加租户过滤
  const items = await ctx.db.query({ table: 'items' });
  // 实际执行: WHERE tenant_id = 'org-123'
}
```

### 设置隔离

```typescript
// 租户级设置
await ctx.settings.set('theme', 'dark');  // 保存到当前租户

// 全局设置（跨所有租户）
await ctx.settings.set('version', '2.0', { global: true });

// 读取时自动级联
const theme = await ctx.settings.get('theme');
// 查询顺序: plugin_tenant → plugin_global → defaultValue
```

---

## 测试策略

### 单元测试

```typescript
describe('ContentService', () => {
  it('should only return content for the specified tenant', async () => {
    // 创建两个租户的数据
    await createContent({ organizationId: 'org-a', title: 'A' });
    await createContent({ organizationId: 'org-b', title: 'B' });

    // 查询租户 A
    const contentA = await service.findAll('org-a');
    expect(contentA).toHaveLength(1);
    expect(contentA[0].title).toBe('A');

    // 查询租户 B
    const contentB = await service.findAll('org-b');
    expect(contentB).toHaveLength(1);
    expect(contentB[0].title).toBe('B');
  });

  it('should not allow cross-tenant access', async () => {
    await createContent({ id: 'content-1', organizationId: 'org-a' });

    // 用租户 B 的上下文查询租户 A 的内容
    const content = await service.findById('content-1', 'org-b');
    expect(content).toBeNull();  // 应该找不到
  });
});
```

### 集成测试

```typescript
describe('Cross-Tenant Isolation', () => {
  it('should enforce tenant isolation at API level', async () => {
    // 以租户 A 的用户登录
    const tokenA = await login('user@org-a.com');

    // 创建内容
    const content = await createContent(tokenA, { title: 'Secret' });

    // 以租户 B 的用户登录
    const tokenB = await login('user@org-b.com');

    // 尝试访问租户 A 的内容
    const response = await api.get(`/content/${content.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    expect(response.status).toBe(404);  // 应该返回 404
  });
});
```

---

## 常见问题

### Q: 如何在后台任务中获取租户上下文？

```typescript
// 方法 1: 在任务数据中传递
await queueService.enqueue('process-content', {
  organizationId: ctx.organizationId,
  contentId: content.id,
});

// Worker 中
async function processContent(job) {
  const { organizationId, contentId } = job.data;
  // 使用 organizationId 查询
}

// 方法 2: 使用 runWithContext
await requestContextStorage.run(
  { organizationId, userId: 'system' },
  async () => {
    // 在此上下文中的所有操作都会使用指定的租户
    await service.doSomething();
  }
);
```

### Q: 如何实现租户切换？

```typescript
// 前端：切换租户
async function switchOrganization(newOrgId: string) {
  // 1. 验证用户有权访问目标租户
  const hasAccess = await checkAccess(userId, newOrgId);
  if (!hasAccess) throw new Error('Access denied');

  // 2. 更新 Session 中的当前租户
  await session.setOrganizationId(newOrgId);

  // 3. 刷新页面数据
  await router.refresh();
}
```

### Q: 如何处理跨租户报表？

```typescript
// 只有 Platform Admin 可以访问
if (!isPlatformAdmin(ctx.userId)) {
  throw new ForbiddenError('Platform admin required');
}

// 使用 'platform' 作为特殊的 organizationId
const allData = await repository.findAll('platform');

// 或者明确查询多个租户
const aggregated = await db
  .select({ orgId: content.organizationId, count: count() })
  .from(content)
  .groupBy(content.organizationId);
```

---

## 检查清单

### 开发时检查

- [ ] 所有表都有 `organization_id` 或 `tenant_id` 字段
- [ ] 所有查询都包含租户过滤条件
- [ ] 缓存键包含租户 ID
- [ ] 事件数据包含租户 ID
- [ ] API 响应不会泄露其他租户的数据

### 代码审查检查

- [ ] 没有不带租户过滤的全表查询
- [ ] 使用 `findById` 时检查了租户
- [ ] 没有硬编码的租户 ID
- [ ] 测试覆盖了跨租户隔离场景

### 部署前检查

- [ ] 数据库迁移包含租户索引
- [ ] 现有数据已填充租户 ID
- [ ] 缓存预热考虑了租户隔离

