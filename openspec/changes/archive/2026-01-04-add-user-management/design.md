# Design: User Management with better-auth Plugins

## Context

WordRhyme 已集成 better-auth 进行身份验证，包括 email/password 登录和 organization 多租户支持。现需添加完整的用户管理功能。

**约束条件**：
- 必须符合现有 Permission Kernel 的 capability-based 授权模型
- 必须保持多租户隔离
- 必须与现有 better-auth 配置兼容

## Goals / Non-Goals

### Goals
- 实现两层用户管理能力：
  1. **Layer 1**: 租户内成员管理（organization 插件）
  2. **Layer 2**: 超级管理员操作（admin 插件）
- 提供统一的 Admin UI 用户管理界面
- 保持严格的租户隔离

### Non-Goals
- 跨租户用户管理（必须保持租户隔离）
- 批量用户导入/导出（可作为后续增强）
- 第三方 SSO 管理（当前仅 email/password）

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Admin UI                                │
│  ┌─────────────────────────┬─────────────────────────────┐  │
│  │   Layer 1 Features      │     Layer 2 Features        │  │
│  │   (All Org Admins)      │     (Super Admins Only)     │  │
│  │                         │                             │  │
│  │   • List Members        │     • Ban/Unban User        │  │
│  │   • Invite Member       │     • Impersonate User      │  │
│  │   • Remove Member       │     • Manage Sessions       │  │
│  │   • Update Member Role  │     • Set Global Role       │  │
│  │                         │     • Reset Password        │  │
│  │                         │     • Delete User           │  │
│  └─────────────────────────┴─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Backend                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Tenant Isolation Guard                  │    │
│  │   • Validate X-Tenant-Id header                     │    │
│  │   • Check target user belongs to current tenant     │    │
│  │   • Reject cross-tenant operations (403)            │    │
│  │   • Log violations to audit log                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│         ┌────────────────────┴────────────────────┐         │
│         ▼                                          ▼         │
│  ┌─────────────────┐                    ┌─────────────────┐ │
│  │  organization   │                    │     admin       │ │
│  │    plugin       │                    │    plugin       │ │
│  │                 │                    │                 │ │
│  │  Tenant-scoped  │                    │  Global APIs    │ │
│  │  APIs           │                    │  (need guard)   │ │
│  └─────────────────┘                    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Decisions

### Decision 1: 两层插件架构

**选择**: 同时使用 `organization` 和 `admin` 两个 better-auth 插件

| Layer | 插件 | 范围 | 用途 |
|-------|------|------|------|
| Layer 1 | `organization` | 租户内 | 成员管理（邀请、移除、改角色） |
| Layer 2 | `admin` | 全局（需校验） | 超级管理操作（ban、模拟、删除） |

**理由**:
- `organization` 插件原生支持租户隔离，API 自带 `organizationId` 参数
- `admin` 插件提供高级管理功能（ban、impersonate），但需要额外租户校验
- 两者配合使用，覆盖所有用户管理场景

### Decision 2: 角色分层

**选择**: 区分「组织角色」和「全局角色」

```
┌─────────────────────────────────────────────────┐
│              Global Role (admin plugin)          │
│   • super-admin: 可执行所有 admin.* 操作         │
│   • admin: 可执行部分 admin.* 操作               │
│   • user: 无 admin 权限                          │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│         Organization Role (per tenant)           │
│   • owner: 组织所有者，可执行所有 org 操作        │
│   • admin: 组织管理员，可管理成员                 │
│   • member: 普通成员                             │
└─────────────────────────────────────────────────┘
```

**权限矩阵**:

| 操作 | member | org-admin | org-owner | global-admin |
|------|--------|-----------|-----------|--------------|
| 查看成员列表 | ✅ | ✅ | ✅ | ✅ |
| 邀请成员 | ❌ | ✅ | ✅ | ✅ |
| 移除成员 | ❌ | ✅ | ✅ | ✅ |
| 更改成员角色 | ❌ | ✅ | ✅ | ✅ |
| 禁用用户 | ❌ | ❌ | ❌ | ✅ |
| 模拟用户 | ❌ | ❌ | ❌ | ✅ |
| 删除用户 | ❌ | ❌ | ❌ | ✅ |

### Decision 3: 租户隔离策略

**选择**: 双重隔离机制 + 调用者身份验证

