# WordRhyme / DSNeo 全栈多语言最终架构方案（Final）

> 状态：✅ 冻结（Freeze）
> 目标：支撑 WordRhyme Core + 插件生态 + DSNeo + B2C Storefront
> 级别：企业级 / 多租户 / 插件化 / 全球化

---

## 0. 设计目标（Why）

1. **统一治理**：避免前后端、插件各自为政
2. **可扩展**：插件可独立声明、加载、卸载语言资源
3. **高性能**：避免翻译包体积爆炸
4. **可运营**：支持后台直接新增 / 修改 / 发布翻译
5. **全球化**：RTL、SEO、排序、货币、时区完整支持
6. **工程友好**：强约束 + 开发期即暴露问题

---

## 1. 核心概念模型（Concepts）

### 1.1 Locale Context（全局语言上下文）

```ts
interface LocaleContext {
  locale: string        // zh-CN, en-US, ar-SA
  language: string      // zh, en, ar
  region?: string       // CN, US, SA
  currency: string      // USD, CNY, EUR
  timezone: string      // UTC, Asia/Shanghai
  direction: 'ltr' | 'rtl'
}
```

> **来源优先级（Resolver Pipeline）**

```
URL ?lang
→ Cookie
→ User Preference
→ Tenant Default
→ System Default (zh-CN)
```

---

## 2. 后端架构（Backend）

### 2.1 翻译存储模型（JSONB + 状态机）

#### 表：`i18n_messages`

```sql
id
tenant_id
namespace        -- core, auth, plugin:dsneo.orders
scope            -- global | admin | storefront
key              -- order.status.paid
locale           -- en-US
message          -- JSONB or TEXT
description      -- 翻译说明（给翻译人员）
state            -- draft | published | obsolete
version
created_at
updated_at
```

> **禁止 TEXT-only 字段**
> 所有用户可见文案必须来自 i18n

---

### 2.2 翻译生命周期（Lifecycle）

```mermaid
draft → published → obsolete
```

* `draft`：编辑中，不对用户可见
* `published`：前端可加载
* `obsolete`：Key 已失效（用于孤儿检测）

---

### 2.3 API 设计（标准化）

#### 拉取翻译（按需）

```
GET /api/i18n/messages
```

```json
{
  "locale": "en-US",
  "scopes": ["global", "admin"],
  "namespaces": ["core", "plugin:dsneo.orders"]
}
```

#### 响应

```json
{
  "locale": "en-US",
  "direction": "ltr",
  "messages": {
    "core.common.save": "Save",
    "dsneo.order.paid": "Paid"
  }
}
```

---

### 2.4 错误码 & API 响应规范

```json
{
  "code": "ORDER_NOT_FOUND",
  "message": "Order not found",
  "i18nKey": "error.order.not_found",
  "args": { "orderId": "123" },
  "locale": "en-US"
}
```

---

### 2.5 排序与 Collation（⚠ 必须）

**禁止直接 `ORDER BY jsonb->>`**

推荐策略（任选）：

1. 写入时冗余：

```ts
sort_name_en
sort_name_zh
```

2. 或查询指定：

```sql
ORDER BY name->>'de-DE' COLLATE "de_DE"
```

---

## 3. 插件系统（Plugin i18n Contract）

### 3.1 Plugin Manifest 声明

```json
{
  "name": "dsneo-orders",
  "i18n": {
    "scopes": ["admin"],
    "namespaces": ["plugin:dsneo.orders"]
  }
}
```

### 3.2 插件约束（Hard Rules）

* ❌ 插件不得直接写死文案
* ❌ 插件不得访问其他插件 namespace
* ✅ 插件卸载 → 自动 orphan keys

---

## 4. 前端架构（Frontend）

### 4.1 技术选型

* **库**：`react-i18next`
* **协议**：ICU MessageFormat
* **加载**：`i18next-http-backend`

---

### 4.2 按 Scope 懒加载（性能关键）

```ts
await loadMessages({
  locale: ctx.locale,
  scopes: ['global', 'admin'],
  namespaces: ['core', 'plugin:dsneo.orders']
})
```

> Home 页面 ❌ 不加载 Admin 翻译

---

### 4.3 RTL 支持（强制）

#### CSS 规范

❌ 禁止：

```css
margin-left
float: right
```

✅ 强制：

```css
margin-inline-start
padding-inline-end
```

#### HTML

```html
<html lang="ar" dir="rtl">
```

---

### 4.4 伪本地化（Dev Only）

Locale：`en-XA`

```txt
Save → [!!! Šàvè !!!]
```

**作用**：

* 检测硬编码
* 检测布局溢出
* 检测字符编码

---

## 5. 后台 Admin（运营能力）

### 5.1 支持能力

* ✅ 新增语言（locale）
* ✅ 编辑已存在翻译
* ✅ 批量导入 / 导出（Excel / JSON）
* ✅ 翻译状态流转（Draft → Published）
* ✅ 显示 description（上下文）

---

### 5.2 翻译导出格式（示例）

| namespace | key | locale | message | description |
| --------- | --- | ------ | ------- | ----------- |

---

## 6. SEO（B2C 必须）

* `<html lang>`
* `hreflang`
* locale-aware slug（可选）
* SSR / SSG 预渲染

---

## 7. 缓存策略（必须）

| 层级     | 方式                              |
| ------ | ------------------------------- |
| Server | Redis（locale + scope + version） |
| Client | in-memory + localStorage        |
| CDN    | `/i18n/messages?hash=xxx`       |

---

## 8. 日志 & 审计（建议必加）

### 记录：

* 翻译变更
* 发布操作
* 插件注册 / 卸载
* Locale fallback 命中

---

## 9. 未做 ≠ 漏洞（明确不做）

* ❌ 实时自动机器翻译（仅辅助）
* ❌ 运行期动态 schema 变更
* ❌ 前端自由定义 locale key

---

## 10. Claude Code 实施顺序（建议）

1. RequestContext locale resolver
2. i18n_messages 表 + API
3. Plugin Manifest 校验
4. Frontend i18n 基础接入
5. Scope 懒加载
6. Admin 翻译管理
7. RTL + pseudo locale
8. SEO + cache

---

