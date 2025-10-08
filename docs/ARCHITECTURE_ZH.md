# Cromwell CMS 架构文档

## 1. 整体系统架构

### 1.1 系统架构图

```mermaid
graph TB
    subgraph "External Services"
        CDN[CDN/静态资源]
        DB[(数据库)]
        Redis[(Redis缓存)]
    end
    
    subgraph "Cromwell CMS 核心服务"
        subgraph "入口层"
            Proxy[代理服务<br/>Port: 4016]
        end
        
        subgraph "服务层"
            API[API Server<br/>Nest.js<br/>Port: 4016/api]
            Admin[Admin Panel<br/>Next.js<br/>Port: 4064]
            Renderer[Renderer<br/>Next.js<br/>Port: 4128]
        end
        
        subgraph "管理层"
            Manager[Manager<br/>服务编排]
            CLI[CLI Tools<br/>cromwell/crw]
        end
        
        subgraph "构建层"
            Utils[Utils<br/>模块打包器]
        end
    end
    
    subgraph "核心库"
        Common[Common<br/>共享类型]
        Backend[Backend<br/>服务端工具]
        Frontend[Frontend<br/>客户端工具]
    end
    
    subgraph "扩展系统"
        Plugins[插件系统<br/>7个内置插件]
        Themes[主题系统<br/>2个内置主题]
        Toolkits[工具包<br/>组件库]
    end
    
    %% 连接关系
    Proxy --> API
    Proxy --> Admin
    Proxy --> Renderer
    
    Manager --> API
    Manager --> Admin
    Manager --> Renderer
    
    CLI --> Manager
    CLI --> Utils
    
    API --> Backend
    API --> Common
    API --> DB
    API --> Redis
    
    Admin --> Frontend
    Admin --> Common
    
    Renderer --> Frontend
    Renderer --> Common
    Renderer --> Themes
    
    Utils --> Plugins
    Utils --> Themes
    
    Plugins --> Backend
    Plugins --> Frontend
    
    Themes --> Frontend
    Themes --> Toolkits
    
    CDN --> Admin
    CDN --> Renderer
```

### 1.2 数据流架构

```mermaid
sequenceDiagram
    participant User as 用户/客户端
    participant Proxy as 代理服务
    participant API as API服务器
    participant Admin as 管理面板
    participant Renderer as 渲染器
    participant DB as 数据库
    participant Cache as 缓存层
    
    Note over User,Cache: 用户访问网站
    User->>Proxy: HTTP请求 (localhost:4016)
    Proxy->>Renderer: 转发页面请求
    Renderer->>API: 获取数据 (GraphQL/REST)
    API->>Cache: 查询缓存
    alt 缓存命中
        Cache-->>API: 返回缓存数据
    else 缓存未命中
        API->>DB: 查询数据库
        DB-->>API: 返回数据
        API->>Cache: 更新缓存
    end
    API-->>Renderer: 返回数据
    Renderer-->>Proxy: 返回渲染页面
    Proxy-->>User: 返回HTML页面
    
    Note over User,Cache: 管理员操作
    User->>Admin: 访问管理面板
    Admin->>API: CRUD操作
    API->>DB: 数据操作
    API->>Cache: 清除相关缓存
    API-->>Admin: 操作结果
    Admin-->>User: 更新UI
```

## 2. 服务详细架构

### 2.1 API服务器架构

```mermaid
graph TB
    subgraph "API Server (Nest.js)"
        subgraph "控制器层"
            REST[REST控制器<br/>Express路由]
            GraphQL[GraphQL解析器<br/>Apollo Server]
            Upload[文件上传<br/>Multipart]
        end
        
        subgraph "服务层"
            UserService[用户服务]
            ProductService[产品服务]
            PostService[文章服务]
            OrderService[订单服务]
            PluginService[插件服务]
        end
        
        subgraph "数据层"
            TypeORM[TypeORM<br/>ORM映射]
            Entities[实体模型<br/>10+核心实体]
            Repos[仓库模式<br/>Repository]
        end
        
        subgraph "中间件"
            Auth[JWT认证]
            Guard[角色守卫]
            Throttle[请求限流]
            CORS[跨域处理]
        end
        
        subgraph "数据库支持"
            SQLite[(SQLite<br/>默认)]
            MySQL[(MySQL)]
            PostgreSQL[(PostgreSQL)]
            MariaDB[(MariaDB)]
        end
    end
    
    %% 连接关系
    REST --> UserService
    REST --> ProductService
    GraphQL --> UserService
    GraphQL --> ProductService
    GraphQL --> PostService
    
    UserService --> TypeORM
    ProductService --> TypeORM
    PostService --> TypeORM
    OrderService --> TypeORM
    
    TypeORM --> Entities
    TypeORM --> Repos
    
    Repos --> SQLite
    Repos --> MySQL
    Repos --> PostgreSQL
    Repos --> MariaDB
    
    REST --> Auth
    GraphQL --> Auth
    Auth --> Guard
```

