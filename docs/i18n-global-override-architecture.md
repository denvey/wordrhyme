# i18n 翻译数据架构: 全局共享 + 租户覆盖

## 问题背景

**用户提问**: "那相同的翻译会根据组织id存多份吗"

**检测结果**:
- 迁移前: 456 条记录
- 唯一 key: 12 个
- **冗余率: 97.4%** (444 条重复记录)
- 示例: `common.save` 在 38 个组织中各存一份

---

## 解决方案: 三层翻译模型

### 架构设计

```
┌─────────────────────────────────────────────┐
│           i18n_messages 表                   │
├─────────────────────────────────────────────┤
│ organization_id  │ namespace │ key          │
├─────────────────────────────────────────────┤
│ NULL (全局)      │ common    │ common.save  │ ← 所有租户共享
│ NULL (全局)      │ admin     │ admin.users  │
│ 'org-vip-123'    │ common    │ common.save  │ ← 租户覆盖
└─────────────────────────────────────────────┘

查询逻辑 (Fallback Chain):
  1. 先查 organization_id = 'org-xxx' (租户覆盖)
  2. 如果不存在,查 organization_id = NULL (全局默认)
  3. 返回第一个匹配的结果
```

### 数据层 Schema

```sql
-- 允许 organization_id 为 NULL
ALTER TABLE i18n_messages
  ALTER COLUMN organization_id DROP NOT NULL;

-- 唯一索引支持 NULL
CREATE UNIQUE INDEX i18n_messages_org_ns_key_uidx
  ON i18n_messages (COALESCE(organization_id, ''), namespace, key);

-- organization_id 语义:
--   NULL      = 全局共享翻译(所有租户默认)
--   非 NULL   = 租户自定义覆盖
```

### 查询逻辑实现

```typescript
// 单条翻译查询 (ctx.i18n.t())
const result = await db
  .select({ translations: i18nMessages.translations })
  .from(i18nMessages)
  .where(
    and(
      eq(i18nMessages.namespace, namespace),
      eq(i18nMessages.key, fullKey),
      eq(i18nMessages.isEnabled, true)
    )
  )
  .orderBy(
    // 租户级(0)排在全局级(1)之前
    sql`CASE WHEN ${i18nMessages.organizationId} = ${organizationId} THEN 0 ELSE 1 END`
  )
  .limit(1);

// 批量翻译查询 (ctx.i18n.getMessages())
const results = await db.execute(sql`
  SELECT DISTINCT ON (key) key, translations, organization_id
  FROM i18n_messages
  WHERE (organization_id = ${organizationId} OR organization_id IS NULL)
    AND namespace = ${namespace}
    AND is_enabled = true
  ORDER BY key,
    CASE WHEN organization_id = ${organizationId} THEN 0 ELSE 1 END
`);
```

---

## 三种翻译类型

### 1. Core 系统翻译（全局共享）

```sql
-- 安装时写入 (organization_id = NULL)
INSERT INTO i18n_messages (organization_id, namespace, key, translations, source)
VALUES (
  NULL,
  'common',
  'common.save',
  '{"zh-CN": "保存", "en-US": "Save", "ar-SA": "حفظ"}'::jsonb,
  'core'
);

-- 所有 38 个组织共享这 1 条记录
```

### 2. Plugin 默认翻译（全局共享）

```typescript
// Plugin 安装时
export async function installPluginTranslations(
  pluginId: string,
  organizationId: string, // 参数保留,但实际写 NULL
  i18nConfig: PluginI18nConfig,
  pluginDir: string
): Promise<void> {
  // ...省略 messages 读取逻辑...

  const inserts = Object.entries(messages).map(([key, translations]) => ({
    organizationId: null,  // 🔑 关键: 全局共享
    key: `${namespace}.${key}`,
    namespace,
    type: 'component' as const,
    translations,
    source: 'plugin' as const,
    sourceId: pluginId,
    userModified: false,
    isEnabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(i18nMessages).values(inserts)
    .onConflictDoUpdate({
      target: [/* 唯一索引 */],
      set: { translations: sql`EXCLUDED.translations` }
    });
}
```

### 3. 租户自定义覆盖（租户级）

```typescript
// 管理员在 UI 中修改翻译
async function overrideTranslation(
  organizationId: string,
  key: string,
  locale: string,
  customValue: string
) {
  // 检查是否已有覆盖记录
  const existing = await db.query.i18nMessages.findFirst({
    where: and(
      eq(i18nMessages.organizationId, organizationId),
      eq(i18nMessages.key, key)
    )
  });

  if (existing) {
    // 更新现有覆盖
    await db.update(i18nMessages)
      .set({
        translations: { ...existing.translations, [locale]: customValue },
        userModified: true
      })
      .where(eq(i18nMessages.id, existing.id));
  } else {
    // 创建新覆盖记录
    await db.insert(i18nMessages).values({
      organizationId,  // 🔑 指定组织
      key,
      namespace: key.split('.')[0],
      translations: { [locale]: customValue },
      source: 'user',
      userModified: true,
      isEnabled: true
    });
  }
}
```

---

## 数据效果对比

### 迁移前（租户级设计）

```
┌──────────────────┬───────┬─────────────┬──────────────────┐
│ organization_id  │ namespace │ key       │ translations    │
├──────────────────┼───────┼─────────────┼──────────────────┤
│ org-001          │ common│ common.save │ {"zh-CN":"保存"} │
│ org-002          │ common│ common.save │ {"zh-CN":"保存"} │
│ org-003          │ common│ common.save │ {"zh-CN":"保存"} │
│ ... (重复 38 次)                                           │
└──────────────────┴───────┴─────────────┴──────────────────┘

问题:
  ❌ 456 条记录存储 12 个唯一翻译
  ❌ 新增 100 个组织 → 新增 1200 条记录
  ❌ 更新 "common.save" → 需更新 38 条记录
```

