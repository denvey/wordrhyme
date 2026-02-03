# permission-config-ui Specification

## Purpose

定义权限配置 UI 的功能规范，包括资源树展示、操作权限配置、条件预设系统和高级配置面板。

---

## ADDED Requirements

### Requirement: Resource Permission Tree

权限配置界面 SHALL 提供左侧资源树，用户可以直接在树节点上配置操作权限。

#### Scenario: Tree renders resource hierarchy
- **WHEN** 用户进入角色权限配置页面
- **THEN** 左侧显示资源树，按 `RESOURCE_DEFINITIONS` 的层级结构渲染
- **AND** 目录节点（如 Team, Content, Settings）可展开/折叠
- **AND** 资源节点（如 Member, File）显示可用操作权限

#### Scenario: Action checkboxes on tree node
- **WHEN** 资源节点展开
- **THEN** 该节点下方显示操作权限复选框
- **AND** 复选框按 actionGroups 分组（如果有定义）
- **AND** 用户可以直接勾选/取消操作权限

#### Scenario: Directory nodes no actions
- **WHEN** 目录节点（menuPath === null）展开
- **THEN** 该节点不显示操作权限复选框
- **AND** 只显示子资源列表

#### Scenario: Quick actions on tree
- **WHEN** 用户悬停在资源节点上
- **THEN** 显示快捷操作按钮（全选/只读/清除）
- **AND** 点击"只读"自动勾选 `read` 并取消其他操作

---

### Requirement: Condition Presets

系统 SHALL 提供条件预设，用户可以通过选择预设来配置 CASL 条件规则，无需手动编写 JSON。

#### Scenario: Preset list available
- **WHEN** 用户打开高级配置面板
- **THEN** 显示该资源可用的条件预设列表
- **AND** 每个预设显示名称、描述和图标
- **AND** 预设按 `applicableSubjects` 过滤

#### Scenario: Preset selection
- **WHEN** 用户选择预设（如"仅自己创建的"）
- **THEN** 系统自动生成对应的 CASL conditions
- **AND** 预设选择是互斥的（单选）

#### Scenario: None preset clears conditions
- **WHEN** 用户选择"无限制"预设
- **THEN** 该资源的 conditions 设为 null
- **AND** 用户可以操作所有数据

#### Scenario: Custom preset shows JSON editor
- **WHEN** 用户选择"自定义规则"预设
- **THEN** 显示 JSON 编辑区域
- **AND** 用户可以输入自定义 CASL conditions
- **AND** 保存前验证 JSON 格式

---

### Requirement: Advanced Config Panel

高级配置 SHALL 通过右侧面板提供，仅在用户点击"高级配置"按钮时显示。

#### Scenario: Panel opens on demand
- **WHEN** 用户点击资源节点的"高级配置"按钮
- **THEN** 右侧显示高级配置面板
- **AND** 面板标题显示当前资源名称
- **AND** 左侧树保持可见和可操作

#### Scenario: Panel shows current config
- **WHEN** 高级配置面板打开
- **THEN** 显示当前资源的条件预设选择
- **AND** 如果有自定义条件，显示 JSON 内容
- **AND** 预设选择器反映当前配置

#### Scenario: Apply saves to local state
- **WHEN** 用户在高级配置面板点击"应用"
- **THEN** 配置保存到本地状态
- **AND** 面板关闭
- **AND** 资源节点显示"已配置高级规则"标记

#### Scenario: Cancel discards changes
- **WHEN** 用户在高级配置面板点击"取消"或关闭按钮
- **THEN** 配置变更被丢弃
- **AND** 面板关闭
- **AND** 恢复到打开面板前的状态

---

### Requirement: Permission Save Flow

权限配置 SHALL 使用页面级保存策略，用户可以配置多个资源后一次性保存。

#### Scenario: Dirty state tracking
- **WHEN** 用户修改任意权限配置
- **THEN** 页面显示"有未保存的更改"提示
- **AND** 保存按钮变为可用状态

#### Scenario: Save all changes
- **WHEN** 用户点击"保存"按钮
- **THEN** 调用 `savePermissions` API 保存所有变更
- **AND** 成功后显示 Toast 提示
- **AND** 清除"未保存的更改"状态

#### Scenario: Reset discards all changes
- **WHEN** 用户点击"重置"按钮
- **THEN** 所有配置恢复到上次保存的状态
- **AND** 清除"未保存的更改"状态

#### Scenario: Leave page confirmation
- **WHEN** 用户有未保存的更改并尝试离开页面
- **THEN** 显示确认对话框
- **AND** 用户可以选择保存、放弃或取消离开

---

### Requirement: API Endpoints for Permission Config

后端 SHALL 提供权限配置所需的 API 端点。

#### Scenario: Get resource tree
- **WHEN** 前端调用 `permissionConfig.getResourceTree`
- **THEN** 返回层级结构的资源列表
- **AND** 每个节点包含 subject, label, icon, actions, children
- **AND** 目录节点的 isDirectory = true

#### Scenario: Get resource detail
- **WHEN** 前端调用 `permissionConfig.getResourceDetail({ subject })`
- **THEN** 返回资源的详细配置元数据
- **AND** 包含 actionGroups, presets, fields 信息

#### Scenario: Get role permissions
- **WHEN** 前端调用 `permissionConfig.getRolePermissions({ roleId })`
- **THEN** 返回该角色在所有资源上的权限配置
- **AND** 按 subject 分组返回 actions, preset, conditions

#### Scenario: Save permissions
- **WHEN** 前端调用 `permissionConfig.savePermissions({ roleId, permissions })`
- **THEN** 删除该角色的旧权限记录
- **AND** 插入新的权限记录
- **AND** 清除权限缓存（L1 + L2）
- **AND** 返回 success: true

---

## MODIFIED Requirements

### Requirement: Role Detail Page Tabs

角色详情页 SHALL 包含三个 Tab：General、Permissions（原 Data Permissions）、Menu Visibility。

#### Scenario: Permissions tab shows new UI
- **WHEN** 用户切换到 Permissions Tab
- **THEN** 显示新的 ResourcePermissionTree + AdvancedConfigPanel 布局
- **AND** 原有的 RuleEditor 组件被替换

---

## Related Capabilities

- `permission-kernel`: 权限检查和缓存机制
- `admin-ui-host`: Admin UI 框架和布局

## Cross-References

- See `permission-kernel/spec.md` for permission caching requirements
- See `admin-ui-host/spec.md` for UI component standards
