# Plugin 国际化开发指南

本指南介绍如何为 WordRhyme CMS 插件添加国际化支持。

## 概述

插件可以通过以下方式支持多语言：

1. **Manifest 内嵌翻译** - 适合少量翻译
2. **外部 locales 文件** - 适合大量翻译
3. **运行时加载** - 使用 `usePluginTranslation` hook

## Manifest 配置

### 基本结构

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "i18n": {
    "namespace": "plugin:my-plugin",
    "defaultLocale": "en-US",
    "supportedLocales": ["en-US", "zh-CN", "ja-JP"],
    "messages": {
      "en-US": {
        "title": "My Plugin",
        "description": "A great plugin for WordRhyme",
        "settings.apiKey": "API Key",
        "settings.enabled": "Enable Feature"
      },
      "zh-CN": {
        "title": "我的插件",
        "description": "WordRhyme 的优秀插件",
        "settings.apiKey": "API 密钥",
        "settings.enabled": "启用功能"
      },
      "ja-JP": {
        "title": "マイプラグイン",
        "description": "WordRhyme の素晴らしいプラグイン"
      }
    },
    "onUninstall": "delete"
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `namespace` | string | 否 | 翻译命名空间，默认为 `plugin:{pluginId}` |
| `defaultLocale` | string | 否 | 默认语言，默认 `en-US` |
| `supportedLocales` | string[] | 否 | 支持的语言列表 |
| `messages` | object | 否 | 内嵌翻译内容 |
| `localesFile` | string | 否 | 外部翻译文件路径 |
| `onUninstall` | "delete" \| "retain" | 否 | 卸载时是否删除翻译，默认 `delete` |

## 方式一：内嵌翻译

适合翻译内容较少的插件（< 50 条）。

```json
{
  "i18n": {
    "messages": {
      "en-US": {
        "title": "My Plugin",
        "button.save": "Save",
        "button.cancel": "Cancel"
      },
      "zh-CN": {
        "title": "我的插件",
        "button.save": "保存",
        "button.cancel": "取消"
      }
    }
  }
}
```

## 方式二：外部文件

适合翻译内容较多的插件。

### 文件结构

```
my-plugin/
├── plugin.json
└── locales/
    ├── en-US.json
    ├── zh-CN.json
    └── ja-JP.json
```

### Manifest 配置

```json
{
  "i18n": {
    "localesFile": "./locales/{locale}.json",
    "supportedLocales": ["en-US", "zh-CN", "ja-JP"]
  }
}
```

### 语言文件格式

```json
// locales/en-US.json
{
  "title": "My Plugin",
  "description": "A great plugin",
  "settings": {
    "apiKey": "API Key",
    "enabled": "Enable Feature",
    "advanced": {
      "timeout": "Request Timeout",
      "retries": "Max Retries"
    }
  }
}
```

文件会被展平为点分隔的 key：
- `title`
- `description`
- `settings.apiKey`
- `settings.enabled`
- `settings.advanced.timeout`
- `settings.advanced.retries`

## 前端使用

### usePluginTranslation Hook

```tsx
import { usePluginTranslation } from '@/components/i18n';

interface MyPluginUIProps {
  pluginId: string;
}

function MyPluginUI({ pluginId }: MyPluginUIProps) {
  const { t, isLoading, error } = usePluginTranslation(pluginId);

  if (isLoading) {
    return <Skeleton />;
  }

  if (error) {
    return <div>Failed to load translations</div>;
  }

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <form>
        <label>{t('settings.apiKey')}</label>
        <input type="text" />

        <button>{t('button.save')}</button>
      </form>
    </div>
  );
}
```

### 带参数的翻译

```json
// locales/en-US.json
{
  "greeting": "Hello, {{name}}!",
  "itemCount": "{{count}} item(s) selected"
}
```

```tsx
t('greeting', { name: 'John' });  // "Hello, John!"
t('itemCount', { count: 5 });     // "5 item(s) selected"
```

### 检查翻译是否存在

```tsx
import { usePluginHasTranslation } from '@/components/i18n';

function MyComponent({ pluginId }) {
  const { hasTranslation } = usePluginHasTranslation(pluginId);

  if (hasTranslation('advanced.feature')) {
    return <AdvancedFeature />;
  }

  return <BasicFeature />;
}
```

## 后端 API

### 获取插件翻译

```typescript
import { db } from '@/db';
import { i18nMessages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

async function getPluginMessages(pluginId: string, locale: string) {
  const namespace = `plugin:${pluginId}`;

  const messages = await db.query.i18nMessages.findMany({
    where: and(
      eq(i18nMessages.namespace, namespace),
      eq(i18nMessages.locale, locale)
    ),
  });

  return messages.reduce((acc, msg) => {
    acc[msg.key] = msg.value;
    return acc;
  }, {} as Record<string, string>);
}
```

### 安装时导入翻译

系统会在插件安装时自动调用：

```typescript
import { installPluginTranslations } from '@/plugins/capabilities/i18n.capability';

// 自动在 plugin-loader 中调用
await installPluginTranslations(
  pluginId,
  organizationId,
  pluginManifest.i18n
);
```

### 卸载时清理翻译

```typescript
import { uninstallPluginTranslations } from '@/plugins/capabilities/i18n.capability';

// 根据 onUninstall 配置决定是否删除
await uninstallPluginTranslations(
  pluginId,
  organizationId,
  pluginManifest.i18n?.onUninstall ?? 'delete'
);
```

## 最佳实践

### 1. Key 命名规范

```
{category}.{subcategory}.{name}

# 推荐
title
description
settings.apiKey
settings.advanced.timeout
button.save
button.cancel
error.required
error.invalid
```

### 2. 提供完整的默认语言

确保 `defaultLocale` 包含所有 key：

```json
{
  "i18n": {
    "defaultLocale": "en-US",
    "messages": {
      "en-US": {
        "title": "My Plugin",
        "description": "Description",
        "feature.new": "New Feature"  // 所有 key 都要有
      },
      "zh-CN": {
        "title": "我的插件"
        // description 和 feature.new 可以缺失，会 fallback 到 en-US
      }
    }
  }
}
```

### 3. 使用有意义的 Key

```json
// ❌ 不好
{
  "str1": "Save",
  "str2": "Cancel",
  "msg": "Operation successful"
}

// ✅ 好
{
  "button.save": "Save",
  "button.cancel": "Cancel",
  "toast.success": "Operation successful"
}
```

### 4. 处理 Loading 状态

```tsx
function PluginUI({ pluginId }) {
  const { t, isLoading } = usePluginTranslation(pluginId);

  // 始终处理 loading
  if (isLoading) {
    return <PluginSkeleton />;
  }

  return <div>{t('title')}</div>;
}
```

### 5. RTL 支持

如果插件支持 RTL 语言，需要注意布局：

```tsx
import { useRTL } from '@/components/i18n';

function PluginUI() {
  const { isRTL, direction } = useRTL();

  return (
    <div dir={direction}>
      <div className="flex gap-2 rtl:flex-row-reverse">
        <Icon className="rtl:rotate-180" />
        <span>{t('title')}</span>
      </div>
    </div>
  );
}
```

## 生命周期

### 安装流程

```
1. 验证 plugin.json
2. 解析 i18n 配置
3. 如果有 localesFile，读取外部文件
4. 合并 messages
5. 写入 i18n_messages 表
6. 使缓存失效
```

### 卸载流程

```
1. 检查 onUninstall 配置
2. 如果是 "delete"：删除所有 plugin:{pluginId} 的翻译
3. 如果是 "retain"：保留翻译（用户可能想保留自定义修改）
4. 使缓存失效
```

### 更新流程

```
1. 读取新版本的 i18n 配置
2. 合并翻译（新增 key，更新已有 key）
3. 不删除旧 key（保留用户自定义翻译）
4. 使缓存失效
```

## 调试

### 查看插件翻译

```typescript
// tRPC API
const messages = await trpc.i18n.listMessages.query({
  namespace: 'plugin:my-plugin',
});
console.log(messages);
```

### 强制刷新缓存

```typescript
await trpc.i18n.invalidateNamespace.mutate({
  namespace: 'plugin:my-plugin',
});
```

### 检查加载状态

```tsx
function DebugPlugin({ pluginId }) {
  const { t, isLoading, error } = usePluginTranslation(pluginId);

  console.log('Plugin i18n:', {
    pluginId,
    isLoading,
    error,
    sampleKey: t('title'),
  });

  return null;
}
```

## 示例：完整插件

### plugin.json

```json
{
  "name": "analytics-dashboard",
  "version": "1.0.0",
  "displayName": "Analytics Dashboard",
  "description": "Real-time analytics for your content",
  "i18n": {
    "defaultLocale": "en-US",
    "supportedLocales": ["en-US", "zh-CN"],
    "messages": {
      "en-US": {
        "title": "Analytics Dashboard",
        "description": "View real-time analytics for your content",
        "nav.overview": "Overview",
        "nav.reports": "Reports",
        "nav.settings": "Settings",
        "widget.visitors": "Visitors",
        "widget.pageViews": "Page Views",
        "widget.avgTime": "Avg. Time on Page",
        "chart.daily": "Daily",
        "chart.weekly": "Weekly",
        "chart.monthly": "Monthly",
        "settings.trackingId": "Tracking ID",
        "settings.enabled": "Enable Tracking",
        "button.refresh": "Refresh",
        "button.export": "Export Data"
      },
      "zh-CN": {
        "title": "数据分析面板",
        "description": "查看内容的实时数据分析",
        "nav.overview": "概览",
        "nav.reports": "报告",
        "nav.settings": "设置",
        "widget.visitors": "访客数",
        "widget.pageViews": "页面浏览量",
        "widget.avgTime": "平均停留时间",
        "chart.daily": "每日",
        "chart.weekly": "每周",
        "chart.monthly": "每月",
        "settings.trackingId": "跟踪 ID",
        "settings.enabled": "启用跟踪",
        "button.refresh": "刷新",
        "button.export": "导出数据"
      }
    },
    "onUninstall": "delete"
  }
}
```

### React 组件

```tsx
import { usePluginTranslation } from '@/components/i18n';
import { Card, Tabs, Button } from '@/components/ui';

function AnalyticsDashboard({ pluginId }: { pluginId: string }) {
  const { t, isLoading } = usePluginTranslation(pluginId);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline">{t('button.refresh')}</Button>
          <Button>{t('button.export')}</Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">{t('nav.overview')}</Tabs.Trigger>
          <Tabs.Trigger value="reports">{t('nav.reports')}</Tabs.Trigger>
          <Tabs.Trigger value="settings">{t('nav.settings')}</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <Card.Header>{t('widget.visitors')}</Card.Header>
              <Card.Content>1,234</Card.Content>
            </Card>
            <Card>
              <Card.Header>{t('widget.pageViews')}</Card.Header>
              <Card.Content>5,678</Card.Content>
            </Card>
            <Card>
              <Card.Header>{t('widget.avgTime')}</Card.Header>
              <Card.Content>2m 34s</Card.Content>
            </Card>
          </div>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
```

## 常见问题

### Q: 翻译没有显示？

检查：
1. `namespace` 是否正确（默认为 `plugin:{pluginId}`）
2. 插件是否已安装且翻译已导入
3. 使用 `isLoading` 等待加载完成

### Q: 如何覆盖用户自定义翻译？

默认情况下，更新插件不会覆盖用户修改的翻译。如果需要强制更新：

```typescript
// 先删除再重新导入
await trpc.i18n.deleteNamespace.mutate({
  namespace: `plugin:${pluginId}`,
});
await installPluginTranslations(pluginId, orgId, i18nConfig);
```

### Q: 如何支持动态翻译？

对于需要在运行时添加的翻译（如用户创建的标签）：

```typescript
await trpc.i18n.upsertMessage.mutate({
  namespace: `plugin:${pluginId}`,
  key: `tag.${tagId}`,
  locale: 'zh-CN',
  value: '自定义标签',
});
```
