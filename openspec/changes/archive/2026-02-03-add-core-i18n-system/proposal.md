# Change: Add Core I18n System (Globalization Runtime)

## Why

WordRhyme 需要支持多语言/多地区用户。根据 `GLOBALIZATION_GOVERNANCE.md` 治理文档，全球化是 Core 基础能力，必须由 Core 提供统一 Contract 与 Runtime，Plugin 只消费不控制。

当前系统缺少：
- 语言管理能力（添加/启用/禁用语言）
- 翻译管理能力（CRUD、批量导入导出）
- 前端 i18n 集成（react-i18next + SSR）
- RTL（从右到左）语言支持

## What Changes

### Core 新增能力

1. **数据层**
   - `i18n_languages` 表：语言配置
   - `i18n_messages` 表：翻译条目（JSONB 存储多语言）

2. **tRPC Router**
   - `i18n.getMessages`：公开，拉取翻译
   - `i18n.languages.*`：语言管理 CRUD
   - `i18n.messages.*`：翻译管理 CRUD

3. **Runtime**
   - `GlobalizationContext`：locale, currency, timezone, direction
   - Context Resolver Pipeline
   - Redis 多层缓存 + 版本号机制

4. **前端集成**
   - react-i18next 配置
   - I18nProvider（SSR 支持）
   - LocalStorage 缓存 + 版本号

5. **Smart Components**（Core 提供，Plugin 消费）
   - `<LocalizedText />`
   - `<CurrencyDisplay />`
   - `<DateTimeDisplay />`

6. **RTL 支持**
   - Stylelint 禁用物理 CSS 属性
   - Logical CSS 规范

### Plugin 集成

- Plugin Manifest 扩展 `i18n` 字段
- 安装时自动加载翻译资源
- `usePluginTranslation()` Hook

### MVP 范围（本次）

- ✅ 语言管理（CRUD + 设置默认）
- ✅ 翻译管理（CRUD + 筛选）
- ✅ 前端 i18n 集成
- ✅ RTL 支持
- ❌ AI 翻译（后续）
- ❌ 批量导入导出（后续）

## Impact

- **Affected specs**: 新增 `globalization` 能力
- **Affected code**:
  - `packages/db/src/schema/` - 新增 i18n schema
  - `apps/server/src/trpc/routers/` - 新增 i18n router
  - `apps/server/src/globalization/` - 新增 Context Resolver
  - `packages/ui/src/providers/` - 新增 I18nProvider
  - `packages/ui/src/components/i18n/` - 新增 Smart Components
  - `apps/admin/` - 新增语言/翻译管理页面
  - `.stylelintrc.js` - 新增 RTL 规则

## Dependencies

- 遵循 `GLOBALIZATION_GOVERNANCE.md` 治理文档
- 参考 `docs/i18n-architecture-final.md` 详细设计

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| RTL 布局破坏 | Stylelint 强制 Logical CSS，CI 检查 |
| 翻译包体积过大 | 按 namespace 懒加载 + 多层缓存 |
| SSR Hydration 不一致 | 服务端预取 + 客户端 hydrate |
| Plugin 实现不一致 | SDK 提供 Hook，禁止直接使用 i18next |
