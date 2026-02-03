# DSUni Plugin Integration - Review Request

**Status**: ⏳ PENDING_APPROVAL
**Created**: 2026-01-30
**Change ID**: `add-dsuni-plugin-integration`

---

## 📋 变更总结

本次 proposal 整合了两项关键设计决策：

### 1. 权限定义机制 (Permission Definition)

**决策**: 采用**集中代码定义 + 构建时生成 manifest** 方案

**核心文件**: `src/permissions.ts`

```typescript
export const PERMISSIONS = {
  products: {
    view: { key: 'products.view', description: '查看产品' },
    manage: { key: 'products.manage', description: '管理产品' },
  },
  orders: {
    view: { key: 'orders.view', description: '查看订单' },
    fulfill: { key: 'orders.fulfill', description: '履行订单' },
  },
} as const;
```

**开发流程**:
1. 开发者在 `src/permissions.ts` 定义权限（单一来源）
2. `pnpm build` 时自动生成 `manifest.json`
3. 使用时: `.meta({ permission: PERMISSIONS.products.view })` (类型安全)

**优势**:
- ✅ 只写一次（DX 优化）
- ✅ TypeScript 类型安全
- ✅ manifest 包含完整权限列表（安装时可审查）
- ✅ 符合 Contract-First（manifest 是构建产物）

**依赖**: 需要 `@wordrhyme/plugin` SDK 提供构建工具支持

---

### 2. LBAC 强制集成 (Label-Based Access Control)

**决策**: 所有插件表强制使用 LBAC 字段，自动注入标签

**Schema 要求**:
```sql
CREATE TABLE plugin_dsuni_products (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL,
  acl_tags TEXT[] NOT NULL DEFAULT '{}',  -- ← 强制字段
  deny_tags TEXT[] NOT NULL DEFAULT '{}', -- ← 强制字段
  ...
);
```

**自动行为**:
- 创建时: 自动注入 `aclTags = ['org:{organizationId}']`
- 查询时: 自动过滤 `organization_id` + LBAC 标签匹配
- 空数组: `aclTags = []` → 无人可访问（安全优先）

**开发者透明**: 无需手动配置，scoped-db 自动处理

**依赖**: 需要 `@wordrhyme/auto-crud-server` 集成 scoped-db

---

## 📝 已更新文档

### `proposal.md`
- ✅ 更新 **Dependencies** 部分：
  - 标注 `@wordrhyme/plugin` 需要构建工具支持
  - 标注 `auto-crud-server` 需要 scoped-db 集成
- ✅ 更新 **Blocking Work**：
  - 新增 "Plugin SDK 增强" 任务
  - 新增 "Auto-CRUD 集成" 任务
- ✅ 更新 **Success Criteria**：
  - 新增 LBAC 自动注入验证
  - 新增权限类型生成验证
  - 修正术语: `tenant_id` → `organization_id`

### `specs/dsuni-plugin/spec.md`
- ✅ 重写 **Requirement: Permission Declarations**：
  - 新增 "集中代码定义" scenario
  - 新增 "构建时生成 manifest" scenario
  - 新增 "类型安全使用" scenario
  - 更新 "权限检查执行" scenario (使用 meta)
- ✅ 更新 **Requirement: Multi-tenant Data Model**：
  - 新增 `aclTags`/`denyTags` schema 字段
  - 新增 "LBAC 自动注入" scenario
  - 新增 "空标签阻止访问" scenario
  - 更新 "租户隔离" scenario (包含 LBAC 过滤)

---

## 🔍 关键设计原则确认

### Contract-First 原则
- ✅ manifest 仍然是外部契约
- ✅ 安装时可审查完整权限列表
- ✅ 构建产物确定性（不依赖运行时）

### Security-First 原则
- ✅ 空 `aclTags` = 无权限（防止误配置泄露数据）
- ✅ 自动注入组织级标签（默认安全）
- ✅ 开发者无需关心 LBAC 细节

### Developer Experience
- ✅ 权限只写一次（`src/permissions.ts`）
- ✅ 类型安全的权限引用
- ✅ LBAC 完全透明（自动处理）

---

## ⚠️ 需要确认的问题

### Q1: 权限定义方案是否符合预期？
- 集中代码定义 vs 分散 meta 定义
- 构建时生成 vs 运行时扫描
- 当前推荐: **集中代码定义 + 构建时生成**

### Q2: LBAC 强制使用是否合理？
- 所有插件表必须包含 `aclTags`/`denyTags`
- 自动注入默认标签 `['org:{organizationId}']`
- 空数组阻止所有访问

### Q3: Blocking Work 优先级
1. Plugin SDK 构建工具
2. Auto-CRUD 集成 scoped-db
3. 外部平台插件脚手架
4. 核心系统功能（hook/dependency）

**哪些可以与 dsuni 开发并行？哪些必须先完成？**

---

## ✅ 请审查并批准

**如果同意当前设计，请回复**:
- ✅ **批准** → 我将创建 `tasks.md` 分解实施任务
- ⚠️ **修改建议** → 告诉我需要调整的部分
- ❌ **重新设计** → 说明你的期望方向

**审查重点**:
1. 权限定义方案是否可行？
2. LBAC 强制集成是否合理？
3. 依赖项描述是否清晰？
4. Success Criteria 是否完整？

---

**下一步**:
- [ ] 用户 Review & Approve
- [ ] 创建 `tasks.md` 分解任务
- [ ] 开始实施（或先实施 Blocking Work）
