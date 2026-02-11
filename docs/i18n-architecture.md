# i18n 国际化系统架构

> 版本: 1.0 | 状态: Frozen | 最后更新: 2025

## 概述

WordRhyme CMS 的国际化系统支持两种类型的多语言内容：

1. **UI 翻译 (i18n)** - 界面文本，存储在 `i18n_messages` 表
2. **内容翻译 (l10n)** - 业务数据，使用 JSONB 字段存储

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  I18nProvider    LocalizedText    CurrencyDisplay    RTL Utils  │
│       ↓               ↓                ↓                 ↓       │
│  react-i18next   t() / content    Intl.NumberFormat   dir="rtl" │
└─────────────────────────────────────────────────────────────────┘
                              │
                         tRPC API
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (NestJS)                          │
├─────────────────────────────────────────────────────────────────┤
│  ContextResolver   I18nCacheService   i18n.router   getI18nValue│
│       ↓                   ↓                ↓              ↓      │
│  Locale Pipeline     Redis Cache      CRUD API      JSONB Helper│
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        Data Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  i18n_languages    i18n_messages    Content Tables (JSONB)      │
│  (配置)             (UI翻译)          (内容翻译)                  │
└─────────────────────────────────────────────────────────────────┘
```

## 数据模型

### 1. 语言配置表 (i18n_languages)

```sql
CREATE TABLE i18n_languages (
  id            UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  locale        VARCHAR(10) NOT NULL,  -- BCP 47: en-US, zh-CN
  name          VARCHAR(100) NOT NULL, -- English, 中文
  native_name   VARCHAR(100),          -- English, 中文
  is_default    BOOLEAN DEFAULT false,
  is_enabled    BOOLEAN DEFAULT true,
  created_at    TIMESTAMP,
  updated_at    TIMESTAMP
);
```

### 2. UI 翻译表 (i18n_messages)

```sql
CREATE TABLE i18n_messages (
  id            UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  namespace     VARCHAR(50) NOT NULL,  -- common, admin, plugin:xxx
  key           VARCHAR(255) NOT NULL, -- button.save, error.required
  locale        VARCHAR(10) NOT NULL,
  value         TEXT NOT NULL,
  updated_at    TIMESTAMP
);
```

### 3. 内容翻译 (JSONB)

业务数据使用 JSONB 字段存储多语言内容：

```typescript
// 产品标题的 JSONB 结构
{
  "zh-CN": "产品名称",
  "en-US": "Product Name",
  "ja-JP": "製品名"
}
```

## 核心组件

### 1. ContextResolver (后端)

解析当前请求的 locale，按优先级顺序：

```
URL (?lang=) > Cookie > User Preference > Org Default > System Default
```

```typescript
// 使用方式
const localeResolution = await contextResolver.resolveLocale(request, orgId, userId);
// { locale: 'zh-CN', source: 'cookie', direction: 'ltr' }
```

### 2. I18nCacheService (后端)

Redis 缓存服务，支持版本化失效：

```typescript
// 缓存键模式
i18n:msg:{orgId}:{locale}:{namespace}  // 翻译内容
i18n:v:{orgId}:{locale}:{namespace}    // 版本号

// TTL
messages: 1 hour
version: 24 hours
```

### 3. getI18nValue (后端)

从 JSONB 字段提取翻译值：

```typescript
import { getI18nValue } from '@/i18n/get-i18n-value';

const product = await db.query.products.findFirst();
const title = getI18nValue(product.title, 'zh-CN', 'en-US');
```

### 4. I18nProvider (前端)

React Context Provider，管理语言状态：

```tsx
import { I18nProvider } from '@/lib/i18n';

function App() {
  return (
    <I18nProvider>
      <MainContent />
    </I18nProvider>
  );
}
```

### 5. Smart Components (前端)

Locale-aware 显示组件：

```tsx
import {
  LocalizedText,
  CurrencyDisplay,
  DateTimeDisplay,
  NumberDisplay,
} from '@/components/i18n';

// UI 翻译
<LocalizedText i18nKey="common.save" />

// 内容翻译
<LocalizedText content={product.title} />

// 货币
<CurrencyDisplay value={99.99} currency="USD" />

// 日期（支持相对时间）
<DateTimeDisplay value={createdAt} format="long" />
<DateTimeDisplay value={createdAt} relative />

// 数字
<NumberDisplay value={1234567} notation="compact" />
<NumberDisplay value={0.156} style="percent" />
```

## RTL 支持

### CSS 逻辑属性

使用 CSS Logical Properties 替代物理属性：

| 物理属性 (Don't) | 逻辑属性 (Use) |
|------------------|----------------|
| `ml-*`, `mr-*` | `ms-*`, `me-*` |
| `pl-*`, `pr-*` | `ps-*`, `pe-*` |
| `left-*`, `right-*` | `start-*`, `end-*` |
| `text-left`, `text-right` | `text-start`, `text-end` |

### Tailwind RTL 变体

```css
/* globals.css */
@custom-variant rtl ([dir="rtl"] &);
@custom-variant ltr ([dir="ltr"] &);
```

```tsx
// 使用
<div className="flex-row rtl:flex-row-reverse">
  <Icon className="rtl:rotate-180" />
