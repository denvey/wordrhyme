# Tasks: Permission Config UI Refactor

## Phase 1: 后端数据模型（P0）

### 1.1 条件预设系统
- [x] 创建 `condition-presets.ts`
- [x] 定义预设类型 `ConditionPresetKey`
- [x] 实现 `CONDITION_PRESETS` 常量
- [x] 实现 `combinePresets()` 组合器
- [x] 实现 `getPresetsForSubject()` 过滤器
- [x] 实现 `resolveConditionTemplates()` 模板解析
- [ ] 添加单元测试

### 1.2 资源定义扩展
- [x] 扩展 `BaseResourceDefinition` 接口
  - [x] 添加 `actionGroups` 字段
  - [x] 添加 `availablePresets` 字段
  - [x] 添加 `resourceType` 字段
- [x] 更新 `RESOURCE_DEFINITIONS` 为每个资源添加分组
- [x] 添加 `getResourceTree()` 辅助函数
- [ ] 添加单元测试

### 1.3 数据库迁移
- [ ] 创建迁移文件：添加 `presets` 字段到 `role_permissions`
- [ ] 创建迁移文件：添加 `is_custom_condition` 字段
- [ ] 迁移现有数据（已有 conditions 的记录标记为 custom）
- [ ] 验证迁移

---

## Phase 2: 后端 API（P0）

### 2.1 Permission Config Router
- [x] 创建 `permission-config.router.ts`
- [x] 实现 `getResourceTree` 端点
- [x] 实现 `getResourceDetail` 端点
- [x] 实现 `getRolePermissions` 端点
- [x] 实现 `savePermissions` 端点
- [x] 实现 `getPresets` 端点
- [x] 实现 `previewConditions` 端点
- [x] 添加输入验证（Zod schemas）
- [x] 添加权限校验（Role read/update permissions）
- [ ] 添加集成测试

### 2.2 缓存失效
- [x] 保存权限后清除 L1 缓存（通过 PermissionCache.invalidateOrganization）
- [x] 保存权限后清除 L2 缓存（Redis）
- [ ] 验证多实例场景下的缓存一致性

---

## Phase 3: 前端组件（P1）

### 3.1 ResourcePermissionTree 组件
- [x] 创建 `ResourcePermissionTree.tsx`
- [x] 实现树结构渲染
- [x] 实现节点展开/折叠
- [x] 实现搜索过滤
- [x] 实现操作权限复选框
- [x] 实现快捷操作（全选/只读/清除）
- [x] 实现"高级配置"按钮
- [x] 添加加载状态
- [x] 添加空状态

### 3.2 ResourceNode 组件（原 TreeNode）
- [x] 创建 `ResourceNode.tsx`
- [x] 实现节点头部（图标+名称）
- [x] 实现 ActionCheckboxes（内联复选框）
- [x] 实现缩进和层级线
- [x] 实现子节点递归渲染
- [x] 实现高亮和选中状态
- [x] 实现父节点级联选择（Shopify 风格）
- [x] 实现权限计数显示（如 "3/12"）

### 3.3 AdvancedConfigPanel 组件
- [x] 创建 `AdvancedConfigPanel.tsx`
- [x] 实现面板头部（资源名称+关闭按钮）
- [x] 实现 PresetSelector（Radio Card 样式）
- [x] 实现自定义 JSON 输入（简单 textarea）
- [x] 实现应用/取消按钮
- [x] 实现面板动画（slide-in）
- [x] 实现字段级权限配置

### 3.4 PermissionEditor 组件
- [x] 创建 `PermissionEditor.tsx`（容器组件）
- [x] 实现状态管理（usePermissionState hook）
- [x] 实现变更追踪
- [x] 实现保存逻辑
- [x] 实现重置逻辑
- [x] 实现级联选择逻辑（toggleAllForNode）
- [x] 实现权限计数计算（getPermissionCount）
- [ ] 实现离开确认（可选，待后续完善）

### 3.5 后端字段定义扩展
- [x] 扩展 `BaseResourceDefinition` 添加 `availableFields` 字段
- [x] 添加 `FieldDefinition` 接口
- [x] 为 Member、File、Asset 资源添加示例字段
- [x] 更新 `getResourceDetail()` 返回字段信息

### 3.5 集成到 RoleDetail
- [x] 替换现有的 Data Permissions Tab
- [x] 保留 Menu Visibility Tab
- [ ] 验证保存流程（需运行时测试）

---

## Phase 4: 测试与优化（P1）

### 4.1 单元测试
- [ ] condition-presets.ts 测试
- [ ] resource-definitions.ts 测试
- [ ] API 端点测试

### 4.2 集成测试
- [ ] 完整权限配置流程测试
- [ ] 保存后权限生效验证
- [ ] 缓存失效验证

### 4.3 性能优化
- [ ] 树组件渲染优化
- [ ] 大量资源场景测试
- [ ] API 响应时间优化

---

## Phase 5: 文档与清理（P2）

### 5.1 文档
- [ ] 更新 PERMISSION_SYSTEM.md
- [ ] 添加 UI 使用说明
- [ ] 添加预设配置说明

### 5.2 清理
- [x] 删除旧的 RuleEditor 组件（已从 RoleDetail.tsx 移除）
- [ ] 清理未使用的代码
- [ ] 代码审查

---

## 依赖关系

```
Phase 1 (后端数据模型)
    ↓
Phase 2 (后端 API)
    ↓
Phase 3 (前端组件)
    ↓
Phase 4 (测试与优化)
    ↓
Phase 5 (文档与清理)
```

## 并行工作

- Phase 1.1 和 1.2 可并行
- Phase 3 可在 Phase 2 完成部分 API 后开始（使用 mock 数据）
- Phase 4 单元测试可与开发并行
