# Permission System Supplement

> **补充日期**: 2024-12-24
> **补充原因**: 原提案中权限系统设计缺少关键实现细节

---

## 补充内容概览

本次补充完善了MVP权限系统的以下四个关键缺失部分：

1. **审计日志系统** - 记录所有权限检查和敏感操作
2. **插件权限注册流程** - 插件安装时自动注册权限
3. **种子数据脚本** - 初始化核心权限定义
4. **跨插件权限依赖策略** - 明确禁止插件间权限依赖

---

## 1. 审计日志系统

### 新增内容

#### 数据库Schema (`specs/database-schema/spec.md`)

```typescript
// apps/server/src/db/schema/audit-logs.ts
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorType: text('actor_type').notNull().$type<'user' | 'plugin' | 'system'>(),
  actorId: text('actor_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  action: text('action').notNull(),
  resource: text('resource'),
  result: text('result').notNull().$type<'allow' | 'deny' | 'error'>(),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**索引优化**:
- `tenantIdx`: 按租户查询审计日志
- `actorIdx`: 按执行者查询（用户/插件）
- `actionIdx`: 按操作类型查询
- `createdAtIdx`: 按时间范围查询

#### Permission Kernel集成 (`specs/permission-kernel/spec.md`)

```typescript
// 在 PermissionKernel.can() 方法中
if (!result || this.isSensitiveCapability(capability)) {
  await this.logAudit({
    actorType: 'user',
    actorId: userId,
    tenantId,
    action: 'permission.check',
    resource: capability,
    result: result ? 'allow' : 'deny',
    reason: result ? undefined : `Missing capability: ${capability}`,
  });
}
```

**敏感操作定义**:
- `plugin:install:*` - 插件安装
- `plugin:uninstall:*` - 插件卸载
- `user:manage:*` - 用户管理
- `user:remove:*` - 移除用户
- `organization:delete:*` - 删除组织

### 为什么需要

1. **合规性**: 治理文档 `PERMISSION_GOVERNANCE.md` 要求记录权限拒绝
2. **安全审计**: 追踪谁在何时尝试访问什么资源
3. **问题排查**: 权限配置错误时快速定位原因
4. **监管要求**: 未来SaaS部署需要审计日志

### 任务更新

- `tasks.md` 2.2.8: 新增 `audit_logs` 表定义任务
- `tasks.md` 4.1.7: 新增审计日志实现任务
- `tasks.md` 9.1.11: 新增审计日志测试任务

---

## 2. 插件权限注册流程

### 新增内容

#### PluginPermissionRegistry服务 (`specs/plugin-runtime/spec.md`)

```typescript
// apps/server/src/plugins/permission-registry.ts
export class PluginPermissionRegistry {
  async registerPluginPermissions(manifest: PluginManifest): Promise<void> {
    // 1. 验证权限key格式（不允许 core:, system: 前缀）
    // 2. 批量插入到 permissions 表
    // 3. 自动添加 plugin:{pluginId}: 命名空间
  }

  async unregisterPluginPermissions(pluginId: string): Promise<void> {
    // 删除所有 source = pluginId 的权限
  }
}
```

#### 集成到Plugin Loader

```typescript
// apps/server/src/plugins/plugin-manager.ts
async installPlugin(pluginId: string, manifest: PluginManifest) {
  await this.validateManifest(manifest);
  await pluginPermissionRegistry.registerPluginPermissions(manifest); // 👈 新增
  await db.insert(plugins).values({ ... });
}

async uninstallPlugin(pluginId: string) {
  await this.callLifecycleHook(pluginId, 'onUninstall');
  await pluginPermissionRegistry.unregisterPluginPermissions(pluginId); // 👈 新增
  await db.delete(plugins).where(eq(plugins.pluginId, pluginId));
}
```

#### 保留命名空间验证

```typescript
const RESERVED_NAMESPACES = ['core', 'system'];

// 插件manifest中声明 "settings.read"
// → Core自动转换为 "plugin:com.vendor.seo:settings.read"

