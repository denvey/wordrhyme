# Design: Permission Config UI Architecture

## Overview

本文档描述权限配置 UI 的架构设计，包括前端组件结构、后端数据模型和交互流程。

---

## 1. UI 架构

### 1.1 组件层级

```
RoleDetail (页面)
├── RoleHeader (角色信息头部)
├── Tabs
│   ├── Tab: General (基本信息)
│   ├── Tab: Permissions (权限配置) ← 本次重构重点
│   │   └── PermissionEditor
│   │       ├── ResourcePermissionTree (左侧)
│   │       │   ├── TreeSearch (搜索框)
│   │       │   ├── TreeToolbar (批量操作)
│   │       │   └── TreeNode (递归)
│   │       │       ├── NodeHeader (资源名称+图标)
│   │       │       ├── ActionCheckboxes (操作权限)
│   │       │       └── AdvancedConfigButton (高级配置入口)
│   │       └── AdvancedConfigPanel (右侧，按需显示)
│   │           ├── PresetSelector (预设选择器)
│   │           ├── FieldPermissions (字段权限，可选)
│   │           └── CustomJsonEditor (自定义 JSON，可选)
│   └── Tab: Menu Visibility (菜单可见性)
└── RoleFooter (保存/取消按钮)
```

### 1.2 状态管理

```typescript
interface PermissionEditorState {
  // 当前角色 ID
  roleId: string;

  // 资源树展开状态
  expandedNodes: Set<string>;

  // 权限配置（按 subject 分组）
  permissions: Record<string, ResourcePermissionConfig>;

  // 高级配置面板状态
  advancedPanel: {
    isOpen: boolean;
    subject: string | null;  // 当前编辑的资源
  };

  // 变更追踪
  isDirty: boolean;
  originalPermissions: Record<string, ResourcePermissionConfig>;
}

interface ResourcePermissionConfig {
  // 已选操作
  actions: Set<string>;

  // 条件预设（互斥选择）
  preset: ConditionPresetKey;

  // 自定义条件（当 preset === 'custom' 时有效）
  customConditions: Record<string, unknown> | null;

  // 字段权限（可选）
  fields: {
    visible: Set<string>;
    editable: Set<string>;
  } | null;
}
```

### 1.3 交互流程

```
用户进入角色详情页
    ↓
加载角色信息 + 权限配置
    ↓
渲染 ResourcePermissionTree
    ↓
用户在树上勾选操作权限
    ↓
标记 isDirty = true
    ↓
（可选）用户点击"高级配置"
    ↓
打开 AdvancedConfigPanel
    ↓
选择预设 或 编辑自定义规则
    ↓
点击"应用"关闭面板
    ↓
用户点击"保存"
    ↓
调用 savePermissions API
    ↓
刷新权限缓存
```

---

## 2. 后端架构

### 2.1 数据模型

#### condition-presets.ts

```typescript
export interface ConditionPreset {
  key: ConditionPresetKey;
  label: string;
  description: string;
  conditions: Record<string, unknown> | null;
  icon: string;
  applicableSubjects?: string[];  // 限制适用资源
  combinable: boolean;
}

export const CONDITION_PRESETS: Record<ConditionPresetKey, ConditionPreset> = {
  none: { ... },      // 无限制
  own: { ... },       // 仅自己创建的
  team: { ... },      // 同团队的
  department: { ... }, // 同部门的
  public: { ... },    // 公开的
  // ...
};
```

#### resource-definitions.ts 扩展

```typescript
interface BaseResourceDefinition {
  // 现有字段...

  // 新增：操作分组
  actionGroups?: ActionGroupDefinition[];

  // 新增：可用预设
  availablePresets?: ConditionPresetKey[];

  // 新增：资源类型
  resourceType?: 'directory' | 'resource';
}
```

#### role_permissions 表扩展

```sql
ALTER TABLE role_permissions ADD COLUMN presets JSONB;
ALTER TABLE role_permissions ADD COLUMN is_custom_condition BOOLEAN NOT NULL DEFAULT false;
```