### 2.2 插件系统架构

```mermaid
graph LR
    subgraph "插件系统架构"
        subgraph "插件生命周期"
            Config[cromwell.config.js<br/>插件配置]
            Build[Rollup构建<br/>前端+后端]
            Register[插件注册<br/>动态加载]
            Runtime[运行时<br/>热重载]
        end
        
        subgraph "前端插件"
            FrontendComp[React组件<br/>UI插件]
            FrontendHooks[React Hooks<br/>状态管理]
            FrontendStyles[样式系统<br/>CSS模块]
        end
        
        subgraph "后端插件"
            Controllers[Nest.js控制器<br/>API扩展]
            Resolvers[GraphQL解析器<br/>类型扩展]
            Services[业务服务<br/>逻辑扩展]
        end
        
        subgraph "内置插件"
            Newsletter[newsletter<br/>邮件订阅]
            Stripe[stripe<br/>支付集成]
            PayPal[paypal<br/>支付集成]
            ProductFilter[product-filter<br/>产品筛选]
            ProductShowcase[product-showcase<br/>产品展示]
            MainMenu[main-menu<br/>导航菜单]
            Marqo[marqo<br/>搜索集成]
        end
    end
    
    %% 连接关系
    Config --> Build
    Build --> Register
    Register --> Runtime
    
    Build --> FrontendComp
    Build --> Controllers
    
    FrontendComp --> FrontendHooks
    FrontendComp --> FrontendStyles
    
    Controllers --> Resolvers
    Controllers --> Services
    
    Runtime --> Newsletter
    Runtime --> Stripe
    Runtime --> PayPal
    Runtime --> ProductFilter
    Runtime --> ProductShowcase
    Runtime --> MainMenu
    Runtime --> Marqo
```

### 2.3 主题系统架构

```mermaid
graph TB
    subgraph "主题系统"
        subgraph "主题结构"
            ThemeConfig[cromwell.config.js<br/>主题配置]
            NextjsApp[Next.js应用<br/>完整网站]
            Pages[页面路由<br/>动态路由]
            Components[React组件<br/>可复用组件]
        end
        
        subgraph "集成功能"
            PluginEmbed[插件嵌入<br/>插件集成]
            VisualEditor[可视化编辑<br/>实时预览]
            SEO[SEO优化<br/>元数据管理]
            Styling[样式系统<br/>全局CSS]
        end
        
        subgraph "内置主题"
            StoreTheme[theme-store<br/>电商主题]
            BlogTheme[theme-blog<br/>博客主题]
        end
        
        subgraph "路由页面"
            HomePage[首页 /]
            CategoryPage[分类页 /category/[slug]]
            ProductPage[产品页 /product/[slug]]
            PostPage[文章页 /post/[slug]]
            CheckoutPage[结账页 /checkout]
        end
        
        subgraph "工具包集成"
            CommerceToolkit[商务工具包<br/>电商组件]
            UIComponents[UI组件<br/>通用组件]
        end
    end
    
    %% 连接关系
    ThemeConfig --> NextjsApp
    NextjsApp --> Pages
    Pages --> Components
    
    Components --> PluginEmbed
    Components --> VisualEditor
    Components --> SEO
    Components --> Styling
    
    NextjsApp --> StoreTheme
    NextjsApp --> BlogTheme
    
    Pages --> HomePage
    Pages --> CategoryPage
    Pages --> ProductPage
    Pages --> PostPage
    Pages --> CheckoutPage
    
    Components --> CommerceToolkit
    Components --> UIComponents
```

## 3. 数据模型架构

### 3.1 核心实体关系图

