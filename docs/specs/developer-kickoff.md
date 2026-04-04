# 开发启动指南：Shipping + Quotation 插件

**交付日期**：2026-03-24
**交付人**：Denvey
**目标**：4月中旬（~4/14）两个插件基本功能完成，可供 DSNeo 代发工具集成使用
**工期预估**：3 周（使用 AI 编程辅助工具加速）

---

## 一、依赖关系（必须理解）

```
plugin-shop (商品库，已有)
    ↓ 提供 SPU/SKU 数据
plugin-shipping (物流基建，本次开发)
    ↓ 提供 ShippingRPC.calculateRates
plugin-ds-quotation (报价系统，本次开发)
    ↓ 消费以上两者
DSNeo 代发工具 (上层业务)
```

**关键结论**：Shipping 先行，Quotation 依赖 Shipping 的 RPC 接口。

---

## 二、开发顺序建议

### Phase A：Shipping 后端核心（第 1 周前半）
1. DB Schema 建表（4 张表）
2. 承运商 CRUD API
3. **核心算费引擎**（`calculateRates` RPC）— 这是 Quotation 的前置依赖
4. Excel 导入流（映射引擎 + 5 套内置配置）

### Phase B：Shipping 前端 + Quotation 后端（第 1 周后半 ~ 第 2 周）
5. Shipping 管理后台 UI（承运商列表/编辑/详情页）
6. Quotation DB Schema 建表（4 张表）
7. Quotation 核心 CRUD API + 状态机
8. 毛利率计算引擎 + 审批流

### Phase C：Quotation 前端 + 联调（第 2-3 周）
9. 报价单列表页
10. 新建报价单工作台（含内联建档、算价抽屉）
11. 对客展示页（公开链接）
12. 联调 + 修 Bug

---

## 三、必读文档（按优先级）

| 顺序 | 文档 | 路径 | 说明 |
|------|------|------|------|
| 1 | **Shipping PRD** | `docs/specs/shipping/shipping_prd.md` | V2.1，649 行，完整 |
| 2 | **Quotation PRD** | `docs/specs/quotation/quotation_prd.md` | V1.3，574 行，完整 |
| 3 | CLAUDE.md | 项目根目录 | CRUD 规范、Drizzle v2 语法、Zod 规范 |
| 4 | auto-crud-server 最佳实践 | `docs/auto-crud-server-best-practices.md` | 后端 CRUD 必读 |
| 5 | Zod Schema 规范 | `docs/zod-schema-conventions.md` | Schema 定义必读 |
| 6 | Drizzle Query API v2 | `docs/drizzle-query-api-v2.md` | 查询语法必读 |

---

## 四、技术栈与规范提醒

- **后端**：NestJS + Fastify + Drizzle + PostgreSQL
- **前端**：React + Rspack + shadcn/ui
- **CRUD**：必须使用 `@wordrhyme/auto-crud-server`（零配置模式优先）
- **Schema**：统一在 `@wordrhyme/db` 定义，前后端共享
- **查询**：新代码必须用 Drizzle v2 对象式语法（`ctx.db.query`）
- **权限**：使用 `protectedProcedure.meta({ permission })` 触发权限检查
- **多租户**：所有表必须有 `organization_id`，ScopedDb 自动注入

---

## 五、红线警告

1. **Shipping 模块绝不感知商品/订单/报价** — 纯基建，只接收物理参数返回运费
2. **Quotation 明细表禁止存储商品物理属性** — 通过 `shop_variant_id` 关联取最新值
3. **报价单离开 draft 状态后不可修改** — 冻结快照原则
4. **对客页面绝对禁止透出底价/成本** — 只展示 All-in 一口价
5. **Shipping 所有金额单位为人民币分** — 汇率转换由 Quotation 负责
6. **carrier_id 在报价表中不做 FK 约束** — 快照原则，纯字符串引用

---

## 六、验收标准（4月底）

### Shipping 插件
- [ ] 能创建/编辑/启停承运商
- [ ] 能通过 Excel 导入云途/燕文/闪电猴/4PX 费率表
- [ ] `calculateRates` RPC 能正确返回运费（含首续重、进位取整、偏远附加费）
- [ ] 管理后台可查看费率大表 + 偏远规则

### Quotation 插件
- [ ] 能新建/编辑/提交报价单
- [ ] 内联建档能创建 SPU+SKU 并回填到报价单
- [ ] 调用 Shipping RPC 试算运费并展示在算价抽屉
- [ ] 毛利率实时计算 + 红线阻断 + 审批流
- [ ] 对客公开链接可正常展示（含过期遮罩）
- [ ] 状态机流转正确（Draft → Sent → Accepted 等）

---

## 七、沟通机制

- 遇到 PRD 不清楚的地方，**先查文档**，确认无答案再提问
- 每周五下午同步进度，阻塞问题随时沟通
- 技术选型有疑问时，优先参考 CLAUDE.md 中的规范

## 七、AI 编程工具使用建议

充分利用 AI 编程工具（Claude Code / Cursor 等）加速开发：

**适合 AI 加速的任务**：
- Schema 定义 + Drizzle 表结构 → 直接生成
- auto-crud-server 路由 → 给 AI 看最佳实践文档，秒出
- **前端列表/表格页 → 使用 `@wordrhyme/auto-crud` + `AutoCrudTable` 快速生成**，标准 CRUD 页面几乎零手写
- shadcn/ui 页面骨架 → 描述布局 AI 直接输出
- 公式实现（算费引擎、毛利引擎）→ 把 PRD 公式喂给 AI
- 单元测试 → AI 根据用例描述批量生成

