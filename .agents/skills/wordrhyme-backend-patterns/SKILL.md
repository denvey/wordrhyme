---
description: WordRhyme后端服务模式规范，包括Repository去重设计及Infra Policy查写隔离
---

## Service / Repository 分层规范 (Critical)

**简单 CRUD 直接写在 Service 层，不需要 Repository。**

### 何时使用 Repository

仅当查询逻辑涉及以下复杂场景时，才抽取独立 Repository：

- **行级锁** (`FOR UPDATE`)
- **乐观锁** (version/CAS 检查)
- **跨表事务去重** (expire old + insert new 的原子操作)
- **瀑布式扣减** (多行 ordered update)
- **复杂聚合** (多表 JOIN、窗口函数、DISTINCT ON 等)

### 何时直接在 Service 中内联

所有简单 CRUD（select/insert/update/delete）直接用 `this.db` 操作：

```typescript
// ✅ 正确：简单查询直接在 Service 内联
@Injectable()
export class CurrencyService {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly exchangeRateRepo: ExchangeRateRepository // 复杂查询保留 Repo
  ) {}

  async getByCode(orgId: string, code: string) {
    const [currency] = await this.db
      .select().from(currencies)
      .where(and(eq(currencies.organizationId, orgId), eq(currencies.code, code)))
      .limit(1);
    return currency ?? null;
  }
}

// ❌ 错误：简单 CRUD 还包一层 Repository
class CurrencyRepository {
  async getByCode(orgId: string, code: string) { ... }
}
class CurrencyService {
  constructor(private readonly repo: CurrencyRepository) {}
  async getByCode(orgId: string, code: string) {
    return this.repo.getByCode(orgId, code); // 纯透传，无业务逻辑
  }
}
```

### 当前保留 Repository 的模块

| Repository | 保留理由 |
|-----------|---------|
| `exchange-rate.repo` | expire + insert 原子事务、批量导入 |
| `quota.repo` | 行级锁 FOR UPDATE、瀑布式扣减 |
| `subscription.repo` | 乐观锁版本检查 |
| `tenant-quota.repo` | 聚合查询 + 行级锁 |

### 判断标准

> **如果 Service 方法只是 `return this.repo.xxx(args)` 的纯透传，说明 Repo 层是多余的。**

---

## 基础设施策略读写分离原则 (Critical)

适用于所有使用 Infra Policy 模式的模块（currency、storage 等）。

### READ 查询：用 `resolveEffectiveOrgId`

决定"看谁的数据"。`unified` 或 `allow_override` 无自定义时，非 platform 用户需要读 platform 的数据。

### WRITE 操作：直接用 `ctx.organizationId`

- **不需要 `resolveEffectiveOrgId`**
- `requireMutationAllowed` 已是完备守卫：拦掉所有"不该写"的场景
- 所有放行的场景中，`ctx.organizationId` 就是正确的写入目标

### 为什么 mutation 禁止用 `resolveEffectiveOrgId`

如果 mutation 用了 `resolveEffectiveOrgId`，在 `allow_override` 无自定义的场景中会返回 `'platform'`，导致**租户写入篡改了平台数据**。

| 场景 | `requireMutationAllowed` | `ctx.organizationId` | 结论 |
|------|-------------------------|---------------------|------|
| `unified` + 非 platform | 阻断 | — | 不会执行到 |
| `require_tenant` | 放行 | 租户 orgId | 直写正确 |
| `allow_override` + 有自定义 | 放行 | 租户 orgId | 直写正确 |
| `allow_override` + 无自定义 | 阻断 | — | 不会执行到 |
