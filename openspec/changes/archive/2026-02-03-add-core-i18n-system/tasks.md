## 1. Core Data Layer

- [x] 1.1 创建 `i18n_languages` Drizzle schema
- [x] 1.2 创建 `i18n_messages` Drizzle schema
- [x] 1.3 添加数据库约束和索引
- [x] 1.4 创建数据库迁移
- [x] 1.5 添加种子数据（zh-CN, en-US + Core 基础翻译）
- [x] 1.6 创建 Zod schemas（select/insert/update）

## 2. Core Runtime

- [x] 2.1 定义 `GlobalizationContext` 接口
- [x] 2.2 实现 Context Resolver Pipeline
- [x] 2.3 实现 `I18nCacheService`（Redis 缓存 + 版本号）
- [x] 2.4 创建 `i18n.getMessages` tRPC procedure（公开）
- [x] 2.5 实现 `getI18nValue` Helper（内容数据多语言取值）

## 3. tRPC Router（使用 @wordrhyme/auto-crud-server）

- [x] 3.1 使用 `createCrudRouter` 创建 `i18n.languages` router
- [x] 3.2 使用 `createCrudRouter` 创建 `i18n.messages` router
- [x] 3.3 添加自定义 procedure（`setDefault`, `translate`）
- [x] 3.4 集成缓存失效逻辑

## 4. Frontend Integration

- [x] 4.1 安装 react-i18next 依赖
- [x] 4.2 创建 `I18nProvider`（SSR 支持）
- [x] 4.3 实现 tRPC Backend 加载翻译
- [x] 4.4 实现 LocalStorage 缓存 + 版本号机制
- [x] 4.5 更新 App Layout 集成 I18nProvider

## 5. Smart Components

- [x] 5.1 创建 `<LocalizedText />` 组件
- [x] 5.2 创建 `<CurrencyDisplay />` 组件
- [x] 5.3 创建 `<DateTimeDisplay />` 组件
- [x] 5.4 创建 `<NumberDisplay />` 组件

## 6. RTL Support

- [x] 6.1 配置 Stylelint 禁用物理 CSS 属性
- [x] 6.2 更新 Tailwind 配置支持 Logical 属性
- [x] 6.3 审计现有组件 RTL 兼容性
- [x] 6.4 修复不兼容组件

## 7. Admin UI（使用 @wordrhyme/auto-crud）

- [x] 7.1 创建语言管理页面（使用 `AutoCrudTable` + `useAutoCrudResource`）
- [x] 7.2 创建翻译管理页面（使用 `AutoCrudTable` + `useAutoCrudResource`）
- [x] 7.3 自定义翻译编辑表单（JSONB 多语言输入）
- [x] 7.4 添加语言切换器到 Header

## 8. Plugin SDK

- [x] 8.1 扩展 Plugin Manifest `i18n` 字段定义
- [x] 8.2 实现插件翻译安装/卸载生命周期
- [x] 8.3 创建 `usePluginTranslation()` Hook
- [x] 8.4 添加 SDK 校验（禁止硬编码 locale）

## 9. Testing

- [x] 9.1 i18n Router 单元测试
- [x] 9.2 Cache Service 单元测试
- [x] 9.3 I18nProvider 集成测试
- [x] 9.4 RTL 布局测试

## 10. Documentation

- [x] 10.1 更新 `docs/i18n-architecture-final.md` 为最终版
- [x] 10.2 添加开发者指南：如何添加翻译
- [x] 10.3 添加 Plugin 开发者指南：如何国际化插件
