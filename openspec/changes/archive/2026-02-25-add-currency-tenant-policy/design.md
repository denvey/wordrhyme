## Context

货币系统是 WordRhyme 核心功能，当前实现是每个租户独立管理货币数据。基础设施插件（S3 存储、Email）已实现三级租户策略模型，但那是面向插件的（`plugin_global` / `plugin_tenant` scope）。货币作为核心功能需要类似模式但使用不同的存储机制。

**关键差异**：
- S3/Email 是插件，配置是单个 JSON 对象（存 Settings）
- 货币是核心功能，数据是表记录集合（`currencies` + `exchange_rates` 表）
- Policy 语义一致，但数据查询方式不同
- S3/Email 的 Settings Tab 适合简单配置表单；货币是 CRUD 密集型（831 行页面），独立页面体验更好

## Goals / Non-Goals

**Goals**:
- 平台管理员可统一配置所有租户的货币体系
- 三种模式语义与 infra policy 完全一致
- 货币管理保留独立页面，通过通用策略 banner 实现行为一致性
- 从 `OverridableSettingsContainer` 提取通用 `PolicyAwareBanner`，前端策略 UX 统一

**Non-Goals**:
- 不修改 `currencies` / `exchange_rates` 表 schema
- 不引入通用的菜单级 `settingCondition` 机制（YAGNI）
- 不改变前端 `CurrencySwitcher` / `CurrencyProvider` 的行为
- 不修改菜单系统（不隐藏菜单、不改 resource-definitions、不改菜单过滤逻辑）
- 不修改 Settings.tsx（不新增 Tab）

## Decisions

### Decision 1: Policy 存储在 Settings 系统（`global` scope）

```
Key:   core.currency.policy
Scope: global
Value: { mode: 'unified' | 'allow_override' | 'require_tenant' }
Default: { mode: 'unified' }
```

**理由**：货币是核心功能，不是插件，所以用 `global` scope 而非 `plugin_global`。与 i18n 的 `features.i18n.enabled` 一样存在 Settings 中。

**替代方案**：复用 `infraPolicyRouter` 直接管理 → 被拒绝，因为那是面向插件的，需要 pluginId 和 manifest 验证。

### Decision 2: 平台货币使用 `organizationId = 'platform'`

**理由**：`platform` 是真实的 organization 记录，`currencies` 表的 `organizationId` FK 约束天然支持，无需改 schema。

**替代方案**：用 `organizationId IS NULL` → 被拒绝，因为现有 schema 是 `NOT NULL`，改动大。

### Decision 3: 保留独立页面 + 页面内策略 Banner

货币管理保留侧边栏独立菜单和独立页面（`/settings/currencies`），不迁移到 Settings Tab。

**页面内策略感知**：
- `unified` → 只读列表 + banner "由平台统一管理" + 隐藏 CRUD 按钮
- `allow_override`（继承中） → 蓝色 banner "继承平台配置" + "切换自定义"按钮 + 只读列表
- `allow_override`（已自定义） → 黄色 banner "使用自定义配置" + "重置为平台"按钮 + 完整 CRUD
- `require_tenant` → 完整 CRUD（无 banner 或"需要配置"提示）
- 平台管理员 → 完整 CRUD + TenantPolicySection

**理由**：
- 货币是 CRUD 密集型功能（831 行页面），独立页面空间充足
- Settings Tab 适合简单配置表单（S3/Email 仅 5-10 字段），不适合承载完整列表管理
- 不改菜单系统 = 零菜单改动成本
- 通过共享 Banner 组件实现与 S3/Email 的**行为一致性**（相同的继承/覆盖语义），而非位置一致性

**替代方案**：迁移到 Settings Tab（方案 A）→ 被拒绝，因为：
1. Settings.tsx 已 786 行 + CurrenciesPage 831 行 = 维护噩梦
2. CRUD 表格在 Tab 空间内体验差
3. OverridableSettingsContainer 与 pluginId 强耦合，泛化成本高

### Decision 4: 后端 fallback 按 mode 分支查询

```
unified       → 直接查 platform 的货币
allow_override → 租户有数据用租户的，否则 fallback 到 platform
require_tenant → 只查租户的数据
```

**理由**：简单明确，无需复杂的 SQL（如 `DISTINCT ON`）。相比 i18n 的单次 `DISTINCT ON` 查询，这里的分支查询更清晰且性能差异可忽略。

### Decision 5: 管理端读取使用 mode-aware resolved 查询

当前管理端 `currencies.list/get` 使用 auto-CRUD 默认查询（ScopedDb 仅查当前组织）。在 `unified` 和 `allow_override`（未覆盖）模式下，租户本地无数据，auto-CRUD 返回空。

**方案**：覆盖 auto-CRUD 的 `list/get` middleware，用 `CurrencyService.getResolvedCurrencies()` 替代默认查询。返回结果附带 `source: 'platform' | 'tenant'` 标记，前端据此控制编辑/只读状态。

**替代方案**：新增独立的 resolved 读取端点 → 被拒绝，因为会导致管理 UI 需要感知两套读取 API。

### Decision 6: allow_override 模式下的所有权守卫

`allow_override` 模式下，租户可以看到 platform 继承的货币但不能直接修改。切换为自定义时（`switchToCustom`），系统批量复制 platform 数据到租户，后续修改仅操作租户自有数据。

```
继承中 → 所有 mutation 被拒绝（需先 switchToCustom）
已自定义 → mutation 只允许操作 organizationId = 当前租户 的记录
重置 → resetToPlatform 删除租户数据，回到继承状态
```

**理由**：与 `OverridableSettingsContainer` 的 "继承/自定义" 切换语义一致。避免部分覆盖导致的数据混乱。

### Decision 7: 提取通用 PolicyAwareBanner 组件

从 `OverridableSettingsContainer` 提取视觉部分为独立的 `PolicyAwareBanner` 组件，输入 `mode` / `hasCustomConfig` / `onSwitchToCustom` / `onResetToPlatform`，不依赖 `pluginId`。

**理由**：
- 货币页面需要相同的 banner UX，但不是 plugin 也不在 Settings Tab 中
- 解耦后 `OverridableSettingsContainer` 可内部复用 `PolicyAwareBanner`，保持 DRY
- 未来其他核心功能如需策略感知，可直接使用 `PolicyAwareBanner`

## Risks / Trade-offs

- **Risk**: 货币管理入口与 S3/Email 不在同一位置（前者侧边栏，后者 Settings Tab）
  - **Mitigation**: 通过共享 PolicyAwareBanner 保持行为一致性（相同的 banner 样式和交互语义）
- **Risk**: `allow_override` 模式下，租户部分覆盖时行为可能混淆
  - **Mitigation**: 租户要么完全继承，要么完全自定义（整体切换，不支持单条覆盖）

## Migration Plan

1. 为 `platform` 组织 seed 默认货币数据
2. 初始化 `core.currency.policy` = `{ mode: 'unified' }`（默认统一模式）
3. 保留 `default-org` 等租户的已有货币数据（标记为 dormant，unified 模式下忽略，切换到 allow_override/require_tenant 时可复用）

## Open Questions

无
