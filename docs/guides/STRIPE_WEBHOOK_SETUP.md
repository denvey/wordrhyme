# Stripe Webhook 配置指南

本文档说明如何配置 Stripe Webhook 以接收支付事件。

---

## 1. 前置条件

- Stripe 账户已创建并获取 API 密钥
- 服务端已配置 Stripe 相关环境变量：
  ```env
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

---

## 2. 创建 Webhook Endpoint

### 通过 Stripe Dashboard

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 进入 **Developers → Webhooks**
3. 点击 **Add endpoint**
4. 配置：
   - **Endpoint URL**: `https://your-domain.com/api/billing/webhook/stripe`
   - **Events to send**: 选择以下事件：
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
5. 点击 **Add endpoint**
6. 复制 **Signing secret** (格式: `whsec_...`) 到环境变量 `STRIPE_WEBHOOK_SECRET`

### 通过 Stripe CLI（开发环境）

```bash
# 安装 Stripe CLI
brew install stripe/stripe-cli/stripe

# 登录
stripe login

# 转发 webhook 到本地开发服务器
stripe listen --forward-to localhost:3000/api/billing/webhook/stripe

# CLI 会输出 webhook signing secret，复制到 .env
# > Ready! Your webhook signing secret is whsec_...
```

---

## 3. Webhook 处理流程

系统收到 Stripe Webhook 后的处理流程：

```
Stripe Event → 签名验证 → 解析事件 → 查找交易 → 幂等检查 → 更新状态 → 发布事件
```

### 支持的事件

| Stripe 事件 | 系统动作 | 发布事件 |
|-------------|---------|---------|
| `payment_intent.succeeded` | 交易标记 PAID | `billing.payment.success` |
| `payment_intent.payment_failed` | 交易标记 FAILED | `billing.payment.failed` |
| `charge.refunded` | 交易标记 REFUNDED | — |

### 幂等处理

系统内置 Webhook 幂等保护：
- 交易已 PAID 时收到重复 PAID 事件 → 跳过处理
- 交易已 FAILED 时收到重复 FAILED 事件 → 跳过处理
- 未找到对应交易的事件 → 记录警告日志，静默返回

---

## 4. 支付成功后的自动化

当 `billing.payment.success` 事件触发后，系统自动执行：

1. **订阅激活**: 首次支付成功 → 订阅状态从 PENDING 变为 active
2. **配额发放**: 按 PlanItem 配置创建 tenant_quotas
3. **续费处理**: 续费支付成功 → 延长订阅周期 + 重置配额

---

## 5. 测试 Webhook

### 使用 Stripe CLI 测试

```bash
# 触发支付成功事件
stripe trigger payment_intent.succeeded

# 触发支付失败事件
stripe trigger payment_intent.payment_failed
```

### 验证检查清单

- [ ] Webhook endpoint URL 正确配置
- [ ] Signing secret 与环境变量一致
- [ ] 收到事件后交易状态正确更新
- [ ] 支付成功后订阅自动激活
- [ ] 配额正确发放
- [ ] 重复事件被幂等跳过（检查日志）

---

## 6. 生产环境注意事项

- **HTTPS**: Webhook endpoint 必须使用 HTTPS
- **超时**: Stripe 要求 endpoint 在 20 秒内响应
- **重试**: Stripe 会在失败后自动重试（最多 3 天，共约 16 次）
- **日志**: 所有 Webhook 处理结果记录在审计日志中
- **监控**: 在 Stripe Dashboard 的 Webhooks 页面监控投递成功率