**术语映射**:
| better-auth | WordRhyme 核心架构 |
|-------------|-------------------|
| `organizationId` | `tenantId` |
| `organization.listMembers()` | 租户内用户列表 |
| `member` table | 租户成员关系 |

**Layer 1 隔离**（organization 插件原生支持）:
- `organization.listMembers({ organizationId })` 自动只返回该租户成员
- `organization.inviteMember()` 自动关联当前租户
- 无需额外校验

**Layer 2 隔离**（需要后端 Guard Chain）:

```
Request → SuperAdminGuard → TenantContextGuard → TargetUserGuard → Controller
              │                    │                    │
              ▼                    ▼                    ▼
         验证全局角色         验证调用者租户权限      验证目标用户属于租户
```

#### Guard 1: SuperAdminGuard（RBAC 强制执行）

**解决**: Codex 指出的 "Server-side RBAC for Layer 2 isn't specified"

```typescript
@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 检查全局角色
    const hasAdminRole = user.role === 'admin' || user.role === 'super-admin';
    const isInAdminList = this.configService.get('adminUserIds')?.includes(user.id);

    if (!hasAdminRole && !isInAdminList) {
      await this.auditService.log({
        type: 'unauthorized_admin_access',
        userId: user.id,
        action: request.path,
        tenantId: request.headers['x-tenant-id'],
        success: false,
      });
      throw new ForbiddenException('Super admin role required');
    }

    return true;
  }
}
```

#### Guard 2: TenantContextGuard（调用者租户权限验证）

**解决**: Codex 指出的 "Guard doesn't bind X-Tenant-Id to the acting admin's allowed tenants"

```typescript
@Injectable()
export class TenantContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];
    const caller = request.user;

    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header required');
    }

    // 关键：验证调用者是否有权操作该租户
    // 选项 A: 调用者必须是该租户的成员/管理员
    const callerMembership = await this.membershipService.getMembership(
      caller.id,
      tenantId
    );

    if (!callerMembership) {
      // 选项 B: 允许 platform-admin 跨租户操作（需要特殊角色）
      const isPlatformAdmin = caller.role === 'platform-admin';
      if (!isPlatformAdmin) {
        await this.auditService.log({
          type: 'tenant_context_violation',
          adminId: caller.id,
          attemptedTenantId: tenantId,
          action: request.path,
          success: false,
        });
        throw new ForbiddenException('Admin is not a member of this tenant');
      }
    }

    // 绑定租户上下文到请求
    request.tenantContext = {
      tenantId,
      callerMembership,
      callerRole: callerMembership?.role || 'platform-admin',
    };

    return true;
  }
}
```

#### Guard 3: TargetUserGuard（目标用户租户验证）

**解决**: Codex 指出的 "TenantGuard only reads request.body.userId"

```typescript
@Injectable()
export class TargetUserGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantContext.tenantId;

    // 从多个来源提取 targetUserId
    const targetUserId = this.extractTargetUserId(request);

    if (!targetUserId) {
      // 某些操作可能不需要 targetUserId（如 listUsers）
      return true;
    }

    // 验证目标用户是该租户的成员
    const targetMembership = await this.membershipService.getMembership(
      targetUserId,
      tenantId
    );

    // pending 邀请不算成员，不能被 ban/delete
    if (!targetMembership || targetMembership.status === 'pending') {
      await this.auditService.log({
        type: 'cross_tenant_operation',
        adminId: request.user.id,
        targetUserId,
        tenantId,
        action: request.path,
        success: false,
        reason: targetMembership ? 'pending_member' : 'not_member',
      });
      throw new ForbiddenException('Target user is not a member of this tenant');
    }

    request.targetUser = { id: targetUserId, membership: targetMembership };
    return true;
  }

  private extractTargetUserId(request: Request): string | null {
    // 1. Path params: /admin/users/:userId/ban
    if (request.params?.userId) {
      return request.params.userId;
    }
    // 2. Query params: /admin/sessions?userId=xxx
    if (request.query?.userId) {
      return request.query.userId as string;
    }
    // 3. Body: { userId: 'xxx' }
    if (request.body?.userId) {
      return request.body.userId;
    }
    // 4. Body: { targetUserId: 'xxx' } (alternative naming)
    if (request.body?.targetUserId) {
      return request.body.targetUserId;
    }
    return null;
  }
}
```

#### 完整 Guard Chain 应用

