# 更新总结 - DSUni Plugin Integration Proposal & Spec

**更新时间**: 2026-01-30
**状态**: ✅ 已完成，等待用户 Review & Approval

---

## 📝 更新内容概览

### 1. 权限系统架构整合

**基于完整的系统分析** (`permission-system-analysis.md`)，更新了所有权限相关描述：

#### 从模糊权限 → 细粒度原子权限

```diff
- dsuni.products.manage  (模糊，包含什么？)
+ com.wordrhyme.dsuni.products.view
+ com.wordrhyme.dsuni.products.create
+ com.wordrhyme.dsuni.products.update
+ com.wordrhyme.dsuni.products.delete
+ com.wordrhyme.dsuni.products.publish
+ com.wordrhyme.dsuni.products.unpublish

- dsuni.orders.manage  (太宽泛)
+ com.wordrhyme.dsuni.orders.view
+ com.wordrhyme.dsuni.orders.updateInfo  (客服专用)
+ com.wordrhyme.dsuni.orders.fulfill     (仓库专用)
+ com.wordrhyme.dsuni.orders.cancel      (客服专用)
+ com.wordrhyme.dsuni.orders.refund      (财务专用)
```

#### 权限格式与 CASL 转换

```typescript
// 定义 (manifest.ts)
'com.wordrhyme.dsuni.products.view'

// 自动转换为 CASL (capability-parser.ts)
{
  action: 'view',
  subject: 'plugin:com.wordrhyme.dsuni:products'
}

// 存储 (role_permissions 表)
INSERT INTO role_permissions (role_id, action, subject, source) VALUES
  ('admin-role-id', 'view', 'plugin:com.wordrhyme.dsuni:products', 'com.wordrhyme.dsuni');
```

---

### 2. Manifest.ts 单一来源

**采用用户建议**，使用 `manifest.ts` + `definePlugin` 方案：

```typescript
// manifest.ts - 唯一配置文件
export const { manifest, PERMISSIONS } = definePlugin({
  pluginId: 'com.wordrhyme.dsuni',  // 只写一次

  permissions: {
    products: {
      view: '查看产品',    // 自动前缀: com.wordrhyme.dsuni.products.view
      create: '创建产品',
    },
  },

  capabilities: { ... },
  server: { ... },
  admin: { ... },
});

// 使用
.meta({ permission: PERMISSIONS.products.view })
//                   ^^^^^^^^^^^^^^^^^^^^^^^^
//                   'com.wordrhyme.dsuni.products.view'
```

**优势**:
- ✅ 真正的单一文件（不需要 src/permissions.ts）
- ✅ 整个 manifest 都有类型校验
- ✅ pluginId 只写一次，自动添加前缀
- ✅ 构建时生成 manifest.json

---

### 3. 多层权限控制整合

#### L1: RBAC + ABAC (PermissionKernel + CASL)

```diff
proposal.md:
+ **THEN** global middleware checks `.meta({ permission })`
+ **AND** PermissionKernel evaluates CASL rule: `can('create', 'plugin:...')`
+ **AND** if permission denied, returns HTTP 403 Forbidden

spec.md 新增:
+ ### Requirement: ABAC (Attribute-Based Access Control)
+ 支持 conditions 进行动态权限检查
+ 示例: { "status": { "$in": ["pending"] } }
+ 示例: { "createdBy": "${user.id}" }
```

#### L2: Field-Level Control (FieldGuard + CASL fields)

```diff
spec.md 新增:
+ ### Requirement: Field-Level Access Control
+ FieldGuard 注册字段规则
+ 示例: { field: 'cost', rule: FieldRules.roles('财务', '老板') }
+ 自动移除未授权字段
```

#### L3: Row-Level Control (Scoped DB + LBAC)

```diff
proposal.md 更新:
- `tenant_id` / `workspace_id`
+ `organization_id` (单层多租户)
+ `acl_tags` (TEXT[], DEFAULT '{}')
+ `deny_tags` (TEXT[], DEFAULT '{}')

+ 自动注入: aclTags = ['org:{organizationId}']
+ 空数组 = 无权限 (security-first)
```

---

### 4. 文件变更清单

#### `proposal.md` 变更

| 行号 | 部分 | 变更类型 | 内容 |
|------|------|---------|------|
| 78-92 | Requirement 1 | 重写 | 细粒度权限 + CASL 格式说明 |
| 99-111 | Requirement 2 | 新增 | LBAC 字段 (acl_tags, deny_tags) |
| 106-111 | Requirement 2 | 更新 | Scoped DB 三层过滤逻辑 |
| 126-157 | Requirement 3 | 重写 | CASL 权限检查 + auto-crud 集成 |
| 246-254 | Success Criteria | 扩展 | 新增 10 条验证点 |
| 303-326 | Dependencies | 更新 | 明确 SDK 需求 (definePlugin, FieldGuard) |

