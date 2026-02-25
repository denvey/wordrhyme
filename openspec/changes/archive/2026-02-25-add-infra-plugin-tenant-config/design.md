## Context

基础设施插件（S3、OAuth、SMTP、Stripe 等）在多租户环境中面临配置权限传递问题：平台安装插件后，需要精细控制租户能否自行配置。本设计定义统一的"Platform Policy + Tenant Override"模型。

## Goals

- 所有基础设施插件使用同一套配置权限模型，不按插件类型硬编码分类
- 平台管理员通过 UI 控制每个插件的租户配置策略
- 租户侧根据策略动态显示/隐藏配置入口，提供一致的继承/自定义切换体验
- 敏感凭证绝不泄露给租户（切换自定义时表单空白，不预填平台密钥）

## Non-Goals

- 租户自主安装插件（v0.x 不支持）
- 按租户粒度授权（`allowedTenants` 白名单延后）
- 审批流程（租户申请 → 平台批准）
- 自动配置迁移（旧 `instances` key → 新三键模型需手动迁移脚本）

## Decisions

### Decision 1: 统一配置模型，不按插件类型分类

**选择**：所有基础设施插件使用同一个 `infrastructure.tenantOverride` 声明 + 运行时 `infra.policy` 策略。

**替代方案**：
- A. 按插件分 `overridable` / `per_tenant` / `shared` 固定类型 → 否决，因为 OAuth 既可以平台统一也可以租户各配，不应在代码中固化
- B. 每个插件自己实现策略逻辑 → 否决，违反 DRY，无法统一 UI

**理由**：同一个 OAuth 插件在不同平台可能是完全不同的策略。区别在于平台管理员的运行时选择，不在插件代码。

### Decision 2: 三键数据模型

**选择**：`infra.policy`（控制面）+ `infra.config`@plugin_global（平台默认）+ `infra.config`@plugin_tenant（租户覆盖）

**替代方案**：
- 沿用 `instances` 单键 → 否决，策略与数据混杂，无法独立控制

**理由**：控制面与数据面分离，policy 决定数据面的可见性和可写性。

### Decision 3: Policy 使用 discriminated enum

**选择**：使用 `mode: 'unified' | 'allow_override' | 'require_tenant'` 枚举代替两个布尔字段。

| mode | 租户体验 |
|------|---------|
| `unified` | Tab 不可见，透明使用平台配置 |
| `allow_override` | 默认继承，可切换自定义 |
| `require_tenant` | 必须自行配置，否则功能不可用 |

**替代方案**：
- 两个布尔 `allowOverride` + `requireTenantConfig` → 否决，允许无效组合（`true + true`），增加验证负担

**理由**：枚举天然互斥，无需额外验证，三个 Radio 按钮 1:1 映射。

### Decision 4: 前端双重过滤

**选择**：静态 `visibility` 过滤 + 动态 `infra.policy` 过滤

- `visibility: 'platform'`：硬编码仅平台可见（无 infrastructure 声明的纯平台插件）
- `visibility: 'all'` + `tenantOverride: true`：由运行时 policy 决定租户可见性

**理由**：`visibility` 处理非基础设施插件的简单场景，`policy` 处理基础设施插件的动态场景。

### Decision 5: 安全边界

- 租户切换"自定义"时，表单空白，绝不预填平台凭证
- 继承模式下，敏感字段显示 `********`，非敏感字段显示实际值供参考
- **`sensitiveFields` 声明**：插件在 manifest `infrastructure.sensitiveFields` 中声明哪些 JSON 字段名是敏感的（如 `['secretAccessKey', 'password']`），后端据此对 `infra.config` 做部分脱敏
- 高风险插件（`riskLevel: 'high'`）切换自定义时弹二次确认
- 敏感字段强制加密存储（`encrypted: true`）

### Decision 6: 双层 API 权限分离

**选择**：新建独立的 Core tRPC router `infraPolicy`，提供两层端点：

1. **平台管理员端点**（需 `manage:Settings` 权限 + 平台组织身份）：
   - `infraPolicy.get(pluginId)` — 返回完整 policy 对象
   - `infraPolicy.set(pluginId, { mode })` — 设置策略
2. **租户安全端点**（任何已认证用户）：
   - `infraPolicy.getVisibility(pluginId)` — 仅返回 `{ mode: 'unified'|'allow_override'|'require_tenant', hasCustomConfig: boolean }`，不暴露 policy 内部详情
   - `infraPolicy.batchGetVisibility(pluginIds[])` — 批量获取，前端 Settings 页一次调用获取所有插件状态

**替代方案**：
- 挂在现有 `plugin.*` router 下 → 否决，`plugin.*` 是 core 插件管理路由（安装/卸载），语义不符
- 租户直接读 `infra.policy` → 否决，暴露控制面内部结构

**理由**：拆分避免权限矛盾；`getVisibility` 返回最小化派生状态，租户无法推断 policy 配置细节。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| S3 数据迁移（旧 `instances` → 新三键） | 提供迁移脚本，双读单写过渡期 |
| Policy API 被绕过（租户直接调 settings.set） | 后端 `settings.set/get/delete` 全路径前置 policy 校验 |
| 租户自定义 S3 后数据泄露 | riskLevel 提示 + 二次确认 + 审计日志 |
| OverridableSettingsContainer 组件复杂度 | 组件只处理状态切换，表单内容由各插件自己渲染 |

## Migration Plan

1. 新增 manifest `infrastructure` 字段（向后兼容，可选字段）
2. 新增 `infra.policy` / `infra.config` 存储结构
3. S3 插件迁移：旧 `instances` → 新 `infra.config`（提供迁移脚本）
4. 前端新增 `OverridableSettingsContainer` + policy 过滤
5. 平台 Settings 页新增"租户策略"区块

## Open Questions

- 是否需要 `allowedTenants` 白名单（仅允许特定租户覆盖）？→ 延后到有实际需求时

## Resolved Questions

- **Q: 租户覆盖后如果平台切回"unified"，租户已有配置如何处理？**
  A: 保留 `plugin_tenant` 数据但不生效。`resolveInfraConfig` 在 `mode=unified` 时跳过 tenant 数据。平台重新切到 `allow_override` 时，租户配置自动恢复生效。
- **Q: 插件卸载时租户 override 数据怎么清理？**
  A: 遵循 manifest `dataRetention.onUninstall` 声明。默认 `delete` 时清理所有 scope（含 `plugin_tenant`）。

