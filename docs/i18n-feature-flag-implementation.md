# i18n Feature Flag 实施指南

## 概述

本指南说明如何为 WordRhyme CMS 的多语言功能添加 Feature Flag 控制,实现"默认禁用,可选启用"的能力。

---

## 📋 背景

**问题**:
- 并非所有系统都需要多语言支持
- 某些插件需要调用翻译 API(如 shop 插件翻译商品标题)
- 当前 i18n 功能始终可用,无法禁用

**解决方案**:
- Core 内置 i18n 系统(避免插件循环依赖)
- 通过 Feature Flag `i18n.enabled` 控制启用/禁用
- 插件通过 `ctx.capabilities.i18n` API 访问(优雅降级)
- 内容翻译使用 JSONB 字段(插件自主管理)

---

## 🎯 架构决策

### 1. i18n 位置: **Core 内置 + Feature Flag**

**为什么不是插件?**
```
❌ 方案 A: i18n 作为插件
   问题: shop 插件依赖 i18n 插件 → 循环依赖 (违反治理)

✅ 方案 B: i18n 作为 Core 功能 + Feature Flag
   优势:
   - 避免循环依赖
   - Feature Flag 实现"默认禁用"
   - 符合"翻译是基础设施"的定位
```

### 2. 内容翻译存储: **JSONB 字段模式**

**两种用途**:
```sql
-- 用途 1: UI 翻译 (现有 i18n_messages 表)
SELECT translations->'zh-CN' FROM i18n_messages
WHERE namespace='common' AND key='save';
-- 返回: "保存"

-- 用途 2: 内容翻译 (插件自己的 JSONB 字段)
SELECT title->'zh-CN' FROM plugin_shop_products WHERE id='prod-123';
-- 返回: "手机"
```

**为什么不需要新建 `i18n_entity_translations` 表?**
- `i18n_messages` 已经存在,用于 UI 翻译
- 内容翻译由插件自己管理(JSONB 字段)
- 避免 Core 反向依赖插件实体 schema

---

## 🚀 实施步骤

### 步骤 1: 运行数据库迁移

```bash
cd apps/server
pnpm tsx scripts/migrate-i18n-feature-flag.ts
```

**迁移内容**:
1. 创建 feature flag `i18n.enabled` (默认 `false`)
2. 自动启用现有 38 个组织(保留现有功能)
3. 新组织需手动启用

**验证**:
```bash
psql $DATABASE_URL -c "SELECT key, enabled FROM feature_flags WHERE key='i18n.enabled';"
# 应返回: i18n.enabled | f (false)

psql $DATABASE_URL -c "SELECT COUNT(*) FROM feature_flag_overrides ffo
  JOIN feature_flags ff ON ff.id=ffo.flag_id
  WHERE ff.key='i18n.enabled' AND ffo.enabled=true;"
# 应返回: 38 (或组织总数)
```

### 步骤 2: 更新 Plugin Capability 注入

修改 `apps/server/src/plugins/capabilities/index.ts`:

```typescript
import { FeatureFlagService } from '../../settings/feature-flag.service';

export function createCapabilitiesForPlugin(
  pluginId: string,
  manifest: PluginManifest,
  context?: {
    organizationId?: string;
    userId?: string;
  },
  services?: {
    featureFlagService?: FeatureFlagService; // 新增参数
  }
): PluginContext {
  // ...其他 capabilities...

  // i18n Capability: 始终注入,内部检查 feature flag
  const i18n = createI18nCapability(
    pluginId,
    context?.organizationId || '',
    manifest,
    services?.featureFlagService // 传递 service
  );

  return {
    // ...
    i18n, // 始终存在
  };
}
```

### 步骤 3: 导出 Plugin SDK Helper

确保 `packages/plugin/src/index.ts` 导出辅助函数:

```typescript
// Plugin SDK Entry Point
export * from './helpers/i18n';
export { getI18nValue, setI18nValue, removeI18nValue, hasI18nValue, mergeI18nValues } from './helpers/i18n';
```

### 步骤 4: 测试 Feature Flag

**测试 1: 功能禁用时**
```bash
# 禁用某个组织的 i18n
psql $DATABASE_URL -c "DELETE FROM feature_flag_overrides
  WHERE flag_id=(SELECT id FROM feature_flags WHERE key='i18n.enabled')
  AND organization_id='test-org-123';"

# 测试 API
curl -X POST http://localhost:3000/trpc/i18n.languages.list \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json"
# 应返回错误: "i18n feature not enabled"
```

**测试 2: 功能启用时**
```bash
# 启用 i18n
psql $DATABASE_URL -c "INSERT INTO feature_flag_overrides (flag_id, organization_id, enabled)
  VALUES (
    (SELECT id FROM feature_flags WHERE key='i18n.enabled'),
    'test-org-123',
    true
  );"

# 测试 API
curl -X POST http://localhost:3000/trpc/i18n.languages.list \
  -H "Cookie: session=..."
# 应返回语言列表
```

---

## 📚 插件开发指南

### 示例: Shop 插件添加产品标题翻译

