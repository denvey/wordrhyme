## Context

Infra Policy v1 已实施（2026-02-26），使用 `meta.permission.subject` → module 映射 + 手动注册 resolver 的方式实现 Context Swap。经多模型评估（Codex + Gemini 交叉验证），v1 的 subject 依赖有多项限制。

完整设计文档见：`.claude/plans/infra-policy-auto.md`

### 现有资产

| 组件 | 文件 | 状态 |
|------|------|------|
| InfraPolicyGuard | `trpc/infra-policy-guard.ts` | v1 已实现，需重写 |
| Global Middleware | `trpc/trpc.ts` | v1 已挂载，需更新 |
| Currency Router | `trpc/routers/currency.ts` | v1 注册代码需清理 |
| InfraPolicy Router | `trpc/routers/infra-policy.ts` | 需扩展 |
| SettingsService | `settings/settings.service.ts` | 已就位 |

### 约束

- 遵循 CLAUDE.md 中基础设施策略读写分离原则
- tRPC middleware 签名：`({ meta, ctx, next, path, type })` — `path` 和 `meta` 是独立参数
- Settings 有 ~300s TTL 缓存，`set()` 主动失效 + Redis Pub/Sub
- Context Swap 安全性证明不变（v2 只改识别和查询方式）

## Goals

1. 零注册：废弃 `registerInfraPolicyResolver()` + `registerInfraSubjects()`，改用路径提取 + Settings 查询
2. 统一 Core/插件：同一个 `getModuleFromPath()` 处理两种路由结构
3. 公开路由自动覆盖：不依赖 `permission.subject`，publicProcedure 也能自动 Context Swap
4. 解决已知 bug（switchToCustom 鸡蛋悖论、Settings 未初始化静默失效）

## Non-Goals

- Overlay/Merge 模型（v3 设计）
- Billing middleware 集成（独立提案）
- 性能优化（已配置模块白名单缓存）

## Decisions

### 1. 路径提取策略

**决策**：从 tRPC 请求 `path` 参数提取模块名，插件用 `pluginApis.{pluginId}` 前缀，Core 用第一个 segment。

**替代方案**：
- 继续用 `permission.subject` — 公开路由无法覆盖，开发者忘写不报错
- 用 `_def.procedures` 反射 — 过于依赖 tRPC 内部实现

### 2. 策略模式启动加载

**决策**：`getMode()` 启动时从 Settings 加载到内存 Map，运行时同步读取。刷新时机：启动、插件安装/卸载、Admin 修改策略。`hasCustomData()` 仍查 Settings（租户级，带 ~300s 缓存）。

**替代方案**：
- 每次请求查 Settings — 不必要的 I/O，策略模式极少变化
- 保留 resolver 接口 — 需手动注册，Core/插件不统一
- DB 直查 — 没有缓存，性能差

### 3. switchToCustom 豁免

**决策**：通过 `BYPASS_PROCEDURES` 白名单（`switchToCustom`、`resetToPlatform`）豁免 guard。

**替代方案**：
- 移到独立 router（`infraPolicy.switchToCustom`） — 需参数化各模块的复制逻辑，复杂度高
- 在 guard 内特判 subject — v2 不再读 subject

### 4. Settings 初始化保障

**决策**：`assertSettingsReady()` fail-fast，未初始化时抛明确错误。

**替代方案**：
- 静默返回 `require_tenant` — guard 不生效，安全隐患

### 5. 非标准 mutation 权限策略

**决策**：全部导出到 Permission 注册表（显示 procedure Name），管理员在 Admin UI 配置权限，未配置走 Default Policy。开发者可通过 `meta.permissionGroup` 设置默认分组，管理员可修改分组。开发者未声明权限的 procedure 标记为 `source: 'pending'`（Admin UI 显示"⚠️ 待配置"），而非"未声明"，引导管理员主动配置而非产生安全焦虑。