</div>
```

### useRTL Hook

```tsx
import { useRTL, rtlClasses } from '@/components/i18n';

function MyComponent() {
  const { isRTL, direction, flip } = useRTL();

  return (
    <div className={rtlClasses.flexRowReverse}>
      <Icon className={flip('rotate-90')} />
    </div>
  );
}
```

## 缓存策略

### 多层缓存

1. **Redis (服务端)**: 1 小时 TTL，版本化失效
2. **LocalStorage (客户端)**: 1 小时 TTL，版本验证

### 版本化失效

```typescript
// 客户端请求头
X-I18n-Version: 1706961234567

// 服务端响应
- 如果版本匹配：返回 304 Not Modified
- 如果版本不匹配：返回新数据 + 新版本号
```

### 失效触发

```typescript
// 更新翻译后
await cacheService.invalidateNamespace(orgId, namespace);

// 语言配置变更后
await cacheService.invalidateOrganization(orgId);
```

## Plugin i18n

### Manifest 配置

```json
{
  "name": "my-plugin",
  "i18n": {
    "namespace": "plugin:my-plugin",
    "defaultLocale": "en-US",
    "supportedLocales": ["en-US", "zh-CN"],
    "messages": {
      "en-US": {
        "title": "My Plugin",
        "description": "Plugin description"
      },
      "zh-CN": {
        "title": "我的插件",
        "description": "插件描述"
      }
    },
    "onUninstall": "delete"
  }
}
```

### 使用 usePluginTranslation

```tsx
import { usePluginTranslation } from '@/components/i18n';

function PluginComponent({ pluginId }: { pluginId: string }) {
  const { t, isLoading } = usePluginTranslation(pluginId);

  if (isLoading) return <Skeleton />;

  return <div>{t('title')}</div>;
}
```

## API 接口

### tRPC Router

```typescript
// 获取翻译
i18n.getMessages.query({ locale: 'zh-CN', namespace: 'common' })

// 检查版本
i18n.checkVersion.query({ locale: 'zh-CN', namespace: 'common', version: '...' })

// 语言管理
i18n.listLanguages.query()
i18n.createLanguage.mutation({ locale: 'ja-JP', name: 'Japanese' })
i18n.updateLanguage.mutation({ id: '...', isEnabled: false })

// 翻译管理
i18n.listMessages.query({ namespace: 'common' })
i18n.upsertMessage.mutation({ namespace, key, locale, value })
i18n.deleteMessage.mutation({ id })
```

## 开发指南

### 添加新语言

1. 在 Admin UI 的 **设置 > 语言** 中添加
2. 或通过 tRPC API:

```typescript
await trpc.i18n.createLanguage.mutate({
  locale: 'ja-JP',
  name: 'Japanese',
  nativeName: '日本語',
  isEnabled: true,
});
```

### 添加 UI 翻译

1. 在 Admin UI 的 **设置 > 翻译** 中添加
2. 或使用 seed 脚本批量导入

### 添加内容翻译

在数据库 schema 中使用 JSONB 类型：

```typescript
// schema.ts
export const products = pgTable('products', {
  id: uuid('id').primaryKey(),
  title: jsonb('title').$type<I18nContent>(),  // { "zh-CN": "...", "en-US": "..." }
  description: jsonb('description').$type<I18nContent>(),
});
```

## 文件结构

```
apps/server/src/i18n/
├── types.ts              # 类型定义 + RTL 检测
├── context-resolver.ts   # Locale 解析管道
├── i18n-cache.service.ts # Redis 缓存服务
├── get-i18n-value.ts     # JSONB 内容提取
└── i18n.router.ts        # tRPC API

apps/admin/src/
├── lib/i18n/
│   ├── config.ts         # react-i18next 配置
│   ├── I18nProvider.tsx  # React Context
│   └── index.ts          # 导出
└── components/i18n/
    ├── LocalizedText.tsx     # 文本显示组件
    ├── CurrencyDisplay.tsx   # 货币格式化
    ├── DateTimeDisplay.tsx   # 日期时间格式化
    ├── NumberDisplay.tsx     # 数字格式化
    ├── LanguageSwitcher.tsx  # 语言切换器
    ├── rtl-utils.ts          # RTL 工具函数
    └── index.ts              # 导出
```

## 约束与规则

1. **Locale 格式**: 必须使用 BCP 47 (例: `zh-CN`, `en-US`)
2. **Namespace 命名**:
   - 核心: `common`, `admin`, `errors`
   - 插件: `plugin:{pluginId}`
3. **多租户隔离**: 所有数据都绑定 `organization_id`
4. **RTL 检测**: 使用 `getTextDirection()` 而非硬编码
5. **缓存**: 修改翻译后必须调用 `invalidate*` 方法

## 参考

- [BCP 47 Language Tags](https://tools.ietf.org/html/bcp47)
- [CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties)
- [Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [GLOBALIZATION_GOVERNANCE.md](./architecture/GLOBALIZATION_GOVERNANCE.md)
