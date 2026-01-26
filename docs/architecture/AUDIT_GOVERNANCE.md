# Audit Governance

> **"默认自动兜底 + 可选业务语义 + 强制治理边界"**

## Version

- **Status**: Frozen v1.0
- **Last Updated**: 2026-01-23
- **Change Policy**: Breaking changes require major version bump

---

## 1. Three-Layer Audit Model

WordRhyme 采用三层审计模型，确保所有数据变更都有迹可循。

### 🟢 Layer 1: Infrastructure Audit (Default)

**触发条件**: 任意 `INSERT / UPDATE / DELETE` 操作，无需任何配置。

| 字段 | 来源 |
|------|------|
| `action` | `DB_INSERT` / `DB_UPDATE` / `DB_DELETE` |
| `entityType` | 表名（自动提取） |
| `entityId` | 主键值 |
| `changes` | 自动计算 `{ old?: {...}, new?: {...} }` |
| `metadata.layer` | `1` |

**规则**:
- ✅ 永远存在，不能关闭
- ✅ 异步执行，不阻塞主流程
- ✅ 跳过审计表自身（防止循环依赖）

**用途**:
- 技术追溯
- 兜底审计
- 安全事故取证

---

### 🟡 Layer 2: Business Audit (Recommended)

**触发方式**: 通过 tRPC Procedure 的 `.meta()` 声明业务语义。

```typescript
// 在 tRPC Router 中声明
export const menuRouter = router({
  update: protectedProcedure
    .meta({
      audit: {
        action: 'MENU_UPDATE',
        level: 'FULL'
      }
    })
    .input(updateMenuSchema)
    .mutation(async ({ input }) => {
      return db.update(menus).set(input).where(eq(menus.id, input.id));
    }),
});
```

| 字段 | 来源 |
|------|------|
| `action` | `.meta()` 中声明的 action |
| `metadata.layer` | `2` |
| `metadata.level` | `FULL` / `META` |

**规则**:
- ✅ 业务语义优先于基础设施审计
- ✅ 同一操作记录 Layer 2，不重复记录 Layer 1
- ✅ 推荐用于重要业务操作

**用途**:
- 管理后台审计日志
- 合规报告
- 业务行为分析

---

### 🔴 Layer 3: Mandatory Audit (Future)

> **Phase 2 实现** - 通过配置或插件声明，非硬编码。

**设计原则**:
- 不在 Core 硬编码 Mandatory 表列表
- 通过 Settings 或插件 manifest 声明
- 支持运行时配置

**未来实现方式**:

```typescript
// 通过 Settings 配置
{
  "audit.mandatoryTables": ["roles", "permissions", "api_tokens"],
  "audit.onViolation": "warn" // "throw" | "warn" | "allow"
}

// 插件通过 manifest 声明
{
  "pluginId": "com.example.payment",
  "audit": {
    "mandatoryTables": ["plugin_payment_transactions"]
  }
}
```

---

## 2. Skipped Tables

以下表不产生审计记录（防止循环依赖）：

| 表名 | 原因 |
|------|------|
| `audit_events` | 审计事件表本身 |
| `audit_events_archive` | 归档表 |
| `audit_logs` | Guard 审计表 |

---

## 3. Action Naming Convention

### Layer 1 (Infrastructure)

固定格式：
- `DB_INSERT`
- `DB_UPDATE`
- `DB_DELETE`

### Layer 2 (Business)

格式: `{DOMAIN}_{VERB}`

| Domain | Examples |
|--------|----------|
| `MENU` | `MENU_CREATE`, `MENU_UPDATE`, `MENU_DELETE`, `MENU_REORDER` |
| `ROLE` | `ROLE_CREATE`, `ROLE_UPDATE`, `ROLE_DELETE`, `ROLE_PERMISSION_GRANT` |
| `USER` | `USER_BAN`, `USER_UNBAN`, `USER_IMPERSONATE` |
| `SETTING` | `SETTING_UPDATE`, `SETTING_RESET` |
| `CONTENT` | `CONTENT_PUBLISH`, `CONTENT_ARCHIVE`, `CONTENT_RESTORE` |