**替代方案**：
- `manage` fallback — CASL 通配符 action，将"待配置"变为"已授权"，绕过 Default Policy 治理机制
- 强制显式声明 — 开发者负担大，每个非标准 mutation 都需要写 `meta.permission`
- 不导出 + 纯 Default Policy — 管理员无法在 UI 中看到和配置这些 procedure

**选择理由**：兼顾安全性（Default Policy 兜底）、开发者体验（分组减少配置量）和管理员体验（Admin UI 可见可配）。经多模型分析确认 `manage` fallback 不可行。

### 6. 三系统统一治理模型

**决策**：Infra Policy、RBAC、Billing 共享模块级默认配置，各子系统独立存储（扁平 key），**在各自的 Admin 页面独立配置**（Infra Policy→平台设置、RBAC→角色管理（已有）、Billing→计费管理）。

**统一优先级**：过程级管理员配置 > 过程级开发者声明 > 模块级默认 > Default Policy

**存储模型（Plan C 混合模式）**：

| Settings Key | 含义 | 示例 |
|------|------|------|
| `infra.policy.{m}` | Infra Policy 模式 | `allow_override` |
| `rbac.module.{m}.subject` | 默认 RBAC subject | `Currency` |
| `billing.module.{m}.subject` | 默认 Billing subject | `core.currency` |

各子系统独立读写，在各自 Admin 页面独立展示和配置。RBAC 和 Billing 统一使用 `subject` 术语（共享 `meta.subject`，分叉时用 `meta.permission.subject` / `meta.billing.subject`）。

**配置模板**：可选的批量初始化工具（`UnifiedModuleTemplate`），用于首次部署或标准化环境。不是日常配置入口。模板 apply 为逐条 `settings.set()` 写入（无跨 key 事务），通过 dry-run 预览 + 幂等写入 + report 记录缓解原子性风险。

**Admin UI actions 分组**：11 个 auto-crud actions 按语义分为三组展示：基础（list/get/create/update/delete）、批量（createMany/updateMany/deleteMany/upsert）、数据（export/import）。默认只展开基础组，高危操作用橙色标识。

**替代方案**：
- 三个系统完全独立、无模块级共享概念 — 配置量大，无继承能力
- 仅模块级不支持过程级覆盖 — 无法处理特殊 procedure（如 free 计费、特殊权限）
- 聚合 key `module.{m}` — 跨子系统写入耦合，部分更新需 read-modify-write，已弃用
- 统一 Admin UI 单页配置 — 三个系统职责/操作者/心智模型不同，强行聚合造成认知混乱

**选择理由**：三个系统结构同构（管理员配置 > 开发者声明 > 默认策略），运行时共享统一优先级链。扁平 key 保持子系统解耦，各系统在独立页面配置，职责清晰。模板作为可选批量初始化工具保留。

### 7. 租户级 Capability 覆盖（Reverse Pointer 模型）

**决策**：Capability 采用反向指针模型（路由 → Capability 标签），SettingsService cascade（tenant → global → default）天然实现优先级链，`resolveCapability()` 只需单次 `settings.get('tenant', ...)` 调用。RBAC 和 Billing 都允许 tenant scope 覆盖，安全保障在写入层：
- RBAC：租户可覆盖任意路径（内部分权）
- Billing：租户仅能覆盖自己安装的插件路径（写入层校验归属），平台能力路径拒绝写入

**替代方案**：
- 仅允许全局覆盖 — 租户无法自治内部分权，无法配自装插件的计费
- Billing 完全禁止 tenant scope — 租户自装插件无法定义计费映射
- 完全禁止覆盖 — 灵活性不足，无法满足 B2B2X 场景

**选择理由**：RBAC 和 Billing 统一使用 `{dimension}.override.{path}` 的 tenant/global scope，SettingsService 内部 cascade 使 `resolveCapability()` 无需手动分步查 tenant + global，单次调用即完成优先级链。安全由写入层校验路径归属保障，而非在读取层做 dimension 分支。

### 8. Sub-Billing（B2B2X 二次售卖）