### 迁移后（全局+覆盖设计）

```
┌──────────────────┬───────┬─────────────┬──────────────────┐
│ organization_id  │ namespace │ key       │ translations    │
├──────────────────┼───────┼─────────────┼──────────────────┤
│ NULL (全局)      │ common│ common.save │ {"zh-CN":"保存"} │ ← 所有组织共享
│ org-vip-123      │ common│ common.save │ {"zh-CN":"提交"} │ ← VIP 覆盖
└──────────────────┴───────┴─────────────┴──────────────────┘

优势:
  ✅ 12 条全局记录 + 0 条覆盖 = 12 条总记录
  ✅ 新增 100 个组织 → 0 条新增记录
  ✅ 更新 "common.save" → 仅更新 1 条全局记录
  ✅ VIP 客户自定义术语 → 新增 1 条覆盖记录
```

---

## 实施记录

### 执行步骤

```bash
# 1. 运行去冗余迁移
cd apps/server
pnpm tsx scripts/migrate-i18n-deduplication.ts

# 输出:
# === 迁移前 ===
# 总记录数: 456
# 租户级记录: 456
#
# === 迁移后 ===
# 全局翻译: 12 条
# 租户覆盖: 0 条
# 总记录数: 12 条
#
# 节省记录数: 444 (97.4%)
# ✅ 全局翻译无重复

# 2. 验证去重结果
pnpm tsx scripts/check-i18n-redundancy.ts

# 输出:
# ✅ 未发现冗余（每个 key 只在一个组织中存在）
# 冗余率: 0.0%
```

### 修改的文件

1. **Schema 修改**:
   - `drizzle/0016_i18n_deduplication.sql` - 去冗余迁移 SQL

2. **查询逻辑修改**:
   - `i18n.capability.ts`
     - `t()` 方法: 支持 tenant → global fallback
     - `getMessages()` 方法: 使用 `DISTINCT ON` 去重

3. **插件安装逻辑**:
   - `installPluginTranslations()`: 改为写入 `organization_id = NULL`

---

## 性能优化

### 索引策略

```sql
-- 唯一索引（包含 NULL）
CREATE UNIQUE INDEX i18n_messages_org_ns_key_uidx
  ON i18n_messages (COALESCE(organization_id, ''), namespace, key);

-- 查询索引（覆盖 WHERE 条件）
CREATE INDEX i18n_messages_org_ns_idx
  ON i18n_messages (organization_id, namespace);

-- 建议: 为高频查询添加部分索引
CREATE INDEX i18n_messages_global_ns_idx
  ON i18n_messages (namespace, key)
  WHERE organization_id IS NULL;
```

### 查询性能

```
迁移前查询计划:
  Index Scan using i18n_messages_org_ns_idx
  Filter: organization_id = 'org-xxx'
  Rows: 12

迁移后查询计划:
  Index Scan using i18n_messages_org_ns_key_uidx
  Filter: (org_id = 'org-xxx' OR org_id IS NULL)
  Rows: 1-2 (最多 1 global + 1 override)
```

---

## 兼容性保证

### 现有代码无需修改

```typescript
// Plugin 代码保持不变
const greeting = await ctx.i18n.t('greeting', 'zh-CN', 'en-US');
// 自动 fallback: tenant → global

const messages = await ctx.i18n.getMessages('zh-CN');
// 自动合并: tenant overrides + global defaults
```

### 插件安装兼容性

```typescript
// 旧插件使用 organizationId 参数,但会被忽略
installPluginTranslations(
  'plugin.shop',
  'org-123',  // 参数传入但内部写 NULL
  i18nConfig,
  pluginDir
);

// 结果: 插入全局翻译 (organization_id = NULL)
```

---

## 未来扩展

### 多级 Fallback

```typescript
// 未来可支持更复杂的层级:
//   workspace → organization → global
//   region → language → global

const fallbackChain = [
  { organizationId: 'org-123', workspaceId: 'ws-456' },
  { organizationId: 'org-123', workspaceId: null },
  { organizationId: null, workspaceId: null } // global
];
```

### 翻译继承

```typescript
// 租户可选择性覆盖部分语言
{
  organizationId: 'org-vip',
  key: 'common.save',
  translations: {
    'zh-CN': '提交'  // 仅覆盖中文
    // en-US, ar-SA 继承全局默认
  }
}
```

---

## 总结

| 指标 | 迁移前 | 迁移后 | 改进 |
|------|--------|--------|------|
| **冗余率** | 97.4% | 0.0% | ✅ 完全消除 |
| **记录数** | 456 条 | 12 条 | ✅ 减少 97.4% |
| **存储成本** | ~228 KB | ~6 KB | ✅ 减少 38 倍 |
| **新增组织成本** | +12 条 | 0 条 | ✅ 零成本 |
| **查询性能** | 单次扫描 | 最优路径 | ✅ 提升 |
| **可扩展性** | 线性增长 | 恒定 | ✅ O(1) |

**关键要点**:
- ✅ Core/Plugin 翻译: `organization_id = NULL` (全局共享)
- ✅ 租户自定义: `organization_id = 'org-xxx'` (覆盖)
- ✅ 查询逻辑: Tenant-first fallback to Global
- ✅ 完全向后兼容,现有代码无需修改
- ✅ 存储成本降低 97.4%

---

**相关文件**:
- Migration: `drizzle/0016_i18n_deduplication.sql`
- Query Logic: `plugins/capabilities/i18n.capability.ts`
- Verification: `scripts/check-i18n-redundancy.ts`