### Layer 2 (Plugin)

格式: `plugin:{pluginId}:{action}`

示例: `plugin:seo:meta.update`

---

## 4. Changes Diff Format

```typescript
interface AuditChanges {
  old?: Record<string, unknown>;  // Before state (UPDATE/DELETE)
  new?: Record<string, unknown>;  // After state (INSERT/UPDATE)
}
```

**规则**:
- `INSERT`: `{ new: {...} }`
- `UPDATE`: `{ old: {...}, new: {...} }`
- `DELETE`: `{ old: {...} }`
- 敏感字段自动脱敏 (`password`, `token`, `secret` 等)

---

## 5. Sensitive Field Redaction

以下字段在审计日志中自动替换为 `[REDACTED]`：

```
password, passwordHash, password_hash,
token, secret, apiKey, api_key,
privateKey, private_key,
accessToken, access_token,
refreshToken, refresh_token
```

---

## 6. Actor Context

审计事件自动从 AsyncLocalStorage 获取 Actor 上下文：

| 字段 | 来源 |
|------|------|
| `actorId` | `ctx.userId` / `ctx.apiTokenId` / `'system'` |
| `actorType` | `'user'` / `'api-token'` / `'plugin'` / `'system'` |
| `actorIp` | Request IP |
| `userAgent` | Request User-Agent |
| `traceId` | W3C Trace ID |
| `requestId` | Request UUID |
| `sessionId` | Session ID |

---

## 7. Error Handling

| 场景 | 行为 |
|------|------|
| Layer 1 审计写入失败 | 记录错误日志，**不阻塞业务** |
| Layer 2 审计写入失败 | 记录错误日志，**不阻塞业务** |
| 审计服务不可用 | 降级运行，emit alert |

**核心原则**: 审计失败不应影响业务操作。

---

## 8. Performance Considerations

- **异步执行**: 使用 `setImmediate()` 不阻塞主流程
- **批量写入**: 使用 `AuditService.logBatch()` 减少数据库往返
- **Before 数据获取**: UPDATE/DELETE 前查询原数据，限制返回行数

---

## 9. Plugin Audit Rules

插件必须遵循以下规则：

### 插件作者必须知道的

```typescript
// 使用 PluginAuditService，不直接访问 audit_events 表
await ctx.audit.log({
  action: 'meta.update',
  entityType: 'page',
  entityId: 'page-123',
  changes: { old: {...}, new: {...} },
});
```

### 插件不允许做的

- ❌ 绕过 ORM 直接写 audit 表
- ❌ 禁用或跳过审计
- ❌ 伪造 actorId 或 actorType

### 平台保证

- 插件不写审计 → 仍有 Layer 1 基础审计
- 插件操作自动带 `plugin:{pluginId}:` 前缀

---

## 10. Implementation Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        tRPC Layer                            │
│  protectedProcedure.meta({ audit: { action: 'XXX' } })       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Global Audit Middleware                     │
│  runWithAuditContext({ action, level, actorId, ... })        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      scoped-db Layer                          │
│  wrapInsert / wrapUpdate / wrapDelete                         │
│  → 读取 AuditContext                                          │
│  → Layer 2 有值？用业务 action : 用 DB_INSERT/UPDATE/DELETE   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      AuditService                             │
│  log() / logBatch() → audit_events 表                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 11. Summary

> **WordRhyme 的审计日志遵循"默认自动、语义可选、强制可配"的原则，
> 在不增加开发者负担的前提下，提供企业级可追溯与合规能力。**

| 层级 | 触发方式 | 开发者负担 | 覆盖范围 |
|------|----------|-----------|----------|
| Layer 1 | 自动 | 零 | 100% |
| Layer 2 | `.meta()` | 一行代码 | 按需 |
| Layer 3 | 配置/插件 | 可选 | 自定义 |
