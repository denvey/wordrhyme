## 1. Core 重写（Infra Policy v2）

- [x] 1.1 重写 `infra-policy-guard.ts`：新增 `getModuleFromPath()`、`getProcedureNameFromPath()`、`BYPASS_PROCEDURES`
- [x] 1.2 重写 `infra-policy-guard.ts`：新增 `policyModeCache` Map、`loadAllPolicyModes()`、`refreshPolicyMode()`、`getMode()`（同步内存读取）
- [x] 1.3 重写 `infra-policy-guard.ts`：新增 `initInfraPolicySettings()`（async，启动时加载策略）、`assertSettingsReady()`、`hasCustomData()`
- [x] 1.4 重写 `infra-policy-guard.ts`：更新 `enforceInfraPolicy()` 和 `resolveEffectiveOrg()` 移除 resolver 依赖
- [x] 1.5 重写 `infra-policy-guard.ts`：删除 `resolvers` Map、`subjectToModule` Map、`InfraPolicyResolver` 接口、注册函数
- [x] 1.6 更新 `trpc.ts`：middleware 改为 `({ meta, ctx, next, path })` 签名，用 `path` 提取模块，用 `meta?.permission?.action` 读 action
- [x] 1.7 更新 `trpc.ts`：middleware 新增元操作豁免（`BYPASS_PROCEDURES`）
- [x] 1.8 更新 `trpc.ts`：更新导入（`getModuleFromPath` 替代 `getModuleForSubject`）

## 2. Settings 初始化 + 生命周期刷新

- [x] 2.1 更新 `trpc.module.ts`：注入 SettingsService + PluginManager，调用 `await initInfraPolicySettings()`
- [x] 2.2 ~~更新 `trpc.module.ts`：监听 `plugin:installed/uninstalled` 事件~~ → Rolling Reload 重启后 `initInfraPolicySettings()` 自动重新加载全量策略，无需 EventEmitter
- [x] 2.3 ~~更新 `trpc.module.ts`：监听 Settings `change` 事件~~ → 在 `currency-policy.ts` 和 `infra-policy.ts` 的 `set` endpoint 中直接调用 `refreshPolicyMode()`

## 3. Currency 模块清理

- [x] 3.1 清理 `currency.ts`：移除 `registerInfraPolicyResolver` 和 `registerInfraSubjects` 调用
- [x] 3.2 清理 `currency.ts`：移除 `resolveEffectiveOrgId` 导入和手动调用，改用 middleware 自动 Context Swap
- [x] 3.3 更新 `currency.ts` switchToCustom：添加 `setCustomizationFlag('currency', orgId, true)`
- [x] 3.4 更新 `currency.ts` resetToPlatform：添加 `setCustomizationFlag('currency', orgId, false)`
- [x] 3.5 简化公开路由（getCurrencies、rates.list/get/history、convert）：移除手动 resolveEffectiveOrgId，`getCurrencyPolicyMode` → `getMode('currency')`

## 4. 通用 InfraPolicy Router 扩展

- [x] 4.1 更新 `infra-policy.ts` switchToCustom/resetToPlatform：添加 Settings 标记设置 + v2 key 写入 + `refreshPolicyMode()`
- [x] 4.2 新增 `infraPolicy.listConfigurableModules` endpoint

## 5. Settings Key 迁移

- [x] 5.1 编写迁移脚本：旧 Settings key → 新 key 格式（`20260302000000_infra_policy_v2_keys.ts`）
- [x] 5.2 Currency 特殊迁移：`hasAnyCurrencies()` DB 查询 → `infra.customized.currency` Settings 标记（合并到 5.1 迁移中）
- [x] 5.3 编写一致性校验脚本：`verify-infra-policy-v2.ts`

## 6. 统一启动扫描 + RBAC 自动推导

- [x] 6.1 实现 `buildPermissionRegistry()`：启动时扫描 `_def.procedures`，全部导出到注册表（含 Name），Admin UI 可见
- [x] 6.2 实现 `inferAction()`：procedure name → CRUD action 映射（list→read, create→create...），非标准 mutation 返回 `null`（不自动推导）
- [x] 6.3 改进 `createCrudRouter`：从 table name 自动推导 subject（`tableNameToSubject`），打标到 `_def.meta.__crudSubject`
- [x] 6.4 实现 `getSubjectTitle()`：标准 `t(subject)` 翻译 → humanize 回退（与项目 i18n 保持一致）
- [x] 6.5 实现 Default Policy 处理：待配置（pending）的 procedure 按 audit/deny/allow 策略处理
- [x] 6.6 更新 permission middleware：从启动注册表查 permission，不再完全依赖 `meta.permission`
- [x] 6.7 拆分 `RESOURCE_DEFINITIONS` 职责：subject 注册移交启动扫描，仅保留菜单结构定义
- [x] 6.8 支持 `meta.permission.group`：开发者可设置默认权限分组，同组 procedure 共享权限
- [x] 6.9 实现管理员权限配置 API：`rbac.override.{path}` 和 `billing.override.{path}` Settings 读写
- [x] 6.10 启动报告：列出所有未声明权限的 mutation，提醒开发者/管理员配置
- [x] 6.11 实现权限模板机制：`PermissionTemplate` 定义 + 匹配规则 + 模板 CRUD API
- [x] 6.12 实现模板应用 API：管理员一键应用模板，将模板规则写入 Settings

## 7. i18n 资源翻译

- [x] 7.1 Core subject title：从 `RESOURCE_DEFINITIONS` 提取 title，作为标准翻译写入 `i18n_messages` 表（common namespace）
- [x] 7.2 插件 subject title：插件开发者在 `plugin.json` 的 `i18n.messages` 中声明，安装时自动写入，卸载时自动清理

## 8. 验证

- [x] 8.1 验证 Context Swap：allow_override + 有自定义 → 租户数据
- [x] 8.2 验证 Context Swap：allow_override + 无自定义 → 平台数据
- [x] 8.3 验证 Context Swap：unified → 平台数据
- [x] 8.4 验证 WRITE guard：unified + 租户 → 阻断
- [x] 8.5 验证 WRITE guard：allow_override + 无自定义 → 阻断
- [x] 8.6 验证 switchToCustom：元操作豁免，不被 guard 拦截
- [x] 8.7 验证 Settings 未初始化：fail-fast 抛错
- [x] 8.8 验证公开路由自动 Context Swap
- [x] 8.9 验证策略模式内存缓存：启动加载、插件安装刷新、Admin 修改刷新
- [x] 8.10 验证 RBAC 自动推导：createCrudRouter 生成的 procedure 自动具备 permission
- [x] 8.11 验证 RBAC Default Policy：待配置的 procedure 按 audit 模式记日志
- [x] 8.12 验证 subject title：标准 t(subject) 翻译 → humanize 回退链路
- [x] 8.13 验证非标准 mutation 导出：未声明的 mutation 在注册表中可见，Admin UI 显示 Name
- [x] 8.14 验证权限分组：meta.permission.group 的 procedure 共享分组权限
- [x] 8.15 验证管理员配权限：管理员通过 Settings 为 procedure 配置权限后生效
- [x] 8.16 验证管理员修改分组：管理员修改分组后，procedure 权限跟随变化
- [x] 8.17 验证启动报告：未声明权限的 mutation 在启动日志中列出
- [x] 8.18 验证权限模板：应用模板后，匹配规则的 procedure 自动获得权限
- [x] 8.19 验证管理员覆盖模板：管理员配置优先于模板默认