### 2.2 API 设计

#### getResourceTree

返回用于左侧树的资源层级结构：

```typescript
// Response
interface ResourceTreeNode {
  code: string;           // 如 "core:member"
  subject: string;        // 如 "Member"
  label: string;          // 如 "Members"
  icon: string;           // 如 "Users"
  isDirectory: boolean;   // 目录节点无权限配置
  actions: string[];      // 可用操作列表
  children: ResourceTreeNode[];
}
```

#### getResourceDetail

返回资源的详细配置元数据（用于高级配置面板）：

```typescript
// Input
{ subject: string }

// Response
interface ResourceDetail {
  subject: string;
  label: string;
  description: string;

  // 操作分组
  actionGroups: ActionGroupDefinition[];

  // 可用预设
  presets: ConditionPreset[];

  // 字段定义（用于字段权限配置）
  fields: FieldDefinition[];
  fieldGroups: FieldGroupDefinition[];
}
```

#### getRolePermissions

获取角色的权限配置（用于回显）：

```typescript
// Input
{ roleId: string }

// Response
Record<string, {
  actions: string[];
  preset: ConditionPresetKey | null;
  customConditions: Record<string, unknown> | null;
  fields: string[] | null;
}>
```

#### savePermissions

保存权限配置：

```typescript
// Input
{
  roleId: string;
  permissions: Record<string, {
    actions: string[];
    preset: ConditionPresetKey;
    customConditions?: Record<string, unknown>;
    fields?: string[];
  }>;
}

// Response
{ success: boolean }
```

---

## 3. 关键设计决策

### 3.1 树上权限 vs 右侧面板

**决策**：基础操作权限直接在树节点上配置，高级配置通过右侧面板

**理由**：
1. 80% 用户只需配置操作权限，无需打开面板
2. 树结构提供全局视图，一目了然
3. 高级配置按需加载，减少认知负担

### 3.2 预设 vs 自定义 JSON

**决策**：优先使用预设，自定义 JSON 作为降级方案

**理由**：
1. 预设覆盖 90% 常见场景
2. 非技术用户无需学习 CASL 语法
3. 预设可以安全验证，自定义 JSON 需要严格校验

### 3.3 保存策略

**决策**：页面级保存（非实时保存）

**理由**：
1. 用户可能需要配置多个资源后一起保存
2. 支持取消/重置操作
3. 减少 API 调用次数

### 3.4 字段权限优先级

**决策**：P2 优先级，先实现资源+操作+条件

**理由**：
1. 字段权限增加显著复杂度
2. 大部分场景不需要字段级控制
3. 可以在后续迭代中添加

---

## 4. 性能考虑

### 4.1 树渲染优化

- 使用 `React.memo` 防止不必要的重渲染
- 大型资源列表考虑虚拟滚动
- 懒加载子节点权限状态

### 4.2 API 调用优化

- 初始加载：`getResourceTree` + `getRolePermissions` 并行调用
- 高级配置：按需调用 `getResourceDetail`
- 保存：单次 API 调用保存所有变更

### 4.3 状态管理

- 使用 `useReducer` 管理复杂状态
- 变更追踪使用 `immer` 进行不可变更新
- 防抖处理频繁的复选框操作

---

## 5. 迁移策略

### 5.1 数据库迁移

```sql
-- 添加新字段
ALTER TABLE role_permissions
ADD COLUMN presets JSONB,
ADD COLUMN is_custom_condition BOOLEAN NOT NULL DEFAULT false;

-- 迁移现有数据
UPDATE role_permissions
SET is_custom_condition = true
WHERE conditions IS NOT NULL;
```

### 5.2 向后兼容

- 新字段均可空，不影响现有数据
- API 响应自动填充默认值
- 前端兼容旧格式数据

### 5.3 渐进式迁移

1. 部署新 UI，旧 UI 保留为降级方案
2. 通过 Feature Flag 控制新 UI 可见性
3. 收集用户反馈后全量切换
