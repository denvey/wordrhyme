# Cromwell CMS

Cromwell CMS 是一个免费开源的无头 TypeScript CMS，使用 React 和 Next.js 构建闪电般快速的网站。它拥有强大的插件/主题系统，同时提供了类似 WordPress 用户体验的广泛管理面板 GUI。
我们专注于赋能内容创作者和没有编程知识的用户，让他们能够方便地在项目中使用 CMS 的所有功能。

## 🚀 主要特性

- **电商与博客平台** - 完整的在线商店和博客管理系统
- **可视化编辑器** - 拖拽式主题编辑器，所见即所得
- **插件生态系统** - 从官方商店简单安装主题和插件，支持本地管理
- **免费主题** - 功能齐全的在线商店和博客主题，配有多种插件
- **多数据库支持** - 集成数据库，支持 SQLite、MySQL、MariaDB、PostgreSQL
- **开发者友好** - 充分利用 Next.js、Nest.js、TypeORM、TypeGraphQL 的强大功能构建任何类型的网站

## 📋 技术架构

### 核心技术栈
- **前端**: Next.js 13 + React 18 + Material-UI + TypeScript
- **后端**: Nest.js + TypeORM + Fastify
- **API**: GraphQL (Apollo Server) + REST API
- **数据库**: SQLite / MySQL / MariaDB / PostgreSQL
- **构建**: Yarn Workspaces + Lerna + Rollup

### 系统架构
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Admin Panel   │    │   API Server     │    │    Renderer     │
│   (Next.js)     │◄──►│   (Nest.js)      │◄──►│   (Next.js)     │
│   Port: 4064    │    │   Port: 4016     │    │   Port: 4128    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌──────────────────┐
                    │     Manager      │
                    │   (服务编排)      │
                    └──────────────────┘
```

## 🛠️ 快速开始

### 安装要求
- Node.js 16+ 
- Yarn 1.22+
- Git

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/CromwellCMS/Cromwell.git
   cd Cromwell
   ```

2. **构建项目**
   ```bash
   npm run build  # 自动处理依赖安装
   ```

3. **启动 CMS**
   ```bash
   npx cromwell start  # 使用默认 SQLite 数据库
   ```

4. **访问应用**
   - 前端网站: http://localhost:4016
   - 管理面板: http://localhost:4064
   - API 端点: http://localhost:4016/api
   - GraphQL: http://localhost:4016/api/graphql

### 开发模式

```bash
# 启动所有服务的开发模式（带文件监听）
npm run dev

# 单独启动服务
npx crw s --sv s --dev  # API 服务器
npx crw s --sv a --dev  # 管理面板
npx crw s --sv r --dev  # 渲染器
```

## 📁 项目结构

```
Cromwell/
├── system/                    # 核心系统
│   ├── core/                  # 核心库
│   │   ├── common/           # 共享类型和工具
│   │   ├── backend/          # 后端工具和仓库
│   │   └── frontend/         # 前端工具和组件
│   ├── server/               # API 服务器
│   ├── admin/                # 管理面板
│   ├── renderer/             # 主题渲染器
│   ├── manager/              # 服务编排器
│   ├── cli/                  # 命令行工具
│   └── utils/                # 构建工具
├── plugins/                  # 插件系统
├── themes/                   # 主题模板
├── toolkits/                 # 组件工具包
└── docker/                   # Docker 配置
```

## 🔌 插件系统

### 内置插件
- `newsletter` - 邮件订阅
- `stripe` - Stripe 支付
- `paypal` - PayPal 支付  
- `product-filter` - 产品筛选
- `product-showcase` - 产品展示
- `main-menu` - 主导航菜单
- `marqo` - 搜索集成

### 插件开发
每个插件都遵循标准结构：
```
plugins/your-plugin/
├── src/
│   ├── frontend/          # React 组件
│   └── backend/           # Nest.js 控制器/解析器
├── cromwell.config.js     # 插件配置
└── package.json
```

## 🎨 主题系统

### 内置主题
- `theme-store` - 电商主题
- `theme-blog` - 博客主题

### 主题特性
- **Next.js 集成** - 完整的 Next.js 应用
- **动态路由** - 自动生成页面路由
- **插件嵌入** - 在主题中集成插件功能
- **可视化编辑** - 实时预览和内容修改
- **SEO 优化** - 内置元数据配置

## 🗄️ 数据库配置

### 开发数据库
```bash
# 启动开发数据库
npm run docker:start-dev-mariadb    # MariaDB (端口 3306)
npm run docker:start-dev-postgres   # PostgreSQL (端口 5432)
```

### 配置示例
复制 `cmsconfig.json.dev-example` 到 `cmsconfig.json` 并根据需要配置：
```json
{
  "orm": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "cromwell",
    "password": "my_password",
    "database": "cromwell"
  }
}
```

## 🧪 测试

```bash
npm run test              # 运行所有测试
npm run test:server       # 服务器测试
npm run test:admin        # 管理面板测试
npm run test:backend      # 后端核心测试
npm run test:frontend     # 前端核心测试
npm run test:cli          # CLI 测试
```

## 📚 API 文档

### GraphQL API
- **端点**: http://localhost:4016/api/graphql
- **Playground**: https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql

### REST API
- **Swagger 文档**: http://localhost:4016/api/api-docs/
- **端点前缀**: http://localhost:4016/api

### 常用 API 示例

#### 获取产品列表
```graphql
query GetProducts {
  products {
    id
    name
    price
    description
    images {
      src
    }
  }
}
```

#### 获取博客文章
```graphql
query GetPosts {
  posts {
    id
    title
    content
    publishDate
    author {
      fullName
    }
  }
}
```

## 🚀 部署

### 生产构建
```bash
npm run build              # 完整构建
npm run build:core         # 仅构建核心包
npm run build:system       # 仅构建系统包
```

### 版本发布
```bash
npm run lerna:patch        # 补丁版本
npm run lerna:publish      # 发布到 npm
```

### Docker 部署
```bash
docker-compose up -d       # 使用 Docker Compose
```

## 🛠️ 开发最佳实践

### 重要注意事项
- **绝不要手动运行 `npm install`** - startup.js 脚本会处理所有安装
- 开发时使用 Yarn 进行依赖管理
- 构建过程会自动处理工作区依赖

### 开发工作流
1. 使用 CLI 命令 (`npx crw`) 进行服务管理
2. 各服务可以独立开发，支持文件监听
3. 管理面板和主题支持热重载
4. 生产环境插件更新实现安全重载

### 代码质量
- TypeScript 严格模式编译
- Jest 测试配置
- Prettier 代码格式化: `npm run format`

## 📖 示例和文档

- [官方文档](https://cromwellcms.com/docs/overview/installation)
- [演示网站](https://cromwellcms.com/docs/overview/intro#examples)
- [开发指南](https://cromwellcms.com/docs)

## 🤝 贡献

### 有问题？
在 [Discord 服务器](https://discord.com/invite/mxmJNSZ2gn) 中提问

### 发现 Bug？
如果您发现错误，可以通过向我们的 [GitHub 仓库](https://github.com/CromwellCMS/Cromwell/issues) 提交问题来帮助我们

更多详情请阅读 [贡献文档](https://github.com/CromwellCMS/Cromwell/blob/master/CONTRIBUTING.md)

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## ⭐ 支持项目

如果这个项目对您有帮助，请给我们一个 ⭐ Star！

---

**Cromwell CMS** - 让内容管理变得简单而强大 🚀
