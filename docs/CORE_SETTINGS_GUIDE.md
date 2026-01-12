# 核心配置系统 (Core Settings System): 用户指南

## 简介

**核心配置系统**是 WordRhyme 平台配置管理的神经中枢。它超越了简单的环境变量，提供了一种动态、分层且安全的方式来管理应用程序的行为——而且无需重启服务器。

无论您是管理全局默认值的平台超级管理员，还是自定义组织外观的租户管理员，该系统都能为您提供所需的工具。

## 核心概念

### 1. 层级与继承 (Hierarchy & Inheritance)
配置不是扁平的，而是分层流动的。这允许通过强大的默认值实现细粒度的覆盖。

*   **全局层级 (Global Level)**: 由平台超级管理员定义。这些是整个安装实例的默认设置。
    *   *示例：系统默认语言为英语。*
*   **租户层级 (Tenant Level)**: 由租户管理员定义。这些会覆盖特定组织的全局设置。
    *   *示例：组织 A 将语言覆盖为西班牙语。*
*   **插件配置 (Plugin Settings)**: 插件拥有自己隔离的命名空间，但遵循相同的“全局到租户”继承模式。
    *   *示例：“通讯录插件”有一个默认的 API Key（全局），特定租户可以用自己的 Key 进行覆盖。*

### 2. 安全与加密 (Security & Encryption)
并非所有设置都是公开的。系统原生支持敏感数据的处理。
*   **加密存储**: 密钥（如 API Key、SMTP 密码）在保存到数据库之前，会使用 AES-256-GCM 进行加密。
*   **脱敏显示**: 在界面中，这些值永远不会以明文显示。它们显示为 `••••••••`。您可以覆盖它们，但无法读取现有的原始密钥。

### 3. 功能开关 (Feature Flags)
控制新功能的可见性，支持渐进式发布。
*   **全局开关**: 为所有人开启或关闭某项功能。
*   **租户覆盖**: 仅为特定的“早期访问”组织开启“Beta”功能，同时对其他所有人保持关闭。

---

## 使用场景

### 系统管理
*   **基础设施配置**: 更新 SMTP 服务器详情、S3 存储桶凭证或全局超时时间，无需重新部署。
*   **安全策略**: 设置全局密码强度要求或会话超时时间。

### 多租户定制
*   **品牌化 (White-labeling)**: 允许租户上传自己的 Logo、设置主色调或更改默认主题。
*   **功能分级**: 仅为“企业版”计划的租户启用高级功能（通过 Feature Flags）。

---

## 使用管理界面 (Admin UI)

作为超级管理员，您可以直接从仪表盘管理平台的配置。

### 访问设置
在左侧主菜单中导航至 **Settings** > **System Settings**。

### 管理配置

#### 设置界面
界面分为两个主要标签页：
1.  **Global Settings (全局设置)**: 适用于整个实例的配置。
2.  **Organization Settings (组织设置)**: 针对当前活动组织的特定覆盖配置。

#### 创建新配置
1.  点击 **"Add Setting"** 按钮。
2.  **Key (键名)**: 输入点号分隔的键名（例如：`email.smtp.host`, `theme.colors.primary`）。
3.  **Value Type (值类型)**: 选择合适的类型：
    *   `String`: 文本值。
    *   `Number`: 整数或浮点数。
    *   `Boolean`: True/False 开关。
    *   `JSON`: 复杂对象（会自动验证 JSON 格式）。
4.  **Encrypted (加密)**: 对于敏感数据（密码、密钥），选择 "Yes"。
5.  **Value (值)**: 输入配置值。
6.  **Description (描述)**: 可选但推荐。解释此设置的作用。

#### 编辑与更新
*   点击任意设置行右侧的 **菜单**（三个点），然后选择 **Edit**。
*   **关于加密值**: 值输入框将为空或显示掩码。输入新值将覆盖旧密钥。留空则保持现有密钥不变。

#### 删除
*   在菜单中点击 **Delete** 以移除配置。
    *   *注意：如果您删除了一个“租户覆盖”配置，该设置将回退到“全局默认值”。*

### 搜索
使用顶部的搜索栏通过 Key 或 Description 过滤设置。当管理数十个配置项时，这非常有用。

---

## 功能开关管理 (Feature Flags)

### 访问入口
在左侧主菜单中导航至 **Settings** > **Feature Flags**。

### 权限说明

| 操作 | 所需权限 | 可操作角色 |
|------|---------|-----------|
| 查看 Feature Flags | `organization:update` | 组织管理员、平台管理员 |
| 创建/编辑/删除 Flags | `platform-admin` | 平台超级管理员 |
| 设置/移除租户覆盖 | `organization:update` | 组织管理员、平台管理员 |