```mermaid
erDiagram
    User {
        int id PK
        string email UK
        string fullName
        string avatar
        string role
        datetime createdAt
        datetime updatedAt
    }
    
    Product {
        int id PK
        string name
        string slug UK
        decimal price
        string description
        string images
        int categoryId FK
        boolean isEnabled
        datetime createdAt
    }
    
    Category {
        int id PK
        string name
        string slug UK
        string description
        int parentId FK
        string image
    }
    
    Post {
        int id PK
        string title
        string slug UK
        text content
        int authorId FK
        datetime publishDate
        boolean isEnabled
        string featuredImage
    }
    
    Order {
        int id PK
        string orderNumber UK
        int userId FK
        decimal totalPrice
        string status
        string shippingAddress
        datetime createdAt
    }
    
    OrderItem {
        int id PK
        int orderId FK
        int productId FK
        int quantity
        decimal price
    }
    
    Tag {
        int id PK
        string name UK
        string color
    }
    
    PostTag {
        int postId FK
        int tagId FK
    }
    
    Plugin {
        int id PK
        string name UK
        string version
        boolean isEnabled
        json settings
    }
    
    Theme {
        int id PK
        string name UK
        string version
        boolean isActive
        json settings
    }
    
    %% 关系定义
    User ||--o{ Post : "写作"
    User ||--o{ Order : "下单"
    
    Category ||--o{ Product : "分类"
    Category ||--o{ Category : "父子关系"
    
    Order ||--o{ OrderItem : "包含"
    Product ||--o{ OrderItem : "被购买"
    
    Post ||--o{ PostTag : "标记"
    Tag ||--o{ PostTag : "应用于"
```

### 3.2 权限系统架构

```mermaid
graph TB
    subgraph "权限系统"
        subgraph "用户角色"
            SuperAdmin[超级管理员<br/>所有权限]
            Admin[管理员<br/>管理权限]
            Editor[编辑<br/>内容权限]
            Author[作者<br/>写作权限]
            Customer[客户<br/>购买权限]
        end
        
        subgraph "权限模块"
            UserMgmt[用户管理]
            ContentMgmt[内容管理]
            ProductMgmt[产品管理]
            OrderMgmt[订单管理]
            PluginMgmt[插件管理]
            ThemeMgmt[主题管理]
            SystemMgmt[系统管理]
        end
        
        subgraph "权限控制"
            JWT[JWT令牌<br/>身份验证]
            Guards[路由守卫<br/>权限检查]
            Decorators[装饰器<br/>方法级控制]
        end
    end
    
    %% 权限映射
    SuperAdmin --> UserMgmt
    SuperAdmin --> ContentMgmt
    SuperAdmin --> ProductMgmt
    SuperAdmin --> OrderMgmt
    SuperAdmin --> PluginMgmt
    SuperAdmin --> ThemeMgmt
    SuperAdmin --> SystemMgmt
    
    Admin --> ContentMgmt
    Admin --> ProductMgmt
    Admin --> OrderMgmt
    
    Editor --> ContentMgmt
    Author --> ContentMgmt
    
    Customer --> OrderMgmt
    
    %% 控制流程
    JWT --> Guards
    Guards --> Decorators
```

## 4. 构建与部署架构

### 4.1 构建流程图

```mermaid
graph TB
    subgraph "构建流程"
        Start([开始构建])
        Install[安装依赖<br/>startup.js]
        
        subgraph "核心构建"
            BuildCommon[构建 Common<br/>共享类型]
            BuildBackend[构建 Backend<br/>服务端工具]
            BuildFrontend[构建 Frontend<br/>客户端工具]
        end
        
        subgraph "系统构建"
            BuildManager[构建 Manager<br/>服务编排]
            BuildCLI[构建 CLI<br/>命令行工具]
            BuildUtils[构建 Utils<br/>构建工具]
            BuildServer[构建 Server<br/>API服务器]
            BuildAdmin[构建 Admin<br/>管理面板]
        end
        
        subgraph "扩展构建"
            BuildPlugins[构建插件<br/>7个内置插件]
            BuildThemes[构建主题<br/>2个内置主题]
            BuildToolkits[构建工具包<br/>组件库]
        end
        
        Validate[验证构建<br/>类型检查]
        Package[打包发布<br/>Lerna]
        End([构建完成])
    end
    
    %% 构建顺序
    Start --> Install
    Install --> BuildCommon
    BuildCommon --> BuildBackend
    BuildCommon --> BuildFrontend
    BuildBackend --> BuildManager
    BuildBackend --> BuildCLI
    BuildBackend --> BuildUtils
    BuildBackend --> BuildServer
    BuildFrontend --> BuildAdmin
    
    BuildManager --> BuildPlugins
    BuildUtils --> BuildPlugins
    BuildPlugins --> BuildThemes
    BuildThemes --> BuildToolkits
    
    BuildServer --> Validate
    BuildAdmin --> Validate
    BuildToolkits --> Validate
    
    Validate --> Package
    Package --> End
```