// 插件尝试声明 "core:users:manage"
// → 验证失败，抛出错误
```

### 为什么需要

1. **动态权限**: 插件权限在安装时注册，卸载时清理
2. **命名空间隔离**: 防止插件污染Core权限命名空间
3. **权限可见性**: Permission Kernel可以查询所有可用权限
4. **角色分配**: 管理员可以将插件权限分配给角色

### 任务更新

- `tasks.md` 3.3.5-3.3.6: 新增插件权限验证和注册任务
- `tasks.md` 4.1.9: 新增 PluginPermissionRegistry 服务任务
- `tasks.md` 9.1.7-9.1.9: 新增插件权限相关测试任务

---

## 3. 种子数据脚本

### 新增内容

#### Core权限定义 (`specs/database-schema/spec.md`)

```typescript
// apps/server/src/db/seed.ts
export async function seedPermissions() {
  const corePermissions = [
    // Organization 管理 (4个)
    { capability: 'organization:read:instance', source: 'core', ... },
    { capability: 'organization:create:instance', source: 'core', ... },
    { capability: 'organization:update:organization', source: 'core', ... },
    { capability: 'organization:delete:organization', source: 'core', ... },

    // User 管理 (4个)
    { capability: 'user:read:organization', source: 'core', ... },
    { capability: 'user:invite:organization', source: 'core', ... },
    { capability: 'user:manage:organization', source: 'core', ... },
    { capability: 'user:remove:organization', source: 'core', ... },

    // Content 管理 (8个)
    { capability: 'content:read:public', source: 'core', ... },
    { capability: 'content:read:space', source: 'core', ... },
    { capability: 'content:create:space', source: 'core', ... },
    { capability: 'content:update:own', source: 'core', ... },
    { capability: 'content:update:space', source: 'core', ... },
    { capability: 'content:delete:own', source: 'core', ... },
    { capability: 'content:delete:space', source: 'core', ... },
    { capability: 'content:publish:space', source: 'core', ... },

    // Plugin 管理 (6个)
    { capability: 'plugin:read:organization', source: 'core', ... },
    { capability: 'plugin:install:organization', source: 'core', ... },
    { capability: 'plugin:enable:organization', source: 'core', ... },
    { capability: 'plugin:disable:organization', source: 'core', ... },
    { capability: 'plugin:uninstall:organization', source: 'core', ... },
    { capability: 'plugin:configure:organization', source: 'core', ... },
  ];

  // 幂等性插入
  for (const perm of corePermissions) {
    await db.insert(permissions).values(perm).onConflictDoNothing();
  }
}
```

**总计**: 22个核心权限定义

#### 开发环境种子数据

```typescript
export async function seedDevelopmentData() {
  if (process.env.NODE_ENV !== 'development') return;

  // better-auth 自动管理 organization 表
  // 这里只是提示，实际通过 better-auth API 创建
}
```

### 为什么需要

1. **初始化**: 系统首次启动时需要预定义Core权限
2. **一致性**: 所有环境使用相同的权限定义
3. **可追溯**: 权限定义版本化，可审计
4. **开发体验**: 开发环境自动初始化，无需手动配置

### 任务更新

- `tasks.md` 2.2.12-2.2.13: 新增种子数据脚本创建和执行任务

---

## 4. 跨插件权限依赖策略

### 新增内容

#### 设计决策 (`design.md`)

```typescript
// Decision 11: Cross-Plugin Permission Dependencies (Forbidden)

// ❌ 禁止：插件A依赖插件B的权限
{
  "pluginId": "com.vendor.analytics",
  "permissions": {
    "required": ["plugin:seo:settings.read"] // ❌ 不允许
  }
}

// ✅ 允许：插件依赖Core权限
{
  "pluginId": "com.vendor.analytics",
  "permissions": {
    "required": ["content:read:space"] // ✅ 允许
  }
}
```

#### Manifest验证

```typescript
function validatePluginManifest(manifest: PluginManifest): void {
  if (manifest.permissions?.required) {
    for (const perm of manifest.permissions.required) {
      // 检测跨插件依赖
      if (perm.startsWith('plugin:') &&
          !perm.startsWith(`plugin:${manifest.pluginId}:`)) {
        throw new Error(
          `Plugin cannot depend on other plugin permissions: ${perm}`
        );
      }
    }
  }
}
```

#### 未来演进路径 (v2.0+)

插件协作通过Core事件系统：

```typescript
// Plugin A 发出事件
core.events.emit('seo.analyzed', data);

