# Constraint Set: OAuth Social Login

**Change ID:** `add-oauth-social-login`
**Research Completed:** 2025-02-06

---

## Hard Constraints (Non-Negotiable)

### HC-1: Identity Belongs to Core
**Source:** `CORE_DOMAIN_CONTRACT.md` Section 1.1
**Constraint:** User / Identity / Session 属于 Core 职责，不可完全插件化
**Impact:** OAuth 认证必须在 Core `auth.ts` 中配置，不能作为独立插件

### HC-2: Core is Final Authority
**Source:** `SYSTEM_INVARIANTS.md` Section 1.1
**Constraint:** Core 是身份认证的最终权威
**Impact:** 所有认证逻辑集中在 `betterAuth()` 配置中

### HC-3: Better-Auth Initialization Time Configuration
**Source:** Better-Auth Documentation
**Constraint:** `socialProviders` 必须在 `betterAuth()` 初始化时配置，不支持运行时动态添加
**Impact:**
- 启用/禁用 Provider 需要服务重启
- Settings 变更后需触发 rolling reload

### HC-4: No Duplicate Dependencies
**Source:** User Decision (2025-02-06)
**Constraint:** 不使用 `better-auth-ui` 库，避免引入 15+ Radix peer dependencies
**Impact:** 手写登录页 UI，参考 better-auth-ui 布局

---

## Soft Constraints (User Preferences)

### SC-1: Admin Settings UI Control
**Source:** User Requirement
**Constraint:** 通过 Admin 后台 UI 配置 OAuth Provider 的启用/禁用
**Implementation:**
- Phase 1: 环境变量配置
- Phase 2: Settings 系统存储

### SC-2: Account Auto-Linking
**Source:** User Requirement
**Constraint:** 相同邮箱的 Email 账户与 OAuth 账户自动合并
**Implementation:** Better-Auth 原生支持，配置 `trustEmail: true`

### SC-3: First Phase Providers
**Source:** User Requirement
**Constraint:** 第一阶段实现 Google + GitHub + Apple
**Implementation:** 全部使用 Better-Auth 内置支持，无需额外包

---

## Architecture Constraints

### AC-1: Use Existing @wordrhyme/ui
**Source:** Codebase Analysis
**Constraint:** 使用现有 `@wordrhyme/ui` 中的 shadcn 组件
**Available Components:** Button, Card, Separator, Input, Label, etc.

### AC-2: OAuth Callback URL Pattern
**Source:** Better-Auth Convention
**Constraint:** 回调 URL 格式为 `{baseURL}/api/auth/callback/{provider}`
**Example:** `http://localhost:3000/api/auth/callback/google`

### AC-3: Environment Variables
**Source:** Better-Auth Configuration
**Constraint:** Provider 凭证通过环境变量配置
**Variables:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`

---

## Technical Constraints

### TC-1: Better-Auth Native Support
**Source:** Better-Auth Package Analysis
**Constraint:** Google, GitHub, Apple 均为 Better-Auth 内置支持，无需安装额外包
**Verification:** `npm info better-auth` 确认包含 socialProviders 支持

### TC-2: Client-Side signIn.social API
**Source:** Better-Auth React Client
**Constraint:** 使用 `authClient.signIn.social({ provider: 'google' })` 发起 OAuth 流程
**File:** `apps/admin/src/lib/auth-client.ts` 需要导出此方法

### TC-3: Lucide Icons Available
**Source:** Package.json Analysis
**Constraint:** `lucide-react` 已安装 (^0.469.0)，但不包含 OAuth Provider 图标
**Solution:** 使用 SVG 内联图标（参考 better-auth-ui provider-icons.tsx）

---

## Security Constraints

### SEC-1: Client Secret Protection
**Source:** Security Best Practice
**Constraint:** Client Secret 不能暴露在前端代码或日志中
**Implementation:**
- 仅存储在服务端环境变量
- 日志使用 masked 输出

### SEC-2: Email Verification Before Linking
**Source:** Account Takeover Prevention
**Constraint:** 考虑是否要求 OAuth 账户邮箱已验证才允许关联
**Default:** Better-Auth 使用 `trustEmail: true` 时信任 OAuth Provider 的邮箱验证

### SEC-3: Callback URL Whitelist
**Source:** OAuth Security
**Constraint:** Google Console / GitHub OAuth App 需配置正确的回调 URL 白名单
**Documentation Needed:** 需要提供 Setup Guide

---

## Out of Scope Constraints

### OOS-1: No WeChat in Phase 1
**Reason:** 需要额外包和开放平台申请
**Future:** 通过 WordRhyme 插件架构实现

### OOS-2: No Generic OIDC
**Reason:** 需要通用配置 UI
**Future:** 待 AUTH_EXTENSION_CONTRACT 定义后实现

### OOS-3: No Multi-Tenant OAuth
**Reason:** 每个 Organization 使用独立 OAuth 凭证过于复杂
**Scope:** 当前使用系统级配置

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/auth/auth.ts` | Modify | 添加 `socialProviders` 配置 |
| `apps/admin/src/pages/Login.tsx` | Modify | 添加 OAuth 按钮 |
| `apps/admin/src/lib/auth-client.ts` | Modify | 导出 `signIn` 用于社交登录 |
| `apps/admin/src/components/icons/` | Create | 添加 OAuth Provider SVG 图标 |
| `.env.example` | Modify | 添加 OAuth 环境变量模板 |

