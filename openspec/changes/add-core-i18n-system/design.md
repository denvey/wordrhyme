## Context

WordRhyme 需要支持多语言/多地区用户。根据 `GLOBALIZATION_GOVERNANCE.md`，全球化是 Core 基础能力，采用 Hybrid 模式：
- **Core**：提供 Contract（数据结构）+ Runtime（Context 解析、格式化）
- **Plugin**：提供翻译资源，消费 Core 格式化能力

## Goals

- 统一的语言/翻译管理能力
- 高性能多层缓存
- 前端 SSR 友好集成
- RTL 语言支持
- Plugin 翻译资源隔离

## Non-Goals

- AI 翻译（后续实现）
- 批量导入导出（后续实现）
- 自动机器翻译
- 多货币转换（单独功能）

## Decisions

### D1: 翻译存储模型

**决定**：使用 JSONB 存储所有语言翻译

```sql
translations JSONB NOT NULL  -- {"zh-CN": "提交", "en-US": "Submit"}
```

**理由**：
- 一条记录包含所有语言，查询效率高
- 避免 JOIN 多张表
- 符合治理文档数据模型规范

**备选**：每语言一行 → 查询需 GROUP BY，复杂度高

### D2: Key 命名策略

**决定**：同时支持语义化 Key 和原文作 Key

| 格式 | 示例 | 场景 |
|------|------|------|
| 语义化（推荐） | `order.submit` | 新项目 |
| 原文（兼容） | `提交订单` | 快速开发 |

**理由**：降低迁移成本，逐步规范化

### D3: 缓存策略

**决定**：三层缓存 + 版本号

```
CDN (5min) → Redis (1h) → DB
版本号: i18n:v:{org}:{locale}:{ns} → "1706961234567"
```

**理由**：
- 减少 DB 查询
- 版本号对比避免无效下载
- 主动失效保证一致性

### D4: 前端 SSR 集成

**决定**：服务端预取 + 客户端 hydrate

```tsx
// Server
const messages = await fetchMessagesInternal(locale, namespaces);
// Client
<I18nProvider locale={locale} messages={messages}>{children}</I18nProvider>
```

**理由**：避免 Hydration 不一致

### D5: RTL 支持

**决定**：强制 Logical CSS，Stylelint 禁用物理属性

```css
/* 禁止 */ margin-left, padding-right, left, right
/* 使用 */ margin-inline-start, padding-inline-end, inset-inline-start
```

**理由**：一次编写，自动适配 LTR/RTL

### D6: Plugin 翻译生命周期

**决定**：
- 安装：Key 冲突跳过 + 记录日志
- 升级：`user_modified=true` 的不覆盖
- 卸载：删除 `user_modified=false` 的

**理由**：保护用户自定义，避免数据丢失

### D7: 使用 @wordrhyme/auto-crud 加速开发

**决定**：语言管理和翻译管理使用 auto-crud 组件

> 注意：auto-crud 有更新，实施时使用最新写法

**理由**：
- 减少 80% 的 CRUD 代码
- 自动生成列表、筛选、表单
- 批量删除/更新开箱即用
- 与项目 tRPC 架构完美集成

### D8: 区分 UI 文案与内容数据

**决定**：两类多语言使用不同方案

| 类型 | 存储位置 | 获取方式 | 示例 |
|------|----------|----------|------|
| **UI 文案** | `i18n_messages` 表 | `t('order.submit')` | 按钮、菜单、提示 |
| **内容数据** | 实体表 JSONB 字段 | `getI18nValue(field, locale)` | 商品名、文章、分类 |

**内容数据结构**：

```ts
product {
  title: JSONB         // { "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }
  description: JSONB   // { "en-US": "...", "zh-CN": "..." }
}
```

**Core 提供统一 Helper**：

```ts
import { getI18nValue } from '@wordrhyme/core';

// 基础用法
const title = getI18nValue(product.title, locale);

// 带 fallback
const title = getI18nValue(product.title, locale, defaultLocale);
```

**理由**：
- UI 文案需要翻译管理、版本控制、Plugin 隔离
- 内容数据与实体生命周期绑定，不需要独立表
- 统一 Helper 避免插件自行实现

## Risks & Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| JSONB 查询性能 | 添加 GIN 索引，按 namespace 分片 |
| 翻译包过大 | 按 namespace 懒加载 |
| RTL 组件兼容性 | 审计 + Stylelint CI |
| Plugin 硬编码 | SDK 校验 + 运行时警告 |

## Migration Plan

1. 创建数据库表（无破坏性）
2. 添加 tRPC Router
3. 集成前端 I18nProvider
4. 逐步迁移硬编码文本到 i18n

## Open Questions

- ~~MVP 范围~~ → 已确定：语言管理 + 翻译管理 + RTL
- ~~AI 翻译~~ → 后续实现
