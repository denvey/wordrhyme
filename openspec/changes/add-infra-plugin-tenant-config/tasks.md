## 1. Manifest & Schema

- [x] 1.1 在 `packages/plugin/src/manifest.ts` 新增顶层 `infrastructure` 字段（与 `dataRetention`、`notifications` 同级）：`{ tenantOverride: boolean, riskLevel: 'high' | 'medium' | 'low', sensitiveFields: string[] }`
- [x] 1.2 在 `settingsTargetSchema` 中补齐 `visibility: z.enum(['platform', 'all']).optional()`，与运行时类型保持一致

## 2. Backend — infraPolicy Core Router

- [x] 2.1 新增 `InfraPolicySchema`（Zod）：`{ mode: z.enum(['unified', 'allow_override', 'require_tenant']) }`
- [x] 2.2 新增 Core tRPC router `infraPolicy`（`apps/server/src/trpc/routers/infra-policy.ts`）
- [x] 2.3 实现 `infraPolicy.get(pluginId)` — 平台管理员读取完整 policy（需 `manage:Settings` 权限 + 平台组织校验）
- [x] 2.4 实现 `infraPolicy.set(pluginId, { mode })` — 平台管理员设置策略（同上权限校验）
- [x] 2.5 实现 `infraPolicy.getVisibility(pluginId)` — 租户安全端点，仅返回 `{ mode, hasCustomConfig }`
- [x] 2.6 实现 `infraPolicy.batchGetVisibility(pluginIds[])` — 批量获取，避免 N+1 请求
- [x] 2.7 注册 `infraPolicy` router 到 `apps/server/src/trpc/index.ts`

## 3. Backend — Policy Enforcement & Config Resolution

- [x] 3.1 修改 `settings.capability.ts` — 对 infrastructure 插件的 `set/get/delete` 全路径前置 `infra.policy` 校验
- [x] 3.2 新增 `resolveInfraConfig(pluginId, organizationId)` 工具函数 — 根据 policy.mode 解析有效配置
- [x] 3.3 敏感字段掩码逻辑 — 读取 manifest `infrastructure.sensitiveFields`，对 `plugin_global` 配置 JSON 内指定字段用 `********` 替代后返回给租户

## 4. S3 Plugin Migration

- [x] 4.1 S3 manifest.json 新增顶层 `infrastructure: { tenantOverride: true, riskLevel: "high", sensitiveFields: ["secretAccessKey"] }`
- [x] 4.2 S3 server router 迁移：旧 `instances` 单键 → 新 `infra.policy` + `infra.config` 三键
- [x] 4.3 S3 `secretAccessKey` 存储时传入 `encrypted: true`
- [x] 4.4 编写迁移脚本：将旧 `instances` 数据转换为 `infra.config` 格式
- [x] 4.5 S3 admin `index.tsx` 更新 `visibility: 'all'`（不再硬编码 `'platform'`，由 policy 控制）

## 5. Frontend — OverridableSettingsContainer

- [x] 5.1 创建 `apps/admin/src/components/settings/OverridableSettingsContainer.tsx`
  - Props: `pluginId`, `riskLevel`, `children: (ctx: { mode, isEditable }) => ReactNode`
  - 内部调用 `trpc.infraPolicy.getVisibility` 获取租户可见状态
  - 渲染状态横幅 + 切换按钮
- [x] 5.2 创建 Hook `useInfraPolicy(pluginId)` — 封装策略查询和状态管理（同时提供 Hook 和 Container 两种消费方式）
- [x] 5.3 高风险确认弹窗 — `riskLevel: 'high'` 时切换自定义需二次确认
- [x] 5.4 添加 i18n 翻译资源（banner 文案、确认弹窗文案等多语言支持）

## 6. Frontend — Settings Page Integration

- [x] 6.1 修改 `Settings.tsx` — 调用 `trpc.infraPolicy.batchGetVisibility` 一次性获取所有 infrastructure 插件的可见性（替代逐个请求）
- [x] 6.2 对 infrastructure 插件加入动态 policy 过滤（在静态 visibility 过滤之后），加载中显示 Skeleton 占位
- [x] 6.3 Infrastructure 插件 Tab 内容用 `OverridableSettingsContainer` 包装
- [x] 6.4 平台管理员视角 — 在 infrastructure 插件 Tab 底部渲染"租户策略"区块（三个 Radio 按钮，调用 `trpc.infraPolicy.set`）

## 7. Testing & Validation

- [x] 7.1 后端测试：infraPolicy router 权限（平台可读写，租户仅可调 getVisibility/batchGetVisibility）
- [x] 7.2 后端测试：tenant settings.set/get/delete 全路径被 policy 阻止
- [x] 7.3 后端测试：resolveInfraConfig 三种 mode 的解析结果
- [x] 7.4 后端测试：敏感字段掩码（依据 manifest sensitiveFields，租户只看到 `********`）
- [x] 7.5 后端测试：policy 从 allow_override 切到 unified 后，租户数据保留但 resolveInfraConfig 不返回
- [x] 7.6 前端测试：OverridableSettingsContainer 三种状态渲染 + 加载态
- [x] 7.7 前端测试：Settings 页面 batchGetVisibility 过滤逻辑
- [x] 7.8 E2E 测试：平台配置 S3 → 设置 allow_override → 租户看到 Tab → 切换自定义 → 保存生效