```typescript
// plugins/shop/src/routers/products.ts
import { getI18nValue, setI18nValue } from '@wordrhyme/plugin';

export const productsRouter = createPluginRouter({
  // 创建产品(支持多语言)
  create: protectedProcedure
    .input(z.object({
      title: z.string(),
      titleTranslations: z.record(z.string()).optional(), // { "en-US": "Phone", "fr-FR": "Téléphone" }
    }))
    .mutation(async ({ input, ctx }) => {
      // 1. 初始化 title 为 JSONB (使用默认语言)
      const defaultLocale = 'zh-CN'; // 从 org settings 读取
      let titleJsonb = setI18nValue(null, defaultLocale, input.title);

      // 2. 添加其他语言翻译(如果提供)
      if (input.titleTranslations) {
        for (const [locale, value] of Object.entries(input.titleTranslations)) {
          titleJsonb = setI18nValue(titleJsonb, locale, value);
        }
      }

      // 3. 存储到数据库
      const [product] = await ctx.db.insert(products).values({
        organizationId: ctx.organizationId,
        title: titleJsonb, // JSONB: { "zh-CN": "手机", "en-US": "Phone" }
      }).returning();

      return product;
    }),

  // 获取产品列表(根据用户语言返回翻译)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const products = await ctx.db.query.products.findMany({
        where: eq(products.organizationId, ctx.organizationId)
      });

      // 提取当前语言的标题
      const locale = ctx.locale || 'zh-CN';
      return products.map(p => ({
        ...p,
        title: getI18nValue(p.title, locale, 'zh-CN') || '未命名'
      }));
    }),
});
```

**数据库 Schema**:
```sql
CREATE TABLE plugin_shop_products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title JSONB NOT NULL,  -- { "zh-CN": "手机", "en-US": "Phone" }
  description JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建 GIN 索引以支持 JSONB 搜索
CREATE INDEX idx_products_title_gin ON plugin_shop_products USING GIN (title);
```

---

## 🎨 前端 UI 集成

### 1. 检查 Feature Flag 状态

```tsx
// apps/admin/src/pages/settings/Languages.tsx

export function LanguagesPage() {
  const { data: isEnabled, isLoading } = trpc.settings.isFeatureEnabled.useQuery('i18n.enabled');

  if (isLoading) {
    return <Spinner />;
  }

  if (!isEnabled) {
    return (
      <EmptyState
        icon={Globe}
        title="多语言支持"
        description="为您的组织启用多语言支持,支持内容本地化"
      >
        <Button onClick={handleEnable}>
          启用多语言功能
        </Button>
      </EmptyState>
    );
  }

  // 功能启用后,显示语言管理界面
  return <LanguageManagementUI />;
}
```

### 2. 共享翻译组件

```tsx
// @wordrhyme/ui-components/TranslationButton.tsx

export function TranslationButton(props: {
  entityType: string;
  entityId: string;
  field: string;
  currentValue: Record<string, string>; // JSONB field
}) {
  const { data: isEnabled } = trpc.settings.isFeatureEnabled.useQuery('i18n.enabled');
  const { data: languages } = trpc.i18n.languages.list.useQuery();

  // Auto-hide if disabled or only 1 language
  if (!isEnabled || !languages || languages.length <= 1) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Languages className="h-4 w-4 mr-1" />
          翻译 ({languages.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <TranslationEditor
          languages={languages}
          currentValue={props.currentValue}
          onSave={(locale, value) => {
            // 更新 JSONB 字段
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

---

## ✅ 验收测试清单

### Backend Tests

- [ ] Feature flag 默认禁用(新组织)
- [ ] Feature flag 自动启用(现有 38 组织)
- [ ] `i18n.languages.*` API 在禁用时返回 403
- [ ] `i18n.getMessages` 在禁用时返回空对象
- [ ] `ctx.i18n.isEnabled()` 正确返回 flag 状态
- [ ] `ctx.i18n.t()` 在禁用时返回 `undefined`
- [ ] Plugin helper 函数正常工作

### Frontend Tests

- [ ] `/settings/languages` 禁用时显示 Empty State
- [ ] `/settings/languages` 启用时显示语言列表
- [ ] `<TranslationButton>` 在禁用时隐藏
- [ ] `<TranslationButton>` 在单语言时隐藏
- [ ] Feature toggle 正常工作(ON/OFF)

### Integration Tests

- [ ] Shop 插件使用 JSONB 翻译正常
- [ ] 跨语言搜索功能正常
- [ ] 禁用后重新启用,数据完好

---

## 🔧 故障排除

### 问题 1: TypeScript 错误 "Cannot find name 'FeatureFlagService'"

**原因**: 未导入类型

**解决**:
```typescript
import type { FeatureFlagService } from '../../settings/feature-flag.service';
```

### 问题 2: 现有组织的 i18n 功能丢失

**原因**: Migration 未正确执行

**解决**:
```bash
# 检查 feature_flag_overrides 表
psql $DATABASE_URL -c "SELECT COUNT(*) FROM feature_flag_overrides WHERE flag_id=(SELECT id FROM feature_flags WHERE key='i18n.enabled');"

# 如果为 0,手动运行迁移 SQL
psql $DATABASE_URL -f apps/server/drizzle/0015_i18n_feature_flag.sql
```

### 问题 3: Helper 函数未导出

**原因**: `packages/plugin/src/index.ts` 未导出

**解决**:
```typescript
// packages/plugin/src/index.ts
export * from './helpers/i18n';
```

---

## 📖 参考资料

- **多模型分析结果**: `/Users/denvey/.claude/projects/.../task-results.json`
- **Feature Flag Service**: `apps/server/src/settings/feature-flag.service.ts`
- **i18n Capability**: `apps/server/src/plugins/capabilities/i18n.capability.ts`
- **Plugin SDK Helpers**: `packages/plugin/src/helpers/i18n.ts`
- **治理文档**: `docs/architecture/PLUGIN_CONTRACT.md`

---

## 📅 后续工作

- [ ] 添加 Admin UI 的 Feature Flag 管理页面(`/settings/features`)
- [ ] 编写用户文档 (`docs/i18n/overview.md`)
- [ ] 编写开发者文档 (`docs/i18n/plugin-api.md`)
- [ ] 创建 Shop 插件示例代码
- [ ] 添加 E2E 测试
- [ ] 发布迁移公告(通知现有用户)

---

**版本**: 1.0
**更新时间**: 2024-01-XX
**维护者**: @denvey
