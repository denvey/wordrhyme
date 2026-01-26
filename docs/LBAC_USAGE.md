# LBAC (Label-Based Access Control) 使用文档

> 基于标签的访问控制系统，遵循 Frozen Spec 实现

## 目录

- [架构概述](#架构概述)
- [核心概念](#核心概念)
- [快速开始](#快速开始)
- [数据库 API](#数据库-api)
- [授权 API](#授权-api)
- [插件扩展](#插件扩展)
- [最佳实践](#最佳实践)
- [FAQ](#faq)

---

## 架构概述

### 双模型架构 (Hybrid CQRS + LBAC)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Write Model (SoT)                          │
│                    entity_ownerships 表                          │
│              ↑ 唯一真相源，所有授权必须写入这里                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 事件触发
┌─────────────────────────────────────────────────────────────────┐
│                      Read Model (Cache)                         │
│              业务表上的 aclTags / denyTags 字段                   │
│              ↑ 性能缓存，由 TagSyncService 同步                   │
└─────────────────────────────────────────────────────────────────┘
```

### 执行顺序（强制）

```sql
WHERE
  1️⃣ organization_id = :tenantId           -- 租户隔离
  AND (
    2️⃣ (aclTags && :userKeys)               -- 允许列表
    OR 4️⃣ extraDiscoveryLogic               -- 插件发现（可选）
  )
  AND 3️⃣ NOT (denyTags && :userKeys)        -- 拒绝列表（绝对）
```

**⚠️ 关键：Deny 永远在最后执行，不可被绕过**

---

## 核心概念

### Scope Types（作用域类型）

| 类型 | 说明 | 示例 |
|------|------|------|
| `user` | 用户 | `user:abc123` |
| `org` | 组织 | `org:xyz789` |
| `team` | 团队 | `team:engineering` |
| `space` | 空间（预留） | `space:marketing` |
| `role` | 角色 | `role:editor` |
| `public` | 公开 | `public:all` |

### Access Levels（访问级别）

| 级别 | 说明 |
|------|------|
| `read` | 只读访问 |
| `write` | 读写访问 |

### Ownership Inheritance（继承）

- 继承只在**写时展开**，读时不解析
- 所有继承记录都追溯源头（`inheritedFromType/Id`）
- 当 Team/Space 成员变化时，自动重新展开

---

## 快速开始

### 1. 业务表添加 LBAC 字段

```typescript
import { permissionFields } from '@/db/schema/permission-fields';

export const articles = pgTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  status: text('status').default('draft'),

  // 展开权限字段
  ...permissionFields,
});
```

这会添加以下字段：
- `spaceId` - 空间 ID（预留）
- `teamId` - 团队 ID
- `ownerId` - 当前所有者
- `creatorId` - 原始创建者
- `aclTags` - 允许访问标签
- `denyTags` - 拒绝访问标签

### 2. 使用 LBAC 增强的 db

```typescript
import { db } from '@/db';

// 所有查询自动注入 LBAC 过滤
const articles = await db.select().from(articlesTable);
```

### 3. 授权

```typescript
import { ownershipRepository } from '@/lbac';

await ownershipRepository.grant({
  entityType: 'article',
  entityId: 'article-123',
  scopeType: 'user',
  scopeId: 'user-456',
  level: 'read',
});
```

---

## 数据库 API

### 导入

```typescript
import { db } from '@/db';
```

`db` 是 Drizzle 的增强版本，**完全兼容 Drizzle 原生 API**，同时自动注入 LBAC 过滤。

---

### SELECT 查询

#### SQL-like API

```typescript
// ✅ 自动注入 LBAC
const articles = await db.select().from(articlesTable);

// ✅ 带条件
const published = await db.select()
  .from(articlesTable)
  .where(eq(articlesTable.status, 'published'));

// ✅ 复杂查询（join, orderBy, limit 等）
const result = await db.select()
  .from(articlesTable)
  .leftJoin(usersTable, eq(articlesTable.authorId, usersTable.id))
  .where(eq(articlesTable.status, 'published'))
  .orderBy(desc(articlesTable.createdAt))
  .limit(10);
```

#### Query API（关系查询）

```typescript
// ✅ findMany 自动注入 LBAC
const articles = await db.query.articles.findMany({
  where: eq(articlesTable.status, 'published'),
  with: { author: true },
  orderBy: [desc(articlesTable.createdAt)],
  limit: 10,
});

// ✅ findFirst
const article = await db.query.articles.findFirst({
  where: eq(articlesTable.id, 'article-123'),
});
```

---

### INSERT 插入

```typescript
// ✅ 自动设置 organizationId, aclTags, denyTags
await db.insert(articlesTable).values({
  id: generateId(),
  title: 'Hello World',
  content: '...',
});

// 内部自动添加:
// - organizationId: ctx.tenantId
// - aclTags: ['user:当前用户ID']
// - denyTags: []

// ✅ 批量插入
await db.insert(articlesTable).values([
  { title: 'Article 1' },
  { title: 'Article 2' },
]);
```

---

### UPDATE 更新

```typescript
// ✅ 自动注入 LBAC（只能更新有权限的数据）
await db.update(articlesTable)
  .set({ title: 'Updated Title' })
  .where(eq(articlesTable.id, 'article-123'));

// ✅ 带 returning
const updated = await db.update(articlesTable)
  .set({ status: 'published' })
  .where(eq(articlesTable.id, 'article-123'))
  .returning();
```

---

### DELETE 删除

```typescript
// ✅ 自动注入 LBAC（只能删除有权限的数据）
await db.delete(articlesTable)
  .where(eq(articlesTable.id, 'article-123'));

// ✅ 带 returning
const deleted = await db.delete(articlesTable)
  .where(eq(articlesTable.status, 'draft'))
  .returning();
```

---

### 特殊场景

#### 跳过 LBAC（系统查询）

```typescript
// ⚠️ 绕过所有 LBAC（仅系统用）
const all = await db.$raw.select().from(articlesTable);

// ⚠️ 跳过 LBAC 但保留租户过滤
const result = await db.select().from(articlesTable).$skipLbac();

// ⚠️ 跳过租户过滤（跨租户管理）
const result = await db.select().from(articlesTable).$skipTenant();
```

#### 添加 Discovery（高基数关系）

```typescript
import { discoveryBuilders } from '@wordrhyme/plugin-lbac-relationships';

// 查询"我关注的人发布的内容"
const posts = await db.select()
  .from(postsTable)
  .$withDiscovery(sql`EXISTS (SELECT 1 FROM follows WHERE ...)`)
  .where(eq(postsTable.status, 'published'));
```

---

### API 对照表

| 操作 | Drizzle 原生 | LBAC 增强 | 说明 |
|------|-------------|-----------|------|
| 查询 | `db.select().from(table)` | ✅ 相同 | 自动注入 LBAC |
| 条件查询 | `.where(condition)` | ✅ 相同 | 自动合并 LBAC |
| 关系查询 | `db.query.table.findMany()` | ✅ 相同 | 自动注入 LBAC |
| 插入 | `db.insert(table).values()` | ✅ 相同 | 自动设置 tags |
| 更新 | `db.update(table).set().where()` | ✅ 相同 | 自动注入 LBAC |
| 删除 | `db.delete(table).where()` | ✅ 相同 | 自动注入 LBAC |
| 事务 | `db.transaction()` | ✅ 相同 | 透传 |
| 原始访问 | - | `db.$raw.*` | 绕过 LBAC |
| 跳过 LBAC | - | `.$skipLbac()` | 跳过 LBAC |
| 跳过租户 | - | `.$skipTenant()` | 跳过租户过滤 |
| 发现逻辑 | - | `.$withDiscovery(sql)` | 插件扩展 |

---

## 授权 API

### OwnershipRepository

唯一的授权写入入口。

```typescript
import { ownershipRepository } from '@/lbac';

// 授权
await ownershipRepository.grant({
  entityType: string,      // 实体类型
  entityId: string,        // 实体 ID
  scopeType: string,       // 作用域类型
  scopeId: string,         // 作用域 ID
  level?: 'read' | 'write', // 访问级别（默认 read）
  expireAt?: Date,         // 过期时间（可选）
});

// 批量授权
await ownershipRepository.bulkGrant(grants: GrantOptions[]);

// 撤销
await ownershipRepository.revoke({
  entityType: string,
  entityId: string,
  scopeType: string,
  scopeId: string,
});

// 查询实体的所有授权
const ownerships = await ownershipRepository.getByEntity(
  entityType: string,
  entityId: string
);

// 查询作用域可访问的所有实体
const ownerships = await ownershipRepository.getByScope(
  scopeType: string,
  scopeId: string
);

// 检查访问权限
const hasAccess = await ownershipRepository.hasAccess(
  entityType: string,
  entityId: string,
  scopeType: string,
  scopeId: string,
  requiredLevel?: 'read' | 'write'
);

// 清理过期授权
const count = await ownershipRepository.cleanupExpired();
```

### OwnershipInheritanceService

处理带继承的授权。

```typescript
import { ownershipInheritanceService } from '@/lbac';

// 带继承授权（自动展开到团队/空间成员）
await ownershipInheritanceService.grantWithInheritance(
  entityType: string,
  entityId: string,
  scopeType: string,  // 'team' | 'space' 等支持继承的类型
  scopeId: string,
  level: 'read' | 'write'
);

// 带继承撤销
await ownershipInheritanceService.revokeWithInheritance(
  entityType: string,
  entityId: string,
  scopeType: string,
  scopeId: string
);

// 当成员关系变化时调用
await ownershipInheritanceService.onScopeMembershipChanged(
  scopeType: string,
  scopeId: string
);
```

### KeyBuilder

构建用户访问标签。

```typescript
import { keyBuilder } from '@/lbac';

// 构建用户 keys（异步，支持插件）
const keys = await keyBuilder.build({
  userId: 'user-123',
  organizationId: 'org-456',
});
// ['user:user-123', 'org:org-456', 'team:...', 'public:all']

// 同步构建（仅核心 keys）
const keys = keyBuilder.buildSync({
  userId: 'user-123',
  organizationId: 'org-456',
});
// ['user:user-123', 'org:org-456', 'public:all']
```

### TagSyncService

标签同步服务。

```typescript
import { tagSyncService } from '@/lbac';

// 注册实体类型
tagSyncService.registerEntityType('article', articlesTable);

// 手动刷新单个实体的 tags
await tagSyncService.refresh('article', 'article-123');

// 重建所有（灾难恢复）
const { total, rebuilt } = await tagSyncService.rebuildAll('article');
```

---

## 插件扩展

### 可选插件

| 插件 | 功能 | 安装命令 |
|------|------|---------|
| `lbac-teams` | 团队层级 + KeyProvider | `wordrhyme plugin install com.wordrhyme.lbac-teams` |
| `lbac-spaces` | 空间隔离 + MemberProvider | `wordrhyme plugin install com.wordrhyme.lbac-spaces` |
| `lbac-relationships` | 动态关系 + SQL 发现 | `wordrhyme plugin install com.wordrhyme.lbac-relationships` |

### 插件对开发者透明

```typescript
// 开发者代码不变
const articles = await db.select().from(articlesTable);

// 内部发生什么（开发者无感）：
// 1. KeyBuilder 收集 userKeys: ['user:u1', 'org:o1']
// 2. 如果安装了 lbac-teams → 自动追加: ['team:engineering', 'team:backend']
// 3. 如果安装了 lbac-spaces → 自动追加: ['space:finance-workspace']
// 4. 最终 SQL: WHERE acl_tags && ARRAY['user:u1','org:o1','team:engineering'...]
```

### 扩展 KeyBuilder

```typescript
import { keyBuilder } from '@/lbac';

// plugin-teams: 注入团队 keys
keyBuilder.registerProvider({
  id: 'teams',
  async getKeys(ctx) {
    const teams = await getTeamHierarchy(ctx.userId);
    return teams.map(t => `team:${t.id}`);
  },
});
```

### 扩展继承服务

```typescript
import { ownershipInheritanceService } from '@/lbac';

// plugin-teams: 注册团队成员提供者
ownershipInheritanceService.registerMemberProvider({
  scopeType: 'team',
  async getMembers(teamId) {
    const members = await getTeamMembers(teamId);
    return members.map(m => ({
      type: 'user',
      id: m.userId,
    }));
  },
});
```

### 插件发现逻辑（Relationships）

```typescript
import { discoveryBuilders } from '@wordrhyme/plugin-lbac-relationships';

// 关注者可见
const feed = await db.select()
  .from(posts)
  .where(eq(posts.visibility, 'followers'))
  .$withDiscovery(sql.raw(
    discoveryBuilders.followers(userId, 'posts.owner_id')
  ));

// ⚠️ 注意：discovery 仍受 denyTags 约束
```

---

## 最佳实践

### ✅ DO

```typescript
// ✅ 使用 db（自动 LBAC）
const articles = await db.select().from(articlesTable);

// ✅ 通过 Repository 授权
await ownershipRepository.grant({...});

// ✅ 注册实体类型
tagSyncService.registerEntityType('article', articlesTable);

// ✅ 成员变化时通知继承服务
await ownershipInheritanceService.onScopeMembershipChanged('team', teamId);
```

### ❌ DON'T

```typescript
// ❌ 直接操作 entity_ownerships 表
await db.$raw.insert(entityOwnerships).values({...});  // 禁止！

// ❌ 直接修改业务表的 aclTags
await db.$raw.update(articles).set({ aclTags: [...] }); // 禁止！

// ❌ 在 aclTags 中存储大量用户 ID
aclTags: ['user:1', 'user:2', ..., 'user:100000']  // 禁止！
```

### 高基数场景处理

```typescript
// ❌ 错误：把所有关注者 ID 存入 aclTags
aclTags: followers.map(f => `user:${f.id}`)  // 可能有 10 万个！

// ✅ 正确：使用语义标签 + SQL 发现
aclTags: ['visibility:followers']  // 常量标签

// 查询时使用 SQL pull
await db.select().from(posts)
  .$withDiscovery(sql`EXISTS (SELECT 1 FROM follows WHERE ...)`)
  .execute();
```

---

## FAQ

### Q: 为什么需要 entity_ownerships 表？

A: 这是**唯一真相源 (SoT)**。aclTags 只是缓存，可能丢失或不一致。有了 ownership 表：
- 可以审计所有授权历史
- 可以随时重建 aclTags
- 可以追溯继承链

### Q: 为什么 Deny 不可绕过？

A: 这是**安全红线**。Deny 用于：
- 撤销访问（用户离职）
- 内容审核（违规内容）
- 合规要求（敏感数据）

如果插件可以绕过 deny，整个安全模型就失效了。

### Q: 如何实现"组织内公开"？

```typescript
// 方法1：在 aclTags 中添加 org 标签（默认行为）
aclTags: ['org:org-123', 'user:creator-id']

// 方法2：添加 public:all（跨组织公开）
aclTags: ['org:org-123', 'public:all']
```

### Q: 如何实现"只有创建者可见"？

```typescript
// 只添加 user 标签，不添加 org/team
await ownershipRepository.grant({
  entityType: 'article',
  entityId: 'a1',
  scopeType: 'user',
  scopeId: creatorId,
  level: 'write',
});
// aclTags: ['user:creator-id']
// 只有创建者能看到
```

### Q: 如何禁止某人访问？

```typescript
// 方法1：撤销授权
await ownershipRepository.revoke({...});

// 方法2：添加到 denyTags（更强，会阻断继承）
await db.$raw.update(articles)
  .set({
    denyTags: sql`array_append(deny_tags, 'user:banned-user-id')`
  })
  .where(eq(articles.id, articleId));
```

### Q: 如何查看某用户能访问哪些资源？

```typescript
const ownerships = await ownershipRepository.getByScope('user', userId);

// 或者直接查询
const accessibleArticles = await db.select().from(articles);
```

### Q: 如何迁移现有数据？

```typescript
// 1. 为现有数据创建 ownership 记录
for (const article of existingArticles) {
  await ownershipRepository.grant({
    entityType: 'article',
    entityId: article.id,
    scopeType: 'user',
    scopeId: article.ownerId,
    level: 'write',
  });

  await ownershipRepository.grant({
    entityType: 'article',
    entityId: article.id,
    scopeType: 'org',
    scopeId: article.organizationId,
    level: 'read',
  });
}

// 2. 重建所有 tags
await tagSyncService.rebuildAll('article');
```

---

## 数据库表结构

### entity_ownerships

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| entity_type | text | 实体类型 |
| entity_id | text | 实体 ID |
| scope_type | text | 作用域类型 |
| scope_id | text | 作用域 ID |
| level | text | 访问级别 |
| inherited_from_type | text | 继承来源类型 |
| inherited_from_id | text | 继承来源 ID |
| organization_id | text | 租户 ID |
| expire_at | timestamp | 过期时间 |
| created_at | timestamp | 创建时间 |
| created_by | text | 创建者 |

### ownership_audit_log

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| ownership_id | text | 关联的 ownership |
| action | text | 操作类型 |
| before_state | jsonb | 变更前状态 |
| after_state | jsonb | 变更后状态 |
| actor_id | text | 操作者 |
| actor_type | text | 操作者类型 |
| timestamp | timestamp | 时间戳 |

---

## 版本历史

- **v1.1.0** - 统一 DB API，完全兼容 Drizzle 风格
- **v1.0.0** - 初始版本，实现 Frozen Spec
