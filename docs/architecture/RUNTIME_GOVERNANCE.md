# WordRhyme — Runtime Governance (MVP-Frozen v1)

> 本文档定义 **WordRhyme 插件运行时（Runtime）的治理边界（Governance）**。
>
> **目标**：
>
> * 支持 **MVP 阶段插件在线安装 / 启停 / 卸载**
> * 不要求系统重启
> * 不引入 Worker / WASM 的实现复杂度
> * 但 **不破坏未来演进到 Worker / WASM 的可能性**
>
> 本文件高于任何具体 Runtime 实现，
> 是 `SYSTEM_INVARIANTS.md` 与 `PLUGIN_CONTRACT.md` 的直接下位规范。

---

## 0. 核心立场（Non-Negotiable）

### 0.1 Runtime 的唯一目标（保持不变）

> **插件的失败，永远不能演变为系统的失败。**

在 MVP 阶段，这意味着：

* 插件异常 ≠ Core 崩溃
* 插件加载失败 ≠ 系统不可用
* 插件卸载 ≠ 需要重启系统

---

### 0.2 插件的本质（保持不变）

* 插件 ≠ Core
* 插件 ≠ 可信代码
* 插件 ≠ 长期存在的假设

> 插件是“被允许执行的一段第三方代码”，
> 而不是系统的一部分。

---

## 1. MVP Runtime 不变量（Hard Invariants）

以下规则在 **MVP 阶段即冻结**：

1. **插件代码不得直接运行在 Core 内部模块上下文**
2. **插件必须通过 Runtime Adapter 执行**
3. **插件必须绑定权限裁决器（PermissionService）**
4. **插件执行必须被 try/catch + 超时保护**
5. **插件不能阻断 Core 主流程**

⚠️ MVP **暂不强制**：

* Worker 线程
* 内存级隔离
* CPU 精确配额

但 **必须保留治理接口与抽象**。

---

## 2. Runtime Actor Model（执行身份模型）

### 2.1 Actor 定义（不变）

| Actor  | 说明      | 权限来源                 |
| ------ | ------- | -------------------- |
| User   | 人类用户    | 用户角色 / Workspace     |
| Plugin | 插件执行体   | Plugin Manifest + 授权 |
| System | Core 内部 | 不对插件暴露               |

### 2.2 MVP 强制规则

* 插件 **只能以 Plugin Actor 身份执行**
* 插件 **不能模拟 / 冒充 User**
* 插件 **不能调用 System 内部 API**

所有权限裁决统一入口：

```text
Permission.check(actor = Plugin, action, resource)
```

---

## 3. Runtime 抽象（MVP 版本）

### 3.1 Runtime 形态声明（Manifest 冻结）

即使 MVP 只实现一种 Runtime，插件也 **必须声明**：

```json
{
  "runtime": {
    "type": "node",
    "mode": "in-process"
  }
}
```

> 这是 **为未来 Worker / WASM 预留的契约点**。

---

### 3.2 Runtime Adapter（MVP 实现）

MVP 阶段允许：

* 插件运行在 **同一 Node.js 进程**
* 但 **必须通过 Runtime Adapter 调用**

```ts
interface PluginRuntime {
  start(): Promise<void>
  stop(reason: StopReason): Promise<void>
  execute(task: RuntimeTask): Promise<RuntimeResult>
}
```

⚠️ **禁止**：

* Core 直接调用插件导出函数
* 插件自行注册全局副作用

---

### 3.3 在线安装 / 启停（MVP 核心要求）

MVP Runtime **必须支持**：

* 插件在线安装（无需重启）
* 插件 enable / disable
* 插件卸载后立即失效

实现约束：

* 使用 `dynamic import()` + Runtime Adapter
* 插件状态变化 → 立即生效
* 插件异常 → 自动隔离

---

## 4. 执行与稳定性治理（MVP 简化版）

### 4.1 执行模型

* 插件执行 **默认异步**
* Core 不等待插件执行完成
* Hook 执行失败 **不影响 Core**

---

### 4.2 超时与异常（MVP 要求）

MVP 阶段至少具备：

* 执行超时（wall-time）
* try/catch 隔离
* 错误计数（用于自动 disable）

> **MVP 不要求精确 CPU / Memory 计量**，
> 但 Runtime 接口必须允许未来接入。

---

## 5. Hook 执行治理（保持原则，放宽实现）

### 5.1 Hook 本质（不变）

> Hook 是 **受控回调**，不是流程控制权。

### 5.2 MVP 执行规则

* Hook 默认异步
* Hook 失败只影响插件自身
* 禁止 Hook 阻断主流程

---

## 6. 崩溃、降级与禁用（MVP 版本）

### 6.1 插件状态机（简化）

| 状态       | 说明        |
| -------- | --------- |
| enabled  | 正常执行      |
| degraded | 异常但未禁用    |
| disabled | 被系统或管理员禁用 |

---

### 6.2 自动处理策略

| 情况        | 行为          |
| --------- | ----------- |
| 单次异常      | 记录日志        |
| 连续异常      | 标记 degraded |
| 多次失败 / 越权 | 自动 disable  |

---

## 7. 生命周期治理（MVP）

### 7.1 无常驻原则（保持）

插件 **不得假设**：

* 自己一直存在
* 状态一定被保留

---

### 7.2 插件状态 → Runtime 行为

| 插件状态      | Runtime 行为 |
| --------- | ---------- |
| installed | 未加载        |
| enabled   | 动态加载并执行    |
| disabled  | 立即停止执行     |
| removed   | 卸载模块引用     |

⚠️ MVP 阶段：

* 停止 ≠ 优雅清理
* Core 不等待插件清理完成

---

## 8. SaaS / 多租户（MVP 一致性）

* 本地部署 ≠ 更大权限
* SaaS ≠ Runtime 特权

插件 Runtime **必须绑定 Tenant / Workspace 上下文**。

---

## 9. 明确暂缓（Deferred, Not Rejected）

以下能力 **不在 MVP 实现**，但 **契约允许未来加入**：

* Worker Thread Runtime
* WASM Runtime
* 精确 CPU / Memory 计量
* 插件级任务调度
* Edge Runtime

---

## 10. 冻结声明（MVP）

* 本文档为 **MVP-Frozen**
* 原则不可破坏
* 实现可演进
* Worker / WASM 只能作为 **新增 Runtime 类型**

---

## 11. MVP 设计宣言（更新）

> 插件可以随时加载、随时失效、随时被移除。
> 系统不需要为插件停下脚步。

> **MVP 阶段，稳定性优先于隔离强度。**
> **演进能力优先于一次性完美。**