```typescript
// 应用到所有 Layer 2 端点
@Controller('admin')
@UseGuards(AuthGuard, SuperAdminGuard, TenantContextGuard, TargetUserGuard)
export class AdminController {

  @Post('users/:userId/ban')
  async banUser(@Param('userId') userId: string, @Body() dto: BanUserDto) {
    // Guards 已验证：调用者是 super-admin，有权操作该租户，目标用户属于该租户
    return this.adminService.banUser(userId, dto);
  }

  @Post('users/:userId/impersonate')
  async impersonateUser(@Param('userId') userId: string) {
    return this.adminService.impersonateUser(userId);
  }

  @Get('users/:userId/sessions')
  async listUserSessions(@Param('userId') userId: string) {
    return this.adminService.listUserSessions(userId);
  }

  @Delete('users/:userId')
  async removeUser(@Param('userId') userId: string) {
    return this.adminService.removeUser(userId);
  }
}
```

### Decision 4: UI 页面结构

**选择**: 统一入口，按权限显示功能

```
Admin UI
├── Dashboard
├── Members  ← 统一入口
│   ├── 成员列表（organization.listMembers）
│   │   ├── 搜索、筛选、分页
│   │   └── 显示角色、状态（banned/active）
│   │
│   ├── 成员详情（点击进入）
│   │   ├── 基本信息
│   │   ├── 组织角色管理（Layer 1）
│   │   ├── 会话列表（Layer 2，仅 super-admin）
│   │   └── 操作按钮（按权限显示）
│   │
│   ├── 邀请成员（Layer 1）
│   │
│   └── [Super Admin Only]
│       ├── 禁用/解禁（Layer 2）
│       ├── 模拟用户（Layer 2）
│       └── 删除用户（Layer 2）
│
├── Plugins
└── Settings
```

### Decision 5: API 使用策略

| 场景 | 使用 API | 说明 |
|------|----------|------|
| 列出租户成员 | `organization.listMembers()` | ✅ 原生租户隔离 |
| 邀请成员 | `organization.inviteMember()` | ✅ 原生租户隔离 |
| 移除成员 | `organization.removeMember()` | ✅ 用户仍存在，仅移出租户 |
| 更改成员角色 | `organization.updateMemberRole()` | ✅ 租户内角色 |
| 禁用用户 | `admin.banUser()` | ⚠️ 需要 TenantGuard |
| 解禁用户 | `admin.unbanUser()` | ⚠️ 需要 TenantGuard |
| 模拟用户 | `admin.impersonateUser()` | ⚠️ 需要 TenantGuard |
| 查看会话 | `admin.listUserSessions()` | ⚠️ 需要 TenantGuard |
| 撤销会话 | `admin.revokeUserSessions()` | ⚠️ 需要 TenantGuard |
| 删除用户 | `admin.removeUser()` | ⚠️ 需要 TenantGuard |

### Decision 6: Ban/Delete 跨租户语义

**解决**: Codex 指出的 "Ban/delete are global while the guard enforces tenant membership"

**问题**: better-auth 的 `admin.banUser()` 是全局 ban，会影响用户在所有租户的访问。但我们的 Guard 只验证用户属于当前租户。

**选择**: 采用「租户级 Ban」语义，而非全局 Ban

```
┌─────────────────────────────────────────────────────────────┐
│                    Ban 语义对比                              │
├─────────────────────────────────────────────────────────────┤
│  全局 Ban (better-auth 默认)                                 │
│  • 用户被 ban 后无法登录任何租户                              │
│  • 不适合多租户 SaaS 场景                                    │
├─────────────────────────────────────────────────────────────┤
│  租户级 Ban (WordRhyme 实现)                                 │
│  • 用户被 ban 后仅无法访问该租户                              │
│  • 其他租户不受影响                                          │
│  • 通过 member.status = 'banned' 实现                       │
└─────────────────────────────────────────────────────────────┘
```

**实现方案**:

