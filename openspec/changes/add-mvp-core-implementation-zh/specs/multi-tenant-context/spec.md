# 多租户上下文规范 (Multi-Tenant Context Specification)

## 新增要求

### 要求：上下文提供者注册 (Context Provider Registration)

系统应为以下项注册上下文提供者：租户、用户、语言区域、货币、时区。上下文提供者必须在启动的第 2 阶段 (插件加载前) 初始化。

#### 场景：所有上下文提供者均已注册
- **当** 第 2 阶段 (上下文提供者) 完成时
- **那么** TenantContextProvider 已注册
- **并且** UserContextProvider 已注册
- **并且** LocaleContextProvider 已注册
- **并且** CurrencyContextProvider 已注册
- **并且** TimezoneContextProvider 已注册

---

### 要求：请求限定的上下文 (Request-scoped Context)

上下文必须按请求解析工作且限定于该请求。上下文应通过 Async Local Storage (ALS) 访问。插件必须通过能力 API 访问上下文 (而非全局变量)。

#### 场景：从请求解析上下文
- **当** 收到带有标头 `X-Tenant-Id: tenant-123` 的请求时
- **那么** TenantContextProvider 解析出 `tenantId = "tenant-123"`
- **并且** 上下文在请求持续时间内存储在 ALS 中
- **当** 插件代码访问 `ctx.tenant` 时
- **那么** 它收到 `{ tenantId: "tenant-123" }`

#### 场景：请求之间的上下文隔离
- **当** 请求 1 的 `tenantId = "tenant-A"` 时
- **并且** 请求 2 的 `tenantId = "tenant-B"` 时
- **那么** 请求 1 中的代码始终看到 `tenantId = "tenant-A"`
- **并且** 请求 2 中的代码始终看到 `tenantId = "tenant-B"`
- **并且** 上下文不会在请求之间泄露

---

### 要求：默认上下文值 (Default Context Values)

如果无法从请求中解析上下文，则应使用合理的默认值：`locale = "en-US"`, `currency = "USD"`, `timezone = "UTC"`。租户和用户必须被解析 (缺少租户/用户是错误)。

#### 场景：语言区域默认为 en-US
- **当** 请求未指定语言区域时
- **那么** LocaleContextProvider 返回 `"en-US"`

#### 场景：缺少租户是错误
- **当** 请求未指定租户 ID 时
- **并且** 无法推断租户时
- **那么** 请求被拒绝并返回 400 错误
- **并且** 错误消息指示“需要租户 ID”

---

### 要求：上下文不可变性 (Context Immutability)

上下文值在请求内必须是不可变的。插件不得修改上下文 (仅限只读访问)。

#### 场景：上下文只读
- **当** 插件代码尝试改变 `ctx.tenantId` 时
- **那么** 改变失败 (TypeError: 无法分配给只读属性)
- **或者** 改变被忽略 (对象已冻结)
