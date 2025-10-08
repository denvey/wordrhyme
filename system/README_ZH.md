# CMS 核心开发

### 前置要求

- Node.js v12-16 
- Python
- `npm install node-gyp -g`

### 安装

```sh
$ git clone https://github.com/CromwellCMS/Cromwell
$ npm run build
$ npx cromwell start
```

**你不需要运行 `npm install`**，安装/构建由根目录中的 startup.js 脚本处理，该脚本通过 `npm run build` 调用。在开发中使用 yarn 来安装/更新依赖。

### 配置

默认情况下，CMS 将使用 SQLite 数据库启动。
但你可能需要使用一些特定的开发数据库。将根目录中的配置文件从 `cmsconfig.json.example` 复制到 `cmsconfig.json`。将需要的数据库属性名称改为 `orm` 以供 CMS 使用。例如将 `orm-mariadb` 改为 `orm`。

启动开发数据库：

- `npm run docker:start-dev-mariadb` 用于 MariaDB
- `docker:start-dev-postgres` 用于 Postgres

## 服务

在运行时，Cromwell CMS 是一组服务(npm 包)的集合。
以下列出了具有默认设置的核心服务(localhost 地址上的端口可以在 cmsconfig.json 中配置)：

### 1. API 服务器和代理

- 路径 - system/server
- NPM 模块 - @cromwell/server
- 运行命令 - `npx crw s --sv s`
- 访问地址 - http://localhost:4016

API 服务器和代理。这是一个服务中的两个服务器。
代理服务器处理所有传入请求并将它们分发给其他服务。因此在开发中，所有 CMS 服务都可以通过 http://localhost:4016 访问。在生产环境中，建议设置 Nginx 配置来代理服务。CMS 为此目的提供了配置好的 Nginx 配置。
代理管理 API 服务器，这就是[`安全重载`](https://cromwellcms.com/docs/development/plugin-development#how-exported-extensions-will-be-applied-in-the-production-server)的工作原理。

API 服务器实现了用于事务或内部使用的 REST API 和用于数据流的 GraphQL API。使用 Fastify 和 Nest.js

- Swagger - http://localhost:4016/api/api-docs/
- GraphQL 端点：http://localhost:4016/api/graphql。[Playground / Schema 文档](https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql)

### 2. 渲染器

- 路径 - system/renderer
- NPM 模块 - @cromwell/renderer
- 运行命令 - `npx crw s --sv r`
- 访问地址 - http://localhost:4128

Next.js 服务，编译(使用 Utils)并向最终用户提供活动主题和插件的文件。

### 3. 管理面板

- 路径 - system/admin
- NPM 模块 - @cromwell/admin-panel
- 运行命令 - `npx crw s --sv a`
- 访问地址 - http://localhost:4064

使用专用的 Fastify 服务器来提供管理面板文件和公共媒体文件。

### 4. 工具

- 路径 - system/utils
- NPM 模块 - @cromwell/utils

模块打包器/编译器/包管理器

> https://github.com/CromwellCMS/Cromwell/tree/master/system/utils#readme

### 5. 管理器

- 路径 - system/manager
- NPM 模块 - @cromwell/cms

Cromwell CMS 主模块。启动和控制其他服务

### 6. CLI

- 路径 - system/cli
- NPM 模块 - @cromwell/cli

提供 "cromwell" CLI。

## 开发服务

克隆并构建仓库后，你可以通过添加 --dev 标志在开发模式下启动服务(带有监视器)：
`npx crw s --sv s --dev` - 将使用 Nodemon 和 Rollup 启动 API 服务器服务，监视代码更改。
`npx crw s --sv a --dev` - 使用 Webpack 监视器和热重载启动管理面板服务。

对于其他服务，你可以从它们的位置运行脚本：
`cd system/core/common && npm run watch` - 将在 `@cromwell/core` 包上启动监视器。

主题开发也是一样：
`cd themes/store && npm run watch`