```typescript
// 不直接调用 admin.banUser()，而是更新 membership 状态
@Injectable()
export class TenantBanService {
  async banUserInTenant(userId: string, tenantId: string, dto: BanDto) {
    // 更新 membership 状态为 banned
    await this.membershipService.updateStatus(userId, tenantId, {
      status: 'banned',
      banReason: dto.reason,
      banExpires: dto.expiresIn ? new Date(Date.now() + dto.expiresIn * 1000) : null,
    });

    // 撤销该用户在该租户的所有会话
    await this.sessionService.revokeSessionsForTenant(userId, tenantId);

    // 审计日志
    await this.auditService.log({
      type: 'user_banned',
      adminId: dto.adminId,
      targetUserId: userId,
      tenantId,
      reason: dto.reason,
      expiresAt: dto.expiresIn,
      success: true,
    });
  }

  async unbanUserInTenant(userId: string, tenantId: string, adminId: string) {
    await this.membershipService.updateStatus(userId, tenantId, {
      status: 'active',
      banReason: null,
      banExpires: null,
    });

    await this.auditService.log({
      type: 'user_unbanned',
      adminId,
      targetUserId: userId,
      tenantId,
      success: true,
    });
  }
}
```

**Delete 语义**:

| 操作 | 范围 | 说明 |
|------|------|------|
| `organization.removeMember()` | 租户级 | 仅移出租户，用户账号保留 |
| `admin.removeUser()` | 全局 | 完全删除用户（需 platform-admin） |

**决策**: 普通 super-admin 只能执行 `removeMember()`，`removeUser()` 仅限 platform-admin。

---

### Decision 7: 完整审计日志设计

**解决**: Codex 指出的 "should emit success/failure audit logs, not just cross-tenant violations"

**审计日志结构**:

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;

  // 操作信息
  action: AuditAction;
  success: boolean;
  failureReason?: string;

  // 参与者
  adminId: string;
  adminRole: string;
  targetUserId?: string;

  // 租户上下文
  tenantId: string;

  // 操作详情
  details: Record<string, unknown>;

  // 请求元数据
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

type AuditAction =
  // Layer 1
  | 'member.invite'
  | 'member.remove'
  | 'member.role_update'
  // Layer 2
  | 'user.ban'
  | 'user.unban'
  | 'user.impersonate_start'
  | 'user.impersonate_stop'
  | 'user.session_revoke'
  | 'user.session_revoke_all'
  | 'user.password_reset'
  | 'user.role_update'
  | 'user.delete'
  // 安全事件
  | 'security.cross_tenant_attempt'
  | 'security.unauthorized_admin_access'
  | 'security.rate_limit_exceeded';
```

**审计日志记录点**:

```typescript
// 装饰器方式自动记录
@Audited('user.ban')
@UseGuards(AuthGuard, SuperAdminGuard, TenantContextGuard, TargetUserGuard)
@Post('users/:userId/ban')
async banUser(
  @Param('userId') userId: string,
  @Body() dto: BanUserDto,
  @Req() req: Request,
) {
  // 业务逻辑...
}

