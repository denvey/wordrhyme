# WordRhyme MVP Technical Supplement

本补遗文档旨在解决 MVP 设计评估中发现的细粒度技术实现模糊点，涵盖插件生命周期、UI 动态加载及数据管理策略。

---

## 1. 插件数据库迁移执行流程 (Installation Flow)

当插件通过管理后台或 CLI 安装时，系统按以下步骤处理数据库迁移：

1.  **扫描 (Scan)**: `PluginManager` 扫描插件包目录下的 `/migrations` 文件夹。
2.  **排序 (Sort)**: 获取所有 `.sql` 文件并按名称（语义化版本或序号，如 `0001_initial.sql`）进行升序排序。
3.  **对比 (Compare)**: 查询 `plugin_migrations` 表，找出该 `tenant_id` + `plugin_id` 下尚未执行的文件。
4.  **执行 (Execute)**: 
    - 启动一个数据库事务。
    - 遍历缺失的 `.sql` 文件，使用 `db.execute(sql)` 直接执行原始 SQL。
    - 每成功执行一个文件，在 `plugin_migrations` 中插入一条记录。
5.  **提交/回滚 (Commit/Rollback)**:
    - 若全部成功，则提交事务。
    - 若任一迁移失败，事务回滚。安装过程终止，并向用户报告错误。

---

## 2. MF2.0 动态加载与卸载机制

Admin UI 和 Web App 使用 **Module Federation 2.0** 的 `@module-federation/runtime` 实现插件热插拔。

### 加载流程 (Loading)
1.  **清单读取**: 核心应用启动或插件状态变更时，请求 `/api/plugins/active` 获取所有激活插件的远程入口（`remoteEntry.js` URL）。
2.  **动态注册**:
    ```typescript
    import { loadRemote, registerRemotes } from '@module-federation/runtime';

    // 批量注册激活的插件
    registerRemotes(plugins.map(p => ({
      name: p.pluginId,
      entry: p.adminEntryUrl, // e.g., http://cdn.wordrhyme.com/plugins/seo/remoteEntry.js
    })));
    ```
3.  **按需渲染**: 当用户访问插件路由时，核心应用通过 `loadRemote(`${pluginId}/App`)` 加载插件组件。

### 卸载流程 (Unloading)
- **运行时隔离**: 虽然 MF2.0 暂不原生支持完全的 "卸载"（JavaScript 属性难以从全局作用域彻底清除），但 WordRhyme 通过：
    - **逻辑卸载**: 在应用状态中标记插件无效，停止渲染该插件提供的任何组件。
    - **清理作用域**: 清空缓存的插件实例引用，防止内存泄漏。
    - **完全重载 (备选)**: 对于关键插件卸载，可触发页面刷新以清理全局环境。

---

## 3. tRPC Router 合并策略

服务器端利用 tRPC 的 `mergeRouters` 能力，在运行时动态重建 API 树。

1.  **命名空间过滤**: 插件 tRPC 路由必须挂载在以插件 ID 命名的命名空间下（如 `com_example_seo`）。
2.  **动态重建**:
    ```typescript
    let appRouter = coreRouter;

    // 当插件激活/停用时触发
    function rebuildRouter() {
      let merged = coreRouter;
      const activePlugins = pluginManager.getActivePlugins();
      
      for (const plugin of activePlugins) {
        if (plugin.serverRouter) {
          merged = mergeRouters(merged, {
            [plugin.namespace]: plugin.serverRouter
          });
        }
      }
      appRouter = merged;
    }
    ```
3.  **请求分发**: 所有 `/trpc/[plugin_namespace].*` 的请求会被自动分发到对应的插件逻辑。

---

## 4. 插件配置 UI 设计 (JSON Schema 驱动)

为简化 MVP 实现，插件配置 UI 采用 **JSON Schema 自动渲染** 模式：

1.  **声明**: 插件在 `manifest.json` 中定义 `configSchema`。
    ```json
    {
      "configSchema": {
        "type": "object",
        "properties": {
          "apiKey": { "type": "string", "title": "API Key" },
          "enableCache": { "type": "boolean", "default": true }
        }
      }
    }
    ```
2.  **渲染**: Core Admin UI 使用 `react-jsonschema-form` (或同类库) 自动根据该 Schema 生成配置表单。
3.  **持久化**: 表单提交后，数据存入 `plugin_configs` 表，且仅当前租户可见。

---

## 5. 插件数据删除策略 (Data Retention Policy)

关于插件卸载后的数据处理，WordRhyme 遵循以下原则：

1.  **卸载并不等同于清空 (Uninstall != Purge)**: 
    - 卸载插件时，系统**默认保留**该插件创建的数据库表及数据。
    - 理由：防止误操作导致数据丢失，支持以后重新安装插件时恢复状态。
2.  **数据清理 (Purge)**:
    - 仅在用户明确选择 "Clean Uninstall" 或在后台执行 "Delete Plugin Data" 时，执行 `DROP TABLE` 操作。
    - 系统应记录每个插件创建的表名，以便在清理时准确识别。

---

## 6. Admin/Web 菜单与路由注册

插件通过清单文件 (Manifest) 声明其在 UI 中的集成点。

### 菜单注册
```json
// manifest.json
{
  "admin": {
    "menuItems": [
      {
        "label": "SEO 设置",
        "icon": "Search",
        "path": "/seo-settings",
        "parent": "settings" // 挂载在主设置菜单下
      }
    ]
  }
}
```

### 路由注册
1.  **映射**: 核心应用维护一个路由注册表。
2.  **匹配**: 当 URL 匹配到 `/admin/p/:pluginId/*` 时，动态重定向到该插件的远程暴露组件。
3.  **隔离**: 插件内部路由由插件自带的 `basePath` 处理，确保其不干扰核心路由和其他插件。
