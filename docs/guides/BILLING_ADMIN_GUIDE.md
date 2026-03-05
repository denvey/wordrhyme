# 计费系统管理指南

本文档面向平台管理员，介绍如何通过 Admin UI 配置和管理计费系统。

---

## 1. 套餐管理 (Plans)

**路径**: Settings → Billing → Plans

### 创建套餐

1. 点击「新建套餐」
2. 填写套餐信息：
   - **名称** (name): 套餐显示名称
   - **价格** (priceCents): 以分为单位的价格（0 = 免费套餐）
   - **周期** (intervalMonths): 计费周期（月）
   - **描述** (description): 套餐说明
3. 保存后在套餐详情中配置 Capability 项

### 配置 PlanItem（套餐能力项）

每个 PlanItem 关联一个已审批的 Capability（能力），定义该套餐对该能力的额度和策略。

| 字段 | 说明 | 可选值 |
|------|------|--------|
| subject | Capability 标识符 | 从已审批列表选择 |
| type | 类型 | `boolean`（开关）/ `metered`（计量） |
| amount | 额度上限 | metered 类型必填 |
| overagePolicy | 超额策略 | `deny`（拒绝）/ `charge`（收费）/ `throttle`（限速）/ `downgrade`（降级） |
| overagePriceCents | 超额单价（分） | 当 overagePolicy=charge 时必填 |
| resetStrategy | 重置策略 | `hard`（清零重发）/ `soft`（余额累加）/ `capped`（封顶累加） |
| resetCap | 累加上限 | 当 resetStrategy=capped 时使用 |
| quotaScope | 配额作用域 | `tenant`（组织共享）/ `user`（用户独立） |

### 删除/归档套餐

- **归档**（推荐）：软删除，标记为不活跃，现有订阅继续有效
- **删除**：硬删除，有活跃订阅时会被阻止
- 活跃订阅状态包括：`active`、`trialing`、`past_due`

---

## 2. Capability 管理

**路径**: Settings → Billing → Capabilities

### Capability 来源

| 来源 | 命名空间 | 状态 |
|------|----------|------|
| Core | `core.*`（如 `core.teamMembers`） | 自动 approved |
| Plugin | `plugin.{pluginId}.*` | 默认 pending，需审批 |

### 审批流程

1. 插件安装后，其声明的 Capability 进入 **pending** 状态
2. 管理员在 Capabilities 页面查看待审批项
3. 点击「审批」设为 approved，或「拒绝」设为 rejected
4. 只有 approved 状态的 Capability 才能被 PlanItem 引用
5. 已被 PlanItem 引用的 Capability 不可设为 rejected

---

## 3. 订阅管理

**路径**: Settings → Billing → Subscriptions

### 订阅状态机

```
trialing → active → past_due → canceled → expired
                  ↘ canceled → expired
```

| 状态 | 说明 |
|------|------|
| trialing | 试用期 |
| active | 正常活跃 |
| past_due | 续费失败，宽限期 |
| canceled | 已取消（等待周期结束） |
| expired | 已过期 |

### 操作

- **取消订阅**: 可选择立即取消或在周期末取消（cancelAtPeriodEnd）
- **变更套餐**: 升级立即生效，降级在周期末生效
- **手动激活**: 用于支付成功后手动触发激活

---

## 4. 配额管理

**路径**: Settings → Billing → Quotas

### 配额仪表盘

显示各租户的配额使用情况：
- 各 subject 的总额度、已用额度、剩余额度
- 配额来源（订阅发放 / 管理员赠送）
- 过期时间

### 手动赠送配额

管理员可为租户手动赠送额外配额：
- 选择租户和 subject
- 设定额度、优先级、过期时间
- sourceType 设为 `admin_grant`

---

## 5. 计费策略配置

**路径**: Settings → Billing → Settings

### 四层计费决策

插件 API 调用时，按以下优先级决定是否需要计费：

| 层级 | 名称 | 说明 | 配置方式 |
|------|------|------|----------|
| L4 | Override | 最高优先级，按 procedure 级别覆盖 | Settings 页面配置 |
| L3 | Manifest | 插件 manifest 中声明的 billing.procedures | 插件自带，不可修改 |
| L2 | Module Default | 插件级默认 subject | Settings 页面配置 |
| L1 | Default Policy | 未声明 procedure 的默认策略 | Settings 页面配置 |

### Default Policy 设置

| 策略 | 说明 |
|------|------|
| allow | 允许所有未声明的 procedure（开发阶段推荐） |
| deny | 拒绝所有未声明的 procedure（生产环境推荐） |
| audit | 允许但记录审计日志（迁移过渡期推荐） |

---

## 6. 支付网关

当前支持 Stripe 网关。Webhook 配置请参考 [Stripe Webhook 配置指南](./STRIPE_WEBHOOK_SETUP.md)。