// Audited 装饰器实现
function Audited(action: AuditAction) {
  return function (target: any, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const req = args.find(a => a.tenantContext); // 从参数中找 request
      const startTime = Date.now();

      try {
        const result = await original.apply(this, args);

        await this.auditService.log({
          action,
          success: true,
          adminId: req.user.id,
          adminRole: req.user.role,
          targetUserId: req.targetUser?.id,
          tenantId: req.tenantContext.tenantId,
          details: { duration: Date.now() - startTime },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'],
        });

        return result;
      } catch (error) {
        await this.auditService.log({
          action,
          success: false,
          failureReason: error.message,
          adminId: req.user?.id,
          targetUserId: req.targetUser?.id,
          tenantId: req.tenantContext?.tenantId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'],
        });
        throw error;
      }
    };
  };
}
```

**Rate Limiting**:

```typescript
// 敏感操作限流
@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly limits: Record<string, { max: number; window: number }> = {
    'user.ban': { max: 10, window: 60 },        // 每分钟最多 ban 10 人
    'user.impersonate': { max: 5, window: 300 }, // 每 5 分钟最多模拟 5 次
    'user.delete': { max: 3, window: 300 },      // 每 5 分钟最多删除 3 人
    'user.password_reset': { max: 10, window: 60 },
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const action = Reflect.getMetadata('audit:action', context.getHandler());
    const limit = this.limits[action];

    if (!limit) return true;

    const key = `rate:${request.user.id}:${action}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, limit.window);
    }

    if (count > limit.max) {
      await this.auditService.log({
        action: 'security.rate_limit_exceeded',
        adminId: request.user.id,
        tenantId: request.tenantContext.tenantId,
        details: { attemptedAction: action, count },
        success: false,
      });
      throw new TooManyRequestsException('Rate limit exceeded');
    }

    return true;
  }
}
```

---

## Risks / Trade-offs

### Risk 1: admin 插件全局性
- **问题**: `admin.*` API 默认全局操作，无租户概念
- **缓解**: Guard Chain 强制校验，无法绕过；Ban 使用租户级语义

### Risk 2: 角色同步
- **问题**: 组织角色和全局角色是独立的，可能造成混淆
- **缓解**: UI 明确区分两种角色，文档说明差异

### Risk 3: 用户模拟安全
- **问题**: 模拟功能可能被滥用
- **缓解**:
  - 仅 super-admin 可用
  - 默认禁止模拟其他 admin
  - 会话 1 小时过期
  - 审计日志记录
  - Rate limiting (每 5 分钟最多 5 次)

### Risk 4: 成员 vs 用户概念
- **问题**: `organization.removeMember()` 不删除用户，仅移出租户
- **缓解**: UI 明确区分「移除成员」和「删除用户」操作；`removeUser` 仅限 platform-admin

### Risk 5: 多租户用户的全局操作
- **问题**: 用户可能属于多个租户，setGlobalRole 等操作影响所有租户
- **缓解**: setGlobalRole 仅限 platform-admin；普通 super-admin 只能操作租户级角色

---

## Migration Plan

### Phase 1: 服务端集成
1. 添加 `admin` 插件到 auth 配置
2. 运行数据库迁移
3. 创建 `TenantGuard` 中间件
4. 为所有 `admin.*` 端点添加 TenantGuard

### Phase 2: 客户端更新
1. 添加 `adminClient` 插件
2. 添加 `organizationClient` 插件（如未添加）
3. 导出相关 hooks

### Phase 3: UI 实现 - Layer 1
1. 成员列表页面
2. 邀请成员功能
3. 移除成员功能
4. 更改成员角色功能

### Phase 4: UI 实现 - Layer 2
1. 禁用/解禁用户功能
2. 用户模拟功能
3. 会话管理功能
4. 删除用户功能

### Phase 5: 权限与安全
1. 按角色条件渲染 UI
2. 添加权限不足提示
3. 审计日志集成

---

## Open Questions (已解决)

### Q1: TenantGuard 是否应该验证调用者是 X-Tenant-Id 的成员？
**答案**: **是的，必须验证**。

TenantContextGuard 现在会验证：
1. 调用者是该租户的成员/管理员（常规 super-admin）
2. 或者调用者是 platform-admin（可跨租户操作）

普通 super-admin 不能伪造 X-Tenant-Id 头来操作其他租户。

### Q2: setGlobalRole 和其他全局操作如何处理？
**答案**: **区分操作权限级别**。

| 操作 | 范围 | 需要角色 | X-Tenant-Id |
|------|------|----------|-------------|
| banUser (租户级) | 租户内 | super-admin | 必需 |
| removeMember | 租户内 | super-admin | 必需 |
| setGlobalRole | 全局 | platform-admin | 忽略 |
| removeUser | 全局 | platform-admin | 忽略 |

**角色层级**:
```
platform-admin > super-admin > admin > member
       │              │
       │              └── 只能操作自己所属租户
       └── 可跨租户操作，可执行全局操作
```

### Q3: 多租户用户被操作时如何处理？
**答案**: **按操作范围区分**。

- **租户级操作**（ban/unban via membership）: 只影响当前租户
- **全局操作**（setGlobalRole/removeUser）: 影响所有租户，需 platform-admin

### Q4: pending 邀请是否算 isMember？
**答案**: **不算**。

TargetUserGuard 明确排除 `status === 'pending'` 的成员记录。只有 `status === 'active'` 的成员才能被 ban/delete 等操作。

---

## Resolved Codex Review Issues

| Issue | Severity | Resolution |
|-------|----------|------------|
| TenantGuard only reads body.userId | High | TargetUserGuard 从 params/query/body 多来源提取 |
| Guard doesn't bind X-Tenant-Id to caller | High | TenantContextGuard 验证调用者租户权限 |
| Server-side RBAC not specified | High | SuperAdminGuard 强制执行 RBAC |
| Ban/delete global vs tenant | Medium | 采用租户级 Ban（membership.status），全局 delete 限 platform-admin |
| Audit logs only for violations | Medium | @Audited 装饰器记录所有成功/失败操作 |
| Some actions lack userId in body | Low | extractTargetUserId() 支持多来源；无 userId 操作返回 true |

---
