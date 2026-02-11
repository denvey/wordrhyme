# i18n 开发者指南

本指南介绍如何在 WordRhyme CMS 中添加和使用国际化功能。

## 快速开始

### 1. 使用 UI 翻译

```tsx
import { useTranslation } from '@/lib/i18n';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.welcome')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### 2. 使用 LocalizedText 组件

```tsx
import { LocalizedText } from '@/components/i18n';

// UI 翻译
<LocalizedText i18nKey="common.save" />

// 带参数
<LocalizedText i18nKey="common.greeting" values={{ name: 'John' }} />

// 内容数据翻译
<LocalizedText content={product.title} />
```

### 3. 货币/日期/数字格式化

```tsx
import {
  CurrencyDisplay,
  DateTimeDisplay,
  NumberDisplay,
} from '@/components/i18n';

// 货币
<CurrencyDisplay value={99.99} currency="USD" />

// 日期
<DateTimeDisplay value={new Date()} format="long" />
<DateTimeDisplay value={createdAt} relative />  // "2 hours ago"

// 数字
<NumberDisplay value={1234567} />               // "1,234,567"
<NumberDisplay value={1234567} notation="compact" />  // "1.2M"
<NumberDisplay value={0.156} style="percent" />       // "15.6%"
```

## 添加新翻译

### 方式一：通过 Admin UI

1. 登录管理后台
2. 进入 **设置 > 翻译**
3. 点击 **新增翻译**
4. 填写：
   - Namespace: `common` (或其他命名空间)
   - Key: `button.submit`
   - 各语言的翻译值

### 方式二：通过 Seed 脚本

创建或编辑 seed 文件：

```typescript
// apps/server/src/db/seeds/i18n-messages.ts
import { db } from '../index';
import { i18nMessages } from '../schema/definitions';

const messages = [
  // 新增翻译
  { namespace: 'common', key: 'button.submit', locale: 'zh-CN', value: '提交' },
  { namespace: 'common', key: 'button.submit', locale: 'en-US', value: 'Submit' },
];

export async function seedI18nMessages(organizationId: string) {
  for (const msg of messages) {
    await db.insert(i18nMessages)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        ...msg,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [i18nMessages.organizationId, i18nMessages.namespace, i18nMessages.key, i18nMessages.locale],
        set: { value: msg.value, updatedAt: new Date() },
      });
  }
}
```

### 方式三：通过 tRPC API

```typescript
import { trpc } from '@/lib/trpc';

// 创建或更新翻译
await trpc.i18n.upsertMessage.mutate({
  namespace: 'common',
  key: 'button.submit',
  locale: 'zh-CN',
  value: '提交',
});
```

## Namespace 规范

| Namespace | 用途 | 示例 Key |
|-----------|------|----------|
| `common` | 通用文本 | `button.save`, `label.name` |
| `admin` | 管理后台 | `nav.dashboard`, `page.users` |
| `errors` | 错误消息 | `validation.required`, `api.notFound` |
| `plugin:{id}` | 插件翻译 | `title`, `description` |

## 内容数据翻译

对于业务数据（产品、分类等），使用 JSONB 存储多语言内容。

### 1. 定义 Schema

```typescript
// apps/server/src/db/schema/products.ts
import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