#### `specs/dsuni-plugin/spec.md` 变更

| 行号 | 部分 | 变更类型 | 内容 |
|------|------|---------|------|
| 11-57 | Plugin Manifest | 重写 | manifest.ts + definePlugin 方案 |
| 34-66 | Multi-tenant Data | 更新 | LBAC 字段 + 自动注入逻辑 |
| 69-133 | Auto-CRUD API | 更新 | scoped-db 集成 + LBAC 过滤 |
| 217-313 | Permission Declarations | 完全重写 | CASL-based + 细粒度权限 |
| 314-372 | ABAC (新增) | 新增 | ABAC conditions + 实例检查 |
| 373-422 | Field-Level Control (新增) | 新增 | FieldGuard + CASL fields |
| 483-506 | Success Criteria | 扩展 | 新增 CASL/ABAC/LBAC 测试点 |

---

### 5. 新增文档

| 文件 | 用途 | 关键内容 |
|------|------|---------|
| `permission-system-analysis.md` | 系统权限架构完整分析 | RBAC/ABAC/Field/LBAC 四层控制 |
| `fine-grained-permissions-design.md` | 细粒度权限设计指南 | fulfill/cancel/refund vs manage |
| `define-plugin-implementation.md` | definePlugin API 实现方案 | 单一 pluginId，自动前缀 |
| `manifest-ts-proposal.md` | manifest.ts 方案对比 | 为什么选择 TS over JSON |

---

### 6. 关键设计决策

#### 决策1: 权限粒度
- ❌ 弃用: `manage` (模糊权限)
- ✅ 采用: 原子操作权限 (view/create/update/delete/fulfill/cancel/refund)
- **理由**: 实现职责分离，支持细粒度角色配置

#### 决策2: 权限定义方式
- ❌ 弃用: 分散在每个 procedure 的 meta 中定义
- ❌ 弃用: src/permissions.ts 独立文件
- ✅ 采用: manifest.ts 单一来源 + definePlugin
- **理由**: 真正的单一文件，整个 manifest 都有类型校验

#### 决策3: 权限 Key 格式
- ❌ 弃用: `products.view` (缺少 pluginId)
- ✅ 采用: `com.wordrhyme.dsuni.products.view` (完整格式)
- **理由**: 自动添加前缀，避免跨插件冲突

#### 决策4: LBAC 强制集成
- ✅ 所有插件表强制包含 `acl_tags` / `deny_tags`
- ✅ 默认自动注入 `['org:{organizationId}']`
- ✅ 空数组 = 无权限 (security-first)
- **理由**: 行级权限控制，防止数据泄露

---

### 7. 依赖项更新

#### `@wordrhyme/plugin` SDK 需要实现

```typescript
// 新增 API
export function definePlugin<P>(config: PluginDefinition<P>): PluginResult<P>

// 构建工具
export function buildManifest(pluginDir: string): Promise<void>

// 类型
export type PermissionKeys<T>
export type PluginManifest
```

#### `@wordrhyme/auto-crud-server` 需要集成

- ✅ 集成 scoped-db 进行自动租户过滤
- ✅ 支持 LBAC 字段的自动注入
- ✅ 默认策略: `aclTags: ['org:{organizationId}']`

---

### 8. 验证清单 (Review Points)

请重点检查以下内容：

#### 权限设计
- [ ] 细粒度权限是否合理？(fulfill/cancel/refund vs manage)
- [ ] CASL 转换逻辑是否清晰？
- [ ] ABAC conditions 的使用场景是否准确？
- [ ] Field-level control 是否必要？

#### Manifest.ts 方案
- [ ] definePlugin API 设计是否合理？
- [ ] 构建流程是否清晰？
- [ ] 类型安全是否足够？

#### LBAC 集成
- [ ] 强制 LBAC 是否合理？
- [ ] 默认策略 (org-level) 是否正确？
- [ ] 空数组 = 无权限 是否太严格？

#### 技术可行性
- [ ] 所有依赖项都可以实现吗？
- [ ] 性能影响是否可接受？(多层权限检查)
- [ ] 开发者体验是否良好？

---

## ✅ 下一步

**如果批准当前设计**，下一步是：

1. 创建 `tasks.md` 分解实施任务
2. 优先级排序：
   - P0: `@wordrhyme/plugin` SDK (definePlugin + buildManifest)
   - P0: `@wordrhyme/auto-crud-server` scoped-db 集成
   - P1: DSUni 插件脚手架
   - P2: 外部平台插件 (stubs)

**如果需要修改**，请指出：
- 哪些设计不合理？
- 哪些需要简化？
- 哪些需要补充？

---

**状态**: 🟡 等待 Review & Approval