**必须人工把关的任务**：
- Excel 导入映射 → 需要用真实货代文件逐一验证
- 明细数据表交互（Q-F3）→ 复杂状态管理，AI 生成后需仔细调
- 前后端毛利公式一致性 → 必须人工交叉验证
- 状态机边界 case → 每个非法流转都要测到

---

## 八、跨模块公共方法与集成参考

> **⚠️ 核心架构原语（Frontend vs Backend 调用区别）**：
> 以下列出的 `trpc.xxx` 路径均为 **前端 React 调用的 SDK 路径**（底层通过 HTTP 发起请求）。
> **绝对禁止在服务端跑 HTTP 调用！**任何后端的跨模块获取数据，必须直接通过实例化对方模块的底层 Service 类（如 `getExchangeRateService().getCurrentRate(...)`）完成。

开发 Quotation 时，需高频依赖或调用本平台上游模块已提供的标准接口，请直接以此为基准：

### 1. 快速建档：`shop.products.inlineCreate`

主要用于前端【新建报价单工作台】里的“零切换”商品录入，前端直接发起 HTTP 调用该 tRPC Endpoint。它会在一个独立事务中创建 SPU + SKU，并直接返回 `skuId` 供报价单挂载。

- **前端调用路径**: `trpc.shop.products.inlineCreate.mutate`
- **1. Input Schema（核心入参）**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `Record<string, string>` | ✅ | 商品多语言名称（核心映射：`{"zh-CN": "名字", "en-US": "name"}`），单语言最长128字符 |
| `weight` | `number` | ✅ | SKU 重量，单位：克(g)，正整数 |
| `cargoType` | `enum` | ✅ | 货物类型：`general` / `battery` / `pure_battery` / `liquid_powder` |
| `skuCode` | `string` | 条件 | SKU 编码（max 50），若 `autoSku=true` 则可省略 |
| `autoSku` | `boolean` | ❌ | 默认 `false`，设为 `true` 时自动生成 SKU 编码 |
| `spuCode` | `string` | ❌ | SPU 编码（max 50），省略则自动生成 |
| `mainImage` | `string` | ❌ | 商品主图链接（URL 格式） |
| `images` | `string[]` | ❌ | 1688等抓取返回的商品相册图集，最多 20 张图片 URL |
| `source` | `enum` | ❌ | 采购来源/平台：`1688` / `taobao` / `pinduoduo` / `self_sourced` 等 |
| `sourceUrl` | `string` | ❌ | 货源链接（URL 格式） |
| `memo` | `string` | ❌ | 采购备注信息，max 500字 |
| `length` | `number` | ❌ | 长度，单位：cm |
| `width` | `number` | ❌ | 宽度，单位：cm |
| `height` | `number` | ❌ | 高度，单位：cm |
| `purchaseCost` | `number` | ❌ | 采购底价，单位：人民币分 |
| `shippingCost` | `number` | ❌ | 头程/国内物流段费，单位：人民币分 |
| `packingCost` | `number` | ❌ | 包材费，单位：人民币分 |

- **2. 核心校验规则**：
  - `skuCode` 和 `autoSku` 至少满足一个（`skuCode` 填了，或 `autoSku = true`）
  - `weight` 必须为正整数
  - `purchaseCost` 最小值为 `0`
  - `name` 至少提供一种语言的名称翻译

- **3. Output Schema（返回结果）**：
  ```typescript
  {
    spuId: string;      // 新建 SPU 主键（自动生成 UUID）
    skuId: string;      // 新建 SKU 主键（自动生成 UUID）
    spuCode: string;    // SPU 业务编码
    skuCode: string;    // SKU 业务编码
    weight: number;     // 重量(g)
    cargoType: string;  // 货物类型
    name: Record<string, string>; // 多语言名称
  }
  ```

### 2. 汇率换算机制（前端与后端）

系统的物流端基建底层采用人民币计算 (`shipping` 模块的所有费率落库、算费公式均为人民币分)，而对外报价展现、收款均需使用美金。这要求在 Quotation 层做换算聚合。随时注意安全缓冲垫率 (offset)。

- **前端调用 (已封装全局 Context)**：
  在算价抽屉里实时预览各方成本或统一对客毛利时，直接引入前端全局的 `useCurrency` Hook：
  ```typescript
  import { useCurrency } from '@/lib/currency'; // 具体路径依据包结构
  
  const { p, convert, currency, baseCurrency } = useCurrency();
  
  // 场景A：把 15元(1500分) 运费，根据右上角已选的高级目标货币纯数字折算：
  const resultCents = convert(1500, 'CNY', currency.code); // 自动查内存 rate & offset
  
  // 场景B：直接展示给用户看带货币符号的格式化字符串 (例如 "$2.15")：
  // 若当前系统处于 USD 视图，直接传入 CNY 的分，自动转汇病附带符号：
  const displayStr = p(1500, 'CNY');
  ```
  *注意：前端底层已做过了 `trpc` 的全局防抖拉取，直接无脑取用 Context 方法，不要自己去发请求。*

- **后端调用 (无 HTTP 损耗，内存直调)**：
  在后端生成正式报价单、进行毛利极值红线拦截时，**不要**调 tRPC：
  ```typescript
  import { getExchangeRateService } from '@wordrhyme/xxx'; // 或从依赖树中提取
  
  // 注入组织 ID 后进行同内存级别的 Service 调用
  const service = getExchangeRateService();
  const rateData = await service.getCurrentRate(orgId, 'CNY', 'USD');
  ```
- **红线**：只要涉及到对客的美金售价试算，前端走 `p()` 或 `convert()` 方法，后端查 `Service`，绝不允许强写静态汇率。

---

**如有疑问联系 Denvey。Good luck!**

