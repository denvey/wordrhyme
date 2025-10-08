# CLAUDE.zh.md

此文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

Cromwell CMS 是一个基于 React、Next.js、Nest.js 和 TypeORM 构建的免费开源无头 TypeScript CMS。它提供了强大的插件/主题系统，具有类似 WordPress 用户体验的全面管理面板。

## 架构

Cromwell CMS 作为一个包含多个互连服务的单体仓库运行：

### 核心服务 (system/)
- **API 服务器与代理** (`system/server`) - 主要的 API 服务器，提供 REST/GraphQL 端点和代理处理
- **管理面板** (`system/admin`) - 基于 Next.js 的管理界面
- **渲染器** (`system/renderer`) - 编译和提供主题/插件文件的 Next.js 服务
- **管理器** (`system/manager`) - 控制其他服务的主要协调服务
- **CLI** (`system/cli`) - 命令行界面（`cromwell` 或 `crw` 命令）
- **工具包** (`system/utils`) - 模块打包器/编译器/包管理器

### 核心库 (system/core/)
- **通用** (`system/core/common`) - 共享类型、常量和工具
- **后端** (`system/core/backend`) - 服务端助手、仓库和数据库工具
- **前端** (`system/core/frontend`) - 客户端助手、API 客户端和 React 组件

### 扩展
- **插件** (`plugins/`) - 模块化功能扩展（通讯录、支付处理器等）
- **主题** (`themes/`) - 完整的网站模板（商店、博客）
- **工具包** (`toolkits/`) - 可重用的组件库

## 开发命令

### 安装和设置
```bash
npm run build          # 构建所有包（自动处理安装）
npx cromwell start     # 使用默认 SQLite 数据库启动 CMS
```

### 开发
```bash
npm run dev            # 在开发模式下启动所有服务并监视变化
```

### 单个服务开发
```bash
npx crw s --sv s --dev # 启动 API 服务器并监视变化
npx crw s --sv a --dev # 启动管理面板并热重载
npx crw s --sv r --dev # 启动渲染器并监视变化
```

### 测试
```bash
npm run test           # 运行所有测试
npm run test:server    # 测试服务器组件
npm run test:admin     # 测试管理面板
npm run test:backend   # 测试后端核心
npm run test:frontend  # 测试前端核心
npm run test:cli       # 测试 CLI
```

### 构建和打包
```bash
npm run build:core     # 仅构建核心包
npm run build:system   # 仅构建系统包
npm run lerna:patch    # 升级补丁版本
npm run lerna:publish  # 发布到 npm
```

### 数据库开发
```bash
# 启动开发数据库
npm run docker:start-dev-mariadb   # MariaDB 在 3306 端口
npm run docker:start-dev-postgres  # PostgreSQL 在 5432 端口

# 通过复制 cmsconfig.json.dev-example 到 cmsconfig.json 进行配置
# 并将所需的数据库配置从 "orm-*" 重命名为 "orm"
```

## 服务架构详情

### 默认端口（可通过 cmsconfig.json 配置）
- **主要入口点**: http://localhost:4016 (代理处理所有路由)
- **API 服务器**: http://localhost:4016/api (REST + GraphQL)
- **管理面板**: http://localhost:4064
- **渲染器**: http://localhost:4128

### API 端点
- **GraphQL**: http://localhost:4016/api/graphql
- **GraphQL Playground**: https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql
- **Swagger REST API**: http://localhost:4016/api/api-docs/

## 关键开发模式

### 工作区结构
- 使用 Yarn 工作区和 Lerna 进行包管理
- 每个服务都是一个独立的 npm 包，有自己的构建过程
- 共享依赖在根级别管理，具有版本解析

### 插件开发
- 插件遵循使用 `cromwell.config.js` 的标准结构
- 支持前端组件和后端解析器/控制器
- 开发模式下可用热重载

### 主题开发
- 主题是具有特殊 Cromwell 集成的 Next.js 应用程序
- 在主题目录中使用 `npm run watch` 进行开发
- 支持自定义页面、组件和样式

### 数据库支持
- TypeORM 支持 SQLite、MySQL、MariaDB、PostgreSQL
- 迁移是特定于数据库的（每种数据库类型有单独的文件夹）
- 可通过 Docker 命令使用开发数据库

## 重要说明

### 安装
- **绝对不要手动运行 `npm install`** - startup.js 脚本处理所有安装
- 在开发中使用 yarn 进行依赖管理
- 构建过程自动处理工作区依赖

### 开发最佳实践
- 使用 CLI 命令 (`npx crw`) 进行服务管理
- 各个服务可以使用监视器独立开发
- 管理面板和主题可用热重载
- 为生产插件更新实现了安全重载

### 测试和质量
- 每个包都有自己的 Jest 配置
- 服务器包中可通过 `npm run typecheck` 进行 TypeScript 编译
- 通过 `npm run format` 进行 Prettier 格式化（在根级和包级别可用）