**决策**：租户可从平台分配的 Capabilities 和自装插件的 Capabilities 创建 Sub-Plan 售卖给子用户/分销商。Billing 网关按 Capability 来源分流：平台提供的能力（基础设施 + 平台插件）走双层网关，租户自装插件走单层网关。v2 仅支持两级递归。Usage 复用单表 + scope 列。

**插件安装模型**：不区分来源（市场 or 本地上传），统一 Cache-Miss 模式获取 Manifest（先查市场预扫描，没有则实时扫描）。"平台插件"与"租户插件"的区别是安装者 scope（platform / tenant），不是来源。

**路由扫描两阶段**：启动扫描 Core routes + 从 DB 加载已存 Manifest（不重新扫描代码）。

**约束**：
- 不可超卖：平台能力需在分配集合内，租户插件能力需已安装
- 平台收费独立：平台 → 租户计费不受 Sub-Billing 影响
- 计量单表：`usage_records` 新增 `billingScope`、`billingOwnerId`、`consumerId` 字段

**替代方案**：
- 不支持 Sub-Billing — 无法满足代发平台、分销体系等 B2B2X 场景
- 无限递归层级 — 复杂度爆炸，v3 再考虑
- 租户共享平台 Usage — 计量混乱，审计困难

**选择理由**：两级递归覆盖绝大多数 B2B2X 场景（平台→租户→子用户），配合 `validateSubPlan` 防超卖和独立计量实现安全隔离。

### 9. 四层防超卖 + Drift Detection

**决策**：用四层保护替代单一 `validateSubPlan` 校验：

| 层级 | 机制 | 触发时机 | 职责 |
|------|------|----------|------|
| L1 | UI 过滤 `getAvailableCapabilities()` | 创建/编辑 Sub-Plan | 只展示可用能力（主要防线） |
| L2 | API 校验 `validateSubPlan()` | API 调用 | 纵深防御（防绕过 UI） |
| L3 | Drift Detection | 平台变更/启动 | 事后检测不一致 |
| L4 | Runtime 网关 | 每次请求 | 最终兜底 |

Drift Detection 两种模式：
- **事件驱动**：`onTenantCapabilitiesChanged`（平台降级）、`onPluginUninstalled`（插件卸载）→ 扫描受影响 Sub-Plan 和 Override → 通知租户
- **启动全量扫描**：`startupDriftScan` 产出 `GovernanceDriftReport`（orphanOverrides + invalidSubPlanEntries + summary）

**替代方案**：
- 仅 `validateSubPlan` 创建时校验 — 无法覆盖事后漂移（平台降级、插件卸载）
- 定时轮询检测 — 延迟高，资源浪费
- 实时阻断（漂移时自动禁用 Sub-Plan）— 破坏性太大，v2 仅告警

**选择理由**：UI 过滤覆盖 99% 正常场景；Drift Detection 覆盖事后变更（用户无法在 UI 上"选到不存在的能力"，但平台可以事后移除）；Runtime 网关作为最终安全网。

### 10. 性能优化（预计算 + 异步写入）

**决策**：三项核心优化：

1. **P0：预计算 Capability 映射** — 写时（Admin 配置、插件安装）计算 `resolvedCapabilityCache`，运行时 `resolveCapability()` 纯内存读取，零 Settings I/O
2. **P0：Usage 异步写入** — 请求线程推队列（`usageWriteQueue`），后台 Worker 批量刷盘（1s 或 100 条），不阻塞响应
3. **P1：tenantPluginCache LRU** — 限制 max 1000 活跃租户（10min TTL），O(active tenants) 替代 O(all tenants) 内存

优化后热路径：`resolveCapability()` 1 次 Map.get → `billingGateway()` 1 次 cache check → Usage 推队列 → 返回

**替代方案**：
- 每次请求查 Settings 解析 Capability — Billing 热路径 3+ 次 Settings I/O（~300s 缓存也有 miss）
- Usage 同步写入 — 增加 P99 延迟
- 全量 tenantPluginCache 不设上限 — 内存随租户数线性增长