// 类型定义
export type I18nContent = Record<string, string>;

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 使用 JSONB 存储多语言内容
  title: jsonb('title').$type<I18nContent>(),
  description: jsonb('description').$type<I18nContent>(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 2. 创建数据

```typescript
await db.insert(products).values({
  title: {
    'zh-CN': '产品名称',
    'en-US': 'Product Name',
  },
  description: {
    'zh-CN': '产品描述',
    'en-US': 'Product description',
  },
});
```

### 3. 读取数据

```typescript
import { getI18nValue } from '@/i18n/get-i18n-value';

const product = await db.query.products.findFirst();

// 获取当前语言的值，带 fallback
const title = getI18nValue(product.title, currentLocale, fallbackLocale);
```

### 4. 前端显示

```tsx
import { LocalizedText } from '@/components/i18n';

function ProductCard({ product }) {
  return (
    <div>
      <h2><LocalizedText content={product.title} /></h2>
      <p><LocalizedText content={product.description} /></p>
    </div>
  );
}
```

## RTL 支持

### 基本原则

1. **使用逻辑属性**，不要使用物理属性

```tsx
// ❌ 错误
<div className="ml-4 pl-2 text-left" />

// ✅ 正确
<div className="ms-4 ps-2 text-start" />
```

2. **使用 RTL 变体** 处理需要翻转的元素

```tsx
// 箭头图标在 RTL 时需要翻转
<ArrowRightIcon className="rtl:rotate-180" />

// Flex 方向在 RTL 时反转
<div className="flex flex-row rtl:flex-row-reverse">
  <Icon />
  <Text />
</div>
```

### 使用 RTL 工具

```tsx
import { useRTL, rtlClasses, isRTLLocale } from '@/components/i18n';

function MyComponent() {
  const { isRTL, direction, flip, startEnd } = useRTL();

  return (
    <div dir={direction}>
      {/* 预定义类 */}
      <div className={rtlClasses.flexRowReverse}>...</div>

      {/* 动态翻转 */}
      <Icon className={flip('rotate-90')} />

      {/* 条件类 */}
      <div className={startEnd('pl-4', 'pr-4')}>...</div>
    </div>
  );
}
```

### 预定义 RTL 类

```typescript
rtlClasses.flexRowReverse  // "flex-row rtl:flex-row-reverse"
rtlClasses.iconFlip        // "rtl:-scale-x-100"
rtlClasses.arrowForward    // "rtl:rotate-180"
rtlClasses.arrowBackward   // "ltr:rotate-180"
```

## 语言切换

### 使用 LanguageSwitcher 组件

```tsx
import { LanguageSwitcher, LanguageSwitcherCompact } from '@/components/i18n';

// 完整版（带语言名称）
<LanguageSwitcher />

// 紧凑版（仅图标）
<LanguageSwitcherCompact />
```

### 编程方式切换

```tsx
import { useLanguageSwitcher } from '@/lib/i18n';

function MyComponent() {
  const { currentLocale, availableLocales, changeLocale } = useLanguageSwitcher();

  return (
    <select
      value={currentLocale}
      onChange={(e) => changeLocale(e.target.value)}
    >
      {availableLocales.map((locale) => (
        <option key={locale.code} value={locale.code}>
          {locale.name}
        </option>
      ))}
    </select>
  );
}
```

## 格式化函数

除了组件，也可以直接使用格式化函数：

```typescript
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatCompact,
} from '@/components/i18n';

// 货币
formatCurrency(99.99, 'USD', 'en-US');  // "$99.99"
formatCurrency(99.99, 'CNY', 'zh-CN');  // "¥99.99"

// 日期
formatDate(new Date(), 'zh-CN', 'long');  // "2025年1月15日"
formatDate(new Date(), 'en-US', 'short'); // "1/15/25"

// 相对时间
formatRelativeTime(fiveMinutesAgo, 'en-US');  // "5 minutes ago"
formatRelativeTime(fiveMinutesAgo, 'zh-CN');  // "5分钟前"

// 数字
formatNumber(1234567, 'en-US');   // "1,234,567"
formatNumber(1234567, 'de-DE');   // "1.234.567"

// 百分比
formatPercent(0.156, 'en-US');    // "15.6%"

// 紧凑表示
formatCompact(1234567, 'en-US');  // "1.2M"
formatCompact(12345678, 'zh-CN'); // "1235万"
```

## 最佳实践

### 1. Key 命名规范

```
{namespace}.{category}.{action/name}

# 示例
common.button.save
common.button.cancel
common.label.name
common.label.email

admin.nav.dashboard
admin.nav.users
admin.page.userList

errors.validation.required
errors.validation.email
errors.api.notFound
```

### 2. 避免字符串拼接

```tsx
// ❌ 错误
t('greeting') + name

// ✅ 正确
t('greeting', { name })
// 翻译值: "Hello, {{name}}!"
```

### 3. 处理复数

```tsx
// 翻译值
// "item": "{{count}} item"
// "item_plural": "{{count}} items"

t('item', { count: 5 });  // "5 items"
```

### 4. 分离 UI 和内容翻译

```tsx
// UI 翻译 - 使用 t() 或 i18nKey
<LocalizedText i18nKey="common.productTitle" />

// 内容翻译 - 使用 content prop
<LocalizedText content={product.title} />
```

### 5. 提供 Fallback

```tsx
// 后端
const title = getI18nValue(
  product.title,
  currentLocale,  // 主语言
  'en-US'         // 回退语言
);

// 前端组件自动使用 context 中的 fallback
<LocalizedText content={product.title} />
```

## 调试

### 查看当前语言上下文

```tsx
import { useI18n } from '@/lib/i18n';

function DebugI18n() {
  const { locale, direction, isLoading } = useI18n();

  console.log({ locale, direction, isLoading });

  return null;
}
```

### 强制使用特定语言

通过 URL 参数: `?lang=ar-SA`

### 检查缓存版本

```typescript
// 浏览器控制台
localStorage.getItem('i18n_version_common');
```

## 常见问题

### Q: 翻译更新后前端没有生效？

A: 清除 LocalStorage 缓存或刷新页面。生产环境会通过版本号自动失效。

### Q: RTL 布局错乱？

A: 检查是否使用了物理属性 (`ml-*`) 而非逻辑属性 (`ms-*`)。

### Q: 日期显示格式不对？

A: 检查 `locale` 参数是否正确传递，以及浏览器是否支持该 locale。

### Q: 如何添加新语言？

A: 在 Admin UI 的 **设置 > 语言** 中添加，然后补充翻译内容。