### 4.2 部署架构图

```mermaid
graph TB
    subgraph "生产环境部署"
        subgraph "负载均衡"
            LB[负载均衡器<br/>Nginx/HAProxy]
        end
        
        subgraph "应用层"
            App1[CMS实例1<br/>PM2/Docker]
            App2[CMS实例2<br/>PM2/Docker]
            App3[CMS实例N<br/>PM2/Docker]
        end
        
        subgraph "缓存层"
            Redis1[(Redis主)]
            Redis2[(Redis从)]
        end
        
        subgraph "数据层"
            DBMaster[(数据库主)]
            DBSlave[(数据库从)]
        end
        
        subgraph "存储层"
            FileStorage[文件存储<br/>AWS S3/OSS]
            CDN[CDN分发<br/>CloudFront]
        end
        
        subgraph "监控层"
            Monitor[监控系统<br/>Prometheus]
            Logs[日志系统<br/>ELK Stack]
        end
    end
    
    %% 连接关系
    LB --> App1
    LB --> App2
    LB --> App3
    
    App1 --> Redis1
    App2 --> Redis1
    App3 --> Redis1
    Redis1 --> Redis2
    
    App1 --> DBMaster
    App2 --> DBMaster
    App3 --> DBMaster
    DBMaster --> DBSlave
    
    App1 --> FileStorage
    FileStorage --> CDN
    
    App1 --> Monitor
    App2 --> Monitor
    App3 --> Monitor
    
    App1 --> Logs
    App2 --> Logs
    App3 --> Logs
```

## 5. 性能优化架构

### 5.1 缓存策略

```mermaid
graph TB
    subgraph "多层缓存架构"
        subgraph "浏览器缓存"
            BrowserCache[浏览器缓存<br/>静态资源]
        end
        
        subgraph "CDN缓存"
            CDNCache[CDN缓存<br/>全球分发]
        end
        
        subgraph "应用缓存"
            AppCache[应用缓存<br/>内存缓存]
            RedisCache[Redis缓存<br/>分布式缓存]
        end
        
        subgraph "数据库缓存"
            QueryCache[查询缓存<br/>ORM缓存]
            DBCache[数据库缓存<br/>MySQL缓存]
        end
    end
    
    subgraph "缓存策略"
        StaticCache[静态资源<br/>长期缓存]
        APICache[API响应<br/>短期缓存]
        PageCache[页面缓存<br/>SSG/SSR]
        SessionCache[会话缓存<br/>用户状态]
    end
    
    %% 缓存层级
    BrowserCache --> CDNCache
    CDNCache --> AppCache
    AppCache --> RedisCache
    RedisCache --> QueryCache
    QueryCache --> DBCache
    
    %% 策略映射
    StaticCache --> CDNCache
    APICache --> RedisCache
    PageCache --> AppCache
    SessionCache --> RedisCache
```

### 5.2 数据库优化

```mermaid
graph TB
    subgraph "数据库优化策略"
        subgraph "查询优化"
            IndexOpt[索引优化<br/>复合索引]
            QueryOpt[查询优化<br/>避免N+1]
            LazyLoad[懒加载<br/>按需加载]
        end
        
        subgraph "连接优化"
            ConnPool[连接池<br/>复用连接]
            ReadWrite[读写分离<br/>主从复制]
            Sharding[分片策略<br/>水平扩展]
        end
        
        subgraph "缓存优化"
            QueryCache[查询缓存<br/>结果缓存]
            EntityCache[实体缓存<br/>对象缓存]
            SecondLevel[二级缓存<br/>应用缓存]
        end
        
        subgraph "监控优化"
            SlowQuery[慢查询监控<br/>性能分析]
            Metrics[性能指标<br/>实时监控]
            Alerts[告警系统<br/>异常通知]
        end
    end
    
    %% 优化关系
    IndexOpt --> QueryOpt
    QueryOpt --> LazyLoad
    
    ConnPool --> ReadWrite
    ReadWrite --> Sharding
    
    QueryCache --> EntityCache
    EntityCache --> SecondLevel
    
    SlowQuery --> Metrics
    Metrics --> Alerts
```

这些架构图和流程图提供了 Cromwell CMS 系统的全面视图，包括系统架构、数据流、服务详情、数据模型、构建部署和性能优化等方面的详细说明。