**选择理由**：Capability 映射极少变化（配置级别），预计算 ROI 最高。Usage 写入可容忍 ~1s 延迟（非实时计费场景）。LRU 在 SaaS 场景中活跃租户 << 总租户。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| hasCustomData 仍需每请求查 Settings | ~300s TTL 缓存；getMode 已改为内存同步读取 |
| 迁移期间数据不一致 | 新旧 key 并存回退 + 一致性校验脚本 |
| BYPASS_PROCEDURES 被滥用 | 白名单写死在代码中，需 code review；元操作仍受 RBAC 保护 |
| Admin UI 失去模块发现 | `listConfigurableModules` endpoint |
| 权限 subject 配置碎片化 | 开发者提供默认 subject，管理员修改存 Settings，启动时合并 |
| 待配置 mutation 过多时管理员配置负担 | 启动报告提醒 + subject 机制降低配置粒度 + actions 分组（基础/批量/数据）减少认知负荷 |
| 租户 Billing 映射安全 | 写入层校验路径归属：租户只能写自己安装的插件路径的 billing override；平台能力路径拒绝写入 |
| Sub-Plan 超卖 | 四层防护：UI 过滤（主要）→ API 校验 → Drift Detection → Runtime 网关 |
| 平台降级租户 Capabilities 后 Sub-Plan 不一致 | 事件驱动 Drift Detection（`onTenantCapabilitiesChanged`）+ 启动全量扫描 |
| 市场 Manifest 缓存与实际插件代码不一致 | 版本号绑定 Manifest；本地上传始终实时扫描 |
| 预计算缓存与 Settings 不同步 | 写入 Settings 后同步触发 `recomputeCapabilities()`；启动时全量重建 |
| Usage 异步写入崩溃丢失 | 内存队列 + 进程退出 flush；v2 接受 ~1s 窗口丢失风险 |
| 漂移检测扫描全量租户性能 | 仅启动时全量扫描；运行时事件驱动只扫受影响租户 |
| 模板 apply 批量写入无跨 key 事务 | dry-run 预览 + 幂等写入 + report 记录已写 key；未来 `setBatch()` 可改为原子操作 |

## Migration Plan

1. 重写 `infra-policy-guard.ts`（删旧增新，不影响其他文件）
2. 更新 `trpc.ts` middleware（原子替换）
3. 初始化 Settings 依赖（`trpc.module.ts`）
4. 运行迁移脚本（旧 Settings key → 新 key）
5. 清理 `currency.ts` 注册代码
6. 简化公开路由
7. 验证：一致性校验脚本确认迁移正确
8. 回滚方案：保留旧 key 一个版本周期

## Open Questions

1. ~~`listConfigurableModules` 应该用方案 A（Settings 扫描）还是方案 B（静态注册表）？~~ → 倾向方案 B：启动扫描已构建 permission registry，模块列表可直接从中提取
2. 是否需要在 middleware 中添加 response header `x-infra-effective-org` 供前端调试？
3. Sub-Billing 双层扣减是否需要在同一事务中完成？（当前设计为独立记录）
4. 平台降级租户 Capabilities 时，Drift Detection 除通知外是否需要自动降级 Sub-Plan？（v2 仅告警）
5. Usage 异步写入的 ~1s 丢失窗口是否需要 WAL 持久化保障？（v2 接受风险）
6. Billing override 写入层如何校验路径归属？需确认：按 `pluginApis.{pluginId}` 前缀匹配租户已安装插件列表，还是查 plugin installation 表？
7. ~~11 个 auto-crud actions（含 `deleteMany`、`export` 等）是否需要在 CASL 中预定义，还是作为动态自定义 action 处理？~~ → 已决定：新增 `AUTO_CRUD_ACTION_META` 元数据注册（含 group/label/description/risk），启动时与 PermissionRegistry 一同初始化，Admin UI 通过 API 获取 action 元数据用于分组展示