---

## Success Verification Checklist

- [ ] Google 登录端到端成功
- [ ] GitHub 登录端到端成功
- [ ] Apple 登录端到端成功
- [ ] 相同邮箱账户自动关联
- [ ] 登录页显示正确的 Provider 按钮
- [ ] 未配置的 Provider 不显示按钮
- [ ] 错误状态正确处理

---

## Confirmed Decisions (2025-02-06)

### CD-1: Trust Provider for Email Verification
**Decision:** 信任 OAuth Provider 的邮箱验证状态
**Implementation:** `trustEmail: true` for all providers
**Rationale:** Google/GitHub/Apple 均有可靠的邮箱验证机制

### CD-2: Allow Multiple Provider Linking
**Decision:** 允许同一账户关联多个 OAuth Provider
**Implementation:** Better-Auth 默认支持，无需额外配置
**Example:** 用户可以同时用 Google + GitHub 登录同一账户

### CD-3: Reject Login Without Email
**Decision:** 如果 OAuth 不返回邮箱，拒绝登录并显示友好提示
**Implementation:** 在 auth.ts 添加 profile 校验
**Message:** "请授权邮箱访问权限或使用邮箱密码登录"

---

## PBT Properties (Invariants)

### PBT-1: Idempotency
**Invariant:** 重复 OAuth 登录（相同 provider + providerUserId + email）不会创建重复用户
**Falsification:** 生成 N 次相同登录请求，断言用户数不增加且 userId 不变

### PBT-2: Round-trip Consistency
**Invariant:** OAuth 登录 → Session 创建 → User 数据与 Provider 身份一致
**Falsification:** 登录后获取 session user，对比 email/providerUserId/linkedProviders

### PBT-3: Multi-Provider Linking
**Invariant:** 相同 email 的不同 Provider 关联到同一账户
**Falsification:** 用两个 Provider（相同 email）登录，断言只有一个 userId 且有两个 linked providers

### PBT-4: Email Isolation
**Invariant:** 不同 email 的 Provider 永远不会合并账户
**Falsification:** 用两个 Provider（不同 email）登录，断言创建两个独立 userId

### PBT-5: No Email Rejection
**Invariant:** 无 email 的 OAuth 响应被拒绝，不创建任何用户/session
**Falsification:** 发送无 email 的 mock provider 响应，断言返回错误且数据库无变化

### PBT-6: Session Expiration
**Invariant:** 过期 session 无法访问受保护资源
**Falsification:** 创建 session，推进时间超过 TTL，断言访问被拒绝

### PBT-7: Error Handling
**Invariant:** 所有错误路径返回结构化错误，不产生 500 或崩溃
**Falsification:** 发送畸形 provider payload、无效 token、网络故障，断言返回友好错误