### 管理全局开关 (Super Admin)

#### 创建新 Flag
1. 点击 **"Create Flag"** 按钮（仅超级管理员可见）。
2. **Key (标识符)**: 输入唯一标识符（例如：`new-dashboard`, `beta-editor`）。
   - 创建后**不可修改**，请谨慎命名。
3. **Name (名称)**: 用户友好的显示名称。
4. **Description (描述)**: 解释此开关控制什么功能。
5. **Enabled (启用)**: 全局开启/关闭状态。
6. **Rollout Percentage (灰度比例)**: 0-100%，控制多少用户看到此功能。

#### 编辑/删除
- 点击行右侧菜单中的 **Edit Flag** 或 **Delete Flag**。
- ⚠️ 删除 Flag 会同时删除所有租户覆盖配置。

### 设置租户覆盖 (Org Admin)

即使您不是超级管理员，也可以为**自己的组织**设置 Feature Flag 覆盖：

1. 点击目标 Flag 行右侧的菜单。
2. 选择 **"Set Override"**。
3. 配置覆盖值：
   - **Override Enabled**: 为您的组织单独开启/关闭。
   - **Override Rollout**: 为您的组织设置独立的灰度比例。
4. 点击 **"Set Override"** 保存。

#### 移除覆盖
- 在菜单中选择 **"Remove Override"**，您的组织将恢复使用全局配置。

### 状态显示说明

| 标识 | 含义 |
|------|------|
| 🟢 **Enabled** | 功能已开启 |
| ⚪ **Disabled** | 功能已关闭 |
| 📊 **50% rollout** | 灰度发布中 |
| 🏢 **Override** | 当前组织有自定义覆盖配置 |

---

## 权限模型总览

### System Settings 权限

| 功能 | Super Admin | Org Admin |
|------|-------------|-----------|
| 查看菜单 | ✅ | ✅ |
| 访问 Global 标签页 | ✅ | ❌ |
| 创建/编辑/删除全局配置 | ✅ | ❌ |
| 访问 Tenant 标签页 | ✅ | ✅ |
| 创建/编辑/删除租户配置 | ✅ | ✅ |

### Feature Flags 权限

| 功能 | Super Admin | Org Admin |
|------|-------------|-----------|
| 查看菜单 | ✅ | ✅ |
| 查看所有 Flags | ✅ | ✅ |
| 创建新 Flag | ✅ | ❌ |
| 编辑 Flag | ✅ | ❌ |
| 删除 Flag | ✅ | ❌ |
| 设置租户覆盖 | ✅ | ✅ |
| 移除租户覆盖 | ✅ | ✅ |

---

## 最佳实践

### 命名规范

**Settings Key 命名**:
```
{domain}.{subdomain}.{property}

示例:
- email.smtp.host
- email.smtp.port
- theme.colors.primary
- security.session.timeout
```

**Feature Flag Key 命名**:
```
{feature-name}
{component}-{feature}

示例:
- new-dashboard
- editor-v2
- beta-analytics
- experimental-ai-assistant
```

### 安全建议

1. **敏感数据必须加密**：API Key、密码、Token 等务必选择 "Encrypted"。
2. **最小权限原则**：仅授予用户所需的最小权限级别。
3. **审计跟踪**：所有配置变更会自动记录在审计日志中。

### 灰度发布流程

1. **创建 Flag**：`enabled: false`, `rollout: 0%`
2. **内部测试**：为测试租户设置 Override `enabled: true`
3. **小范围发布**：全局 `enabled: true`, `rollout: 10%`
4. **逐步扩大**：`rollout: 25%` → `50%` → `100%`
5. **全量发布**：确认稳定后 `rollout: 100%`
6. **清理**：移除 Flag，将功能代码变为默认行为

---

## 故障排查

### 配置未生效？

1. **检查缓存**：配置变更后最多需要 1 分钟生效（内存缓存 TTL）。
2. **检查层级**：租户配置会覆盖全局配置，确认查看的是正确层级。
3. **检查权限**：确认您有权限访问该配置。

### Feature Flag 不工作？

1. **检查 Override**：您的组织可能有覆盖配置。
2. **检查 Rollout**：灰度比例可能导致部分用户看不到功能。
3. **检查 Conditions**：Flag 可能有高级条件限制。

---

## API 参考

详细的服务端 API 和插件 API 文档，请参阅：
- [Core Settings System 技术文档](./CORE_SETTINGS_SYSTEM.md)