// Plugin B 订阅事件
core.events.on('seo.analyzed', handler);
```

### 为什么需要

1. **隔离性**: 插件必须独立运行（`PLUGIN_CONTRACT.md`）
2. **生命周期**: 插件A不能假设插件B已安装
3. **安全性**: 防止权限提升攻击链
4. **市场化**: 简化插件依赖关系，降低用户理解成本

### 规范更新

- `specs/permission-kernel/spec.md`: 新增跨插件权限依赖要求
- `design.md`: 新增 Decision 11 设计决策
- `tasks.md` 9.1.10: 新增跨插件权限依赖测试任务

---

## 5. 数据库Schema更新

### 新增表

| 表名 | 用途 | 关键字段 |
|-----|------|---------|
| `audit_logs` | 审计日志 | actorType, action, result, reason |
| `plugin_configs` | 插件配置 | pluginId, organizationId, key, value |
| `plugin_migrations` | 插件迁移追踪 | pluginId, migrationFile, checksum |

### 更新表

| 表名 | 变更 |
|-----|------|
| `permissions` | 新增 `source` 字段（'core' 或 pluginId） |

---

## 6. 任务清单更新汇总

### Phase 2: Database (新增3个任务)

- 2.2.8: Define `audit_logs` table
- 2.2.12: Create seed data script
- 2.2.13: Run seed script

### Phase 3: Bootstrap (新增2个任务)

- 3.3.5: Validate plugin permissions
- 3.3.6: Register plugin permissions

### Phase 4: Permission (新增2个任务)

- 4.1.7: Implement audit logging
- 4.1.9: Create PluginPermissionRegistry

### Phase 9: Testing (新增5个任务)

- 9.1.7: Test plugin permissions auto-registered
- 9.1.8: Test plugin permissions removed on uninstall
- 9.1.9: Test reserved namespace rejected
- 9.1.10: Test cross-plugin dependencies rejected
- 9.1.11: Test audit logs created

**总计新增**: 12个任务

---

## 7. 合规性验证

### 与治理文档对齐

| 治理文档 | 要求 | 补充内容 | 状态 |
|---------|------|---------|------|
| `PERMISSION_GOVERNANCE.md` | 权限拒绝需记录 | audit_logs表 + logAudit() | ✅ |
| `PERMISSION_GOVERNANCE.md` | 插件权限命名空间隔离 | PluginPermissionRegistry | ✅ |
| `PLUGIN_CONTRACT.md` | 插件独立，不依赖其他插件 | 跨插件权限依赖验证 | ✅ |
| `SYSTEM_INVARIANTS.md` | 白名单模型 | 种子数据 + 动态注册 | ✅ |

---

## 8. 实施建议

### 优先级

1. **P0 (必须)**:
   - audit_logs 表定义
   - PluginPermissionRegistry 服务
   - 种子数据脚本

2. **P1 (重要)**:
   - 跨插件权限依赖验证
   - 审计日志查询API

3. **P2 (可延迟)**:
   - 审计日志UI界面
   - 权限分析工具

### 实施顺序

```
Phase 2.2 (Database)
  ↓
Phase 2.2.12-13 (Seed Data) ← 先执行，确保权限表有数据
  ↓
Phase 3.3.5-6 (Plugin Permission Registration)
  ↓
Phase 4.1.7 (Audit Logging)
  ↓
Phase 4.1.9 (PluginPermissionRegistry)
  ↓
Phase 9.1.7-11 (Tests)
```

---

## 9. 风险与缓解

### 风险1: 审计日志写入失败阻塞业务

**缓解**:
```typescript
private async logAudit(entry) {
  try {
    await db.insert(auditLogs).values(entry);
  } catch (error) {
    // 审计日志失败不应阻塞业务
    console.error('Failed to write audit log:', error);
  }
}
```

### 风险2: 插件权限注册失败导致安装失败

**缓解**:
- Manifest验证在安装前执行
- 使用事务确保原子性
- 失败时回滚所有变更

### 风险3: 种子数据重复执行

**缓解**:
```typescript
await db.insert(permissions)
  .values(perm)
  .onConflictDoNothing(); // 幂等性
```

---

## 10. 未来扩展

### v1.0+ 计划

- [ ] 审计日志查询API (tRPC)
- [ ] 审计日志导出功能 (CSV/JSON)
- [ ] 权限使用统计分析
- [ ] 异常权限访问告警

### v2.0+ 计划

- [ ] 插件事件系统（替代跨插件权限依赖）
- [ ] 细粒度权限（ABAC模型）
- [ ] 权限委托机制
- [ ] 权限审批工作流

---

## 总结

本次补充完善了MVP权限系统的四个关键缺失部分，确保：

1. ✅ **可审计**: 所有权限检查和敏感操作有日志
2. ✅ **可扩展**: 插件权限动态注册和清理
3. ✅ **可初始化**: 核心权限通过种子数据预定义
4. ✅ **可隔离**: 插件间权限依赖被明确禁止

所有补充内容严格遵守frozen架构治理文档，不引入breaking changes。

---

**补充完成日期**: 2024-12-24
**审核状态**: 待批准
**影响范围**: MVP Phase 2, 3, 4, 9
