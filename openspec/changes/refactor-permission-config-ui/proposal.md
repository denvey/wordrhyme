# Proposal: Refactor Permission Config UI

## Change ID
`refactor-permission-config-ui`

## Summary

重构角色权限配置界面，采用 Shopify 风格的级联导航设计。核心变更：**将操作权限直接集成到左侧资源树中**，实现快速权限选择；右侧面板仅在需要高级配置（字段权限、CASL 条件规则）时显示。

## Motivation

### 当前问题

1. **配置复杂度高**：用户需要理解 CASL 规则的 JSON 格式
2. **操作步骤多**：配置一个资源权限需要多次点击
3. **学习成本高**：非技术用户难以理解当前界面
4. **信息分散**：资源列表和权限配置分离，缺乏整体视图

### 目标

1. **80% 场景快速完成**：基础权限配置直接在树上完成
2. **渐进式复杂度**：高级配置按需展开
3. **直观易懂**：预设场景代替 JSON 编辑
4. **Shopify 风格**：参考业界最佳实践

## Proposed Solution

### 1. 左侧资源树（带操作权限）

```
┌─────────────────────────────────────────┐
│  🔍 搜索资源...                          │
│                                         │
│  📊 Dashboard                           │
│     ☑ read                              │
│                                         │
│  ▼ 👥 Team                              │
│    ├─ Members                           │
│    │   ☑ create ☑ read ☑ update ☐ delete│
│    │   [高级配置 →]                      │
│    ├─ Roles                             │
│    │   ☑ create ☑ read ☑ update ☑ delete│
│    └─ Invitations                       │
│        ☑ create ☑ read ☐ delete         │
│                                         │
│  ▼ 📁 Content                           │
│    ├─ Files ●                           │
│    │   ☑ create ☑ read ☑ update ☐ delete│
│    │   [高级配置 →] ← 有高级配置时显示标记  │
│    └─ Assets                            │
│        ...                              │
└─────────────────────────────────────────┘
```

**设计要点**：
- 每个资源节点下方直接显示操作权限复选框
- 支持快捷操作（全选/只读/清除）
- 有高级配置时显示"高级配置"按钮
- 目录节点可折叠/展开

### 2. 右侧高级配置面板（按需显示）

仅当点击"高级配置"按钮时显示：

```
┌─────────────────────────────────────────────────────────┐
│  📁 Files - 高级配置                            [× 关闭] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ▼ 条件规则                                              │
│  ─────────────────────────────────────────────────────  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ● 无限制      │  │ ○ 仅自己创建  │  │ ○ 同团队的    │  │
│  │   所有数据    │  │   的数据      │  │   数据        │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐                                       │
│  │ ○ 自定义规则  │                                       │
│  │   编辑 JSON   │                                       │
│  └──────────────┘                                       │
│                                                         │
│  ▼ 字段权限（可选）                                       │
│  ─────────────────────────────────────────────────────  │
│  字段名          可见    可编辑                           │
│  name            ☑       ☑                              │
│  url             ☑       ☐  🔒                          │
│  size            ☑       ☐  (只读)                      │
│                                                         │
│                                          [应用] [取消]   │
└─────────────────────────────────────────────────────────┘
```

### 3. 后端数据模型扩展

新增 `condition-presets.ts`：
- 预设条件规则（own, team, department, public, etc.）
- 预设组合器
- 模板变量解析

扩展 `resource-definitions.ts`：
- 添加 `actionGroups` 字段（操作分组）
- 添加 `availablePresets` 字段（可用预设）
- 添加 `resourceType` 字段（directory/resource）

### 4. 新增 API 端点

| 端点 | 用途 |
|------|------|
| `permissionConfig.getResourceTree` | 左侧资源树数据 |
| `permissionConfig.getResourceDetail` | 资源详情（含预设） |
| `permissionConfig.savePermissions` | 保存权限配置 |
| `permissionConfig.getPresets` | 预设列表 |

## Scope

### In Scope

1. **前端**：
   - 重构 `RoleDetail.tsx` 页面
   - 新增 `ResourcePermissionTree` 组件
   - 新增 `AdvancedConfigPanel` 组件
   - 新增 `PresetSelector` 组件

2. **后端**：
   - 新增 `condition-presets.ts`（已部分完成）
   - 扩展 `resource-definitions.ts`（已部分完成）
   - 新增 `permission-config.router.ts`

3. **数据库**：
   - 扩展 `role_permissions` 表（添加 `presets`, `is_custom_condition` 字段）

### Out of Scope

1. 字段级权限的完整实现（P2，可后续迭代）
2. 自定义 JSON 编辑器（P2，先用简单 textarea）
3. 移动端响应式（P2，先保证桌面端体验）
4. 权限模板/角色模板功能

## Dependencies

- `@wordrhyme/ui` 组件库
- 现有 `permission-kernel` 规范
- 现有 `admin-ui-host` 规范
- `refactor-permission-casl-integration` 变更（已完成）

## Risks

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 树结构复杂度 | 渲染性能 | 使用虚拟滚动 |
| 条件预设不足 | 用户需自定义 | 提供 JSON 编辑降级 |
| 向后兼容 | 数据库迁移 | 新字段可空，渐进迁移 |

## Success Criteria

1. 配置一个资源的基础权限只需 1 次点击
2. 非技术用户可以通过预设完成 80% 的配置
3. 高级配置不影响基础操作的简洁性
4. 页面加载时间 < 500ms
