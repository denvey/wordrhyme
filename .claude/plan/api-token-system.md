# API Token System 实施计划

**OpenSpec ID**: `core-api-token-system`
**创建日期**: 2026-01-13
**预计工作量**: 2 天

---

## 1. 概述

使用 Better Auth API Key 插件实现 API Token 系统，支持：
- Token CRUD 操作
- Scope 权限控制（与 PermissionKernel 集成）
- Token 过期管理
- 使用统计 (lastUsedAt)
- 前端管理 UI

---

## 2. 技术决策

| 决策项 | 方案 |
|--------|------|
| Token 存储 | Better Auth API Key 插件内置表 |
| 租户绑定 | `metadata.tenantId`（应用层校验） |
| Scope 格式 | `permissions.capabilities = ["resource:action:scope"]` |
| 权限校验 | API Key 验证 → PermissionKernel |
| 前端模式 | Flex List + 两阶段 Dialog |

---

## 3. 后端实施计划

### 3.1 Better Auth 配置变更

**文件**: `apps/server/src/auth/auth.ts`

```typescript
import { apiKey } from 'better-auth/plugins';

export const auth = betterAuth({
    // ... existing config
    plugins: [
        // ... existing plugins
        apiKey({
            // 自定义验证：确保 metadata.tenantId 存在
            // 启用内置 rate limiting
        }),
    ],
});
```

### 3.2 tRPC 路由设计

**文件**: `apps/server/src/trpc/routers/api-tokens.ts`

| 方法 | 输入 | 输出 | 权限 |
|------|------|------|------|
| `list` | `{}` | `ApiTokenSummary[]` | `core:api-tokens:read` |
| `get` | `{ id }` | `ApiTokenSummary` | `core:api-tokens:read` |
| `create` | `{ name?, capabilities[], expiresIn? }` | `{ id, key, ... }` | `core:api-tokens:manage` |
| `delete` | `{ id }` | `{ success }` | `core:api-tokens:manage` |

**ApiTokenSummary 类型**:
```typescript
interface ApiTokenSummary {
    id: string;
    name?: string;
    prefix: string;           // "tr_..."
    capabilities: string[];
    createdAt: Date;
    expiresAt?: Date;
    lastUsedAt?: Date;
    issuedBy?: string;
}
```

### 3.3 API Key 验证中间件

**文件**: `apps/server/src/auth/guards/api-key.guard.ts`

流程：
1. 从 `Authorization: Bearer <key>` 或 `X-API-Key` 提取 key
2. 调用 `auth.api.verifyApiKey({ key })`
3. 校验 `metadata.tenantId` 与请求 `X-Tenant-Id` 匹配
4. 构建 `PermissionContext` 并注入请求

### 3.4 AuthGuard 集成

**文件**: `apps/server/src/auth/guards/auth.guard.ts`

修改逻辑：
1. 优先尝试 Session 验证
2. 若无 Session，尝试 API Key 验证
3. 统一构建 principal 并注入 PermissionKernel

### 3.5 后端文件清单

| 操作 | 文件路径 |
|------|----------|
| 修改 | `apps/server/src/auth/auth.ts` |
| 新建 | `apps/server/src/auth/guards/api-key.guard.ts` |
| 修改 | `apps/server/src/auth/guards/auth.guard.ts` |
| 新建 | `apps/server/src/trpc/routers/api-tokens.ts` |
| 修改 | `apps/server/src/trpc/router.ts` |

---

## 4. 前端实施计划

### 4.1 组件结构

```
apps/admin/src/
├── components/
│   └── CopyButton.tsx          # 新建：复制按钮
├── pages/
│   └── ApiTokens.tsx           # 新建：主页面
│       ├── TokenList           # 内嵌：列表组件
│       ├── TokenListItem       # 内嵌：列表项
│       ├── CreateTokenDialog   # 内嵌：两阶段创建对话框
│       └── DeleteTokenDialog   # 内嵌：删除确认对话框
```

### 4.2 页面布局

```
┌─────────────────────────────────────────────┐
│  API Tokens                    [Create Token]│
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 🔑 Production API Key    tr_live_...4a2b │ │
│ │    Scopes: read:content, write:content   │ │
│ │    Created: 2026-01-10 | Last used: 1h   │ │
│ │                              [Delete] ⋮  │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔑 CI/CD Token           tr_live_...8f3c │ │
│ │    Scopes: read:content                  │ │
│ │    Expires: 2026-04-10 | Never used      │ │
│ │                              [Delete] ⋮  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 4.3 CreateTokenDialog 两阶段流程

**阶段 1: 配置**
- Name 输入框
- Expiration 下拉框 (30d / 90d / 1y / Never)
- Scopes 复选框组

**阶段 2: Reveal**
- 显示完整 Token（只此一次）
- CopyButton 复制功能
- 警告提示："请立即保存此 Token，关闭后将无法再次查看"

### 4.4 路由配置

**文件**: `apps/admin/src/App.tsx`

```typescript
import { ApiTokensPage } from './pages/ApiTokens';

// 在 Routes 中添加
<Route path="api-tokens" element={<ApiTokensPage />} />
```

### 4.5 导航菜单

**文件**: `apps/admin/src/hooks/useMenus.ts`

```typescript
{
    title: 'API Tokens',
    url: '/api-tokens',
    icon: KeyIcon,
}
```

### 4.6 前端文件清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `apps/admin/src/components/CopyButton.tsx` |
| 新建 | `apps/admin/src/pages/ApiTokens.tsx` |
| 修改 | `apps/admin/src/App.tsx` |
| 修改 | `apps/admin/src/hooks/useMenus.ts` |

---

## 5. 实施步骤

### Phase 1: 后端基础设施 (0.5 天)
1. [ ] 配置 Better Auth API Key 插件
2. [ ] 创建 API Key Guard
3. [ ] 修改 AuthGuard 支持双认证模式

### Phase 2: 后端 CRUD (0.5 天)
4. [ ] 创建 api-tokens.ts tRPC 路由
5. [ ] 注册路由到 router.ts
6. [ ] 添加权限定义 `core:api-tokens:*`

### Phase 3: 前端组件 (0.5 天)
7. [ ] 创建 CopyButton 组件
8. [ ] 创建 ApiTokensPage 页面
9. [ ] 实现 TokenList / TokenListItem

### Phase 4: 前端交互 (0.5 天)
10. [ ] 实现 CreateTokenDialog（两阶段）
11. [ ] 实现 DeleteTokenDialog
12. [ ] 配置路由和导航菜单

---

## 6. 扩展预留

| 功能 | 预留字段/接口 |
|------|--------------|
| Token 数量限制 | `metadata.maxTokensPerTenant` |
| Token 轮换 | `POST /api-tokens/:id/rotate` |
| 使用配额 | `metadata.usageQuota`, `remaining` |

---

## 7. 验收标准

- [ ] 用户可创建 API Token 并获取完整 key（仅一次）
- [ ] Token 列表按租户隔离
- [ ] Token 可设置过期时间
- [ ] Token 可选择 Scope 权限
- [ ] 使用 Token 调用 API 时记录 lastUsedAt
- [ ] Token 权限通过 PermissionKernel 校验
- [ ] 前端 UI 与现有 Admin 风格一致
