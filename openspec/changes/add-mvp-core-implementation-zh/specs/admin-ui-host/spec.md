# 管理 UI 宿主规范 (Admin UI Host Specification)

## 新增要求

### 要求：Module Federation 配置

管理 UI 宿主应配置 Rspack + Module Federation 2.0。宿主应为插件定义扩展点以注入 UI 组件。

#### 场景：宿主应用程序加载
- **当** 在浏览器中访问管理 UI 时
- **那么** 宿主应用程序成功加载
- **并且** 渲染布局 (页眉、侧边栏、内容区域)
- **并且** 不发生 JavaScript 错误

---

### 要求：插件 UI 加载 (Plugin UI Loading)

宿主应从服务器 API 获取插件清单。对于每个定义了 `admin.remoteEntry` 的插件，宿主应通过 Module Federation 动态加载远程入口 URL。

#### 场景：加载插件远程入口
- **当** 服务器 API 返回一个带有 `admin.remoteEntry = "/admin/remoteEntry.js"` 的插件时
- **那么** 宿主获取远程入口 URL
- **并且** 插件的 UI 组件对于渲染可用
- **并且** 插件出现在侧边栏中 (如果它注册了侧边栏条目)

#### 场景：插件 UI 错误隔离
- **当** 插件的远程入口加载失败 (404 或 JS 错误) 时
- **那么** 错误边界捕获错误
- **并且** 为该插件显示回退 UI
- **并且** 其他插件继续正常渲染

---

### 要求：扩展点注册中心 (Extension Point Registry)

宿主应提供扩展点注册中心。MVP 支持的扩展点：`sidebar` (侧边栏)、`settings.page` (设置页面)。插件应在这些扩展点注册组件。

#### 场景：插件注册侧边栏条目
- **当** 插件调用 `registerExtension('sidebar', SidebarComponent)` 时
- **那么** 侧边栏组件在宿主的侧边栏中渲染
- **并且** 单击侧边栏条目将导航到插件页面

#### 场景：插件注册设置页面
- **当** 插件调用 `registerExtension('settings.page', SettingsComponent)` 时
- **那么** 设置页面中出现一个新的标签页
- **并且** 单击该标签页将渲染插件的设置 UI

---

### 要求：身份验证 (MVP 桩实现)

对于 MVP，身份验证应使用桩 (stub) 实现 (硬编码管理员用户或无身份验证)。管理 UI 应假设仅限本地访问。MVP 之后将添加 better-auth 集成。

#### 场景：无需身份验证
- **当** 在本地主机 (localhost) 访问管理 UI 时
- **那么** 不显示登录页面
- **并且** 用户被视为具有完全访问权限的 "admin" (管理员)
