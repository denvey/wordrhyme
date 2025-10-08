# Cromwell CMS API 文档

## 概述

Cromwell CMS 提供统一的 **GraphQL** 和 **REST API**，基于现代化的服务架构：
- **GraphQL**: Apollo Server + Type-GraphQL 装饰器
- **REST API**: NestJS + Fastify
- **认证**: JWT 基础的角色权限认证
- **数据库**: TypeORM 支持 SQLite、MySQL、MariaDB、PostgreSQL

## 🌐 API 端点

### 基础 URL
- **GraphQL 端点**: `http://localhost:4016/api/graphql`
- **GraphQL Playground**: `https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql`
- **REST API 基础**: `http://localhost:4016/api/v1/`
- **Swagger 文档**: `http://localhost:4016/api/api-docs/`

## 📊 GraphQL API

### 核心实体操作

所有主要实体都遵循一致的 GraphQL 模式：

**可用实体**:
- `Product` - 电商产品及变体、评价
- `ProductCategory` - 分层产品分类
- `User` - 用户管理及角色权限
- `Post` - 博客文章和内容
- `Order` - 电商订单和交易
- `ProductReview` - 客户产品评价
- `Attribute` - 产品属性和规格
- `Tag` - 内容标签系统
- `Coupon` - 优惠券和促销
- `Role` - 用户角色和权限
- `CustomEntity` - 可扩展自定义内容类型
- `ProductVariant` - 产品变体（尺寸、颜色等）

### 标准 GraphQL 操作

#### 查询操作 (Queries)

**单个实体查询**
```graphql
# 按 ID 获取产品
query GetProductById {
  getProductById(id: 123) {
    id
    name
    price
    description
    mainImage
    categories {
      id
      name
      slug
    }
    attributes {
      key
      values
    }
    rating {
      average
      reviewsNumber
    }
  }
}

# 按 slug 获取产品
query GetProductBySlug {
  getProductBySlug(slug: "macbook-air") {
    id
    name
    price
    oldPrice
    stockAmount
    images
    description
    variants {
      id
      name
      price
      attributes {
        key
        values
      }
    }
  }
}
```

**多个实体查询（带分页和过滤）**
```graphql
# 获取产品列表
query GetProducts {
  getProducts(
    pagedParams: {
      pageNumber: 0
      pageSize: 20
      orderBy: "createDate"
      order: "DESC"
    }
    filterParams: {
      minPrice: 100
      maxPrice: 1000
      nameSearch: "laptop"
      categoryId: 5
      attributes: [
        { key: "brand", values: ["Apple", "Dell"] }
        { key: "color", values: ["black", "silver"] }
      ]
      stockStatus: "IN_STOCK"
    }
  ) {
    elements {
      id
      name
      price
      mainImage
      categories {
        id
        name
      }
      rating {
        average
        reviewsNumber
      }
    }
    pagedMeta {
      totalElements
      totalPages
      pageNumber
      pageSize
    }
    filterMeta {
      minPrice
      maxPrice
    }
  }
}
```

**用户相关查询**
```graphql
# 获取用户信息
query GetUserById {
  getUserById(id: 456) {
    id
    fullName
    email
    avatar
    bio
    roles {
      id
      name
      permissions
    }
    posts(pagedParams: { pageSize: 5 }) {
      elements {
        id
        title
        publishDate
      }
    }
  }
}

# 获取当前用户订单
query GetOrdersOfUser {
  getOrdersOfUser(userId: 456) {
    id
    orderTotalPrice
    status
    createDate
    orderItems {
      product {
        name
        mainImage
      }
      quantity
      price
    }
  }
}
```

**专业查询**
```graphql
# 获取根分类
query GetRootCategories {
  getRootCategories {
    id
    name
    slug
    image
    children {
      id
      name
      slug
    }
  }
}

# 获取博客文章
query GetPosts {
  getPosts(
    pagedParams: { pageNumber: 0, pageSize: 10 }
    filterParams: { published: true }
  ) {
    elements {
      id
      title
      excerpt
      content
      publishDate
      featuredImage
      author {
        fullName
        avatar
      }
      tags {
        name
        color
      }
    }
    pagedMeta {
      totalElements
      totalPages
    }
  }
}
```

#### 变更操作 (Mutations)

**创建操作**
```graphql
# 创建产品
mutation CreateProduct {
  createProduct(data: {
    name: "iPhone 15 Pro"
    price: 999.99
    description: "最新的iPhone型号"
    categoryIds: [1, 2]
    attributes: [
      { key: "color", values: ["black", "white"] }
      { key: "storage", values: ["128GB", "256GB"] }
    ]
    mainImage: "/uploads/iphone-15-pro.jpg"
    images: [
      "/uploads/iphone-15-pro-1.jpg"
      "/uploads/iphone-15-pro-2.jpg"
    ]
    stockAmount: 100
  }) {
    id
    name
    price
    slug
  }
}

# 创建用户
mutation CreateUser {
  createUser(data: {
    fullName: "张三"
    email: "zhangsan@example.com"
    password: "securePassword123"
    roleIds: [2]
  }) {
    id
    fullName
    email
    roles {
      name
    }
  }
}
```

**更新操作**
```graphql
# 更新产品
mutation UpdateProduct {
  updateProduct(id: 123, data: {
    name: "iPhone 15 Pro Max"
    price: 1099.99
    stockAmount: 50
  }) {
    id
    name
    price
    stockAmount
  }
}

# 更新用户资料
mutation UpdateUser {
  updateUser(id: 456, data: {
    fullName: "张三丰"
    bio: "武当派创始人"
    avatar: "/uploads/zhangsan-avatar.jpg"
  }) {
    id
    fullName
    bio
    avatar
  }
}
```

**删除操作**
```graphql
# 删除产品
mutation DeleteProduct {
  deleteProduct(id: 123)
}

# 批量删除产品
mutation DeleteManyProducts {
  deleteManyProducts(
    input: { ids: [123, 124, 125] }
    filterParams: { categoryId: 5 }
  )
}
```

**订单相关操作**
```graphql
# 创建订单
mutation CreateOrder {
  createOrder(data: {
    cart: "[{\"productId\":1,\"quantity\":2}]"
    customerName: "李四"
    customerEmail: "lisi@example.com"
    customerPhone: "13800138000"
    customerAddress: "北京市朝阳区某某街道123号"
    shippingMethod: "standard"
    paymentMethod: "credit_card"
  }) {
    id
    orderTotalPrice
    status
  }
}

# 更新订单状态
mutation UpdateOrder {
  updateOrder(id: 789, data: {
    status: "shipped"
  }) {
    id
    status
    updateDate
  }
}
```

### 分页参数

```typescript
// 分页参数输入
PagedParamsInput {
  pageNumber?: Int        // 页码（从0开始）
  pageSize?: Int         // 每页条数
  orderBy?: String       // 排序字段
  order?: "ASC" | "DESC" // 排序方向
}

// 分页响应元数据
PagedMeta {
  totalElements: Int     // 总条数
  totalPages: Int        // 总页数
  pageNumber: Int        // 当前页码
  pageSize: Int          // 每页条数
}
```

## 🔌 REST API

### 认证端点 (`/api/v1/auth`)

#### 登录和会话管理

**基于 Cookie 的登录**
```bash
curl -X POST http://localhost:4016/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'

# 响应
{
  "id": 1,
  "fullName": "管理员",
  "email": "admin@example.com",
  "avatar": "/uploads/admin-avatar.jpg",
  "roles": ["admin"]
}
# 同时设置 HTTP-only cookies
```

**基于 Token 的登录**
```bash
curl -X POST http://localhost:4016/api/v1/auth/get-tokens \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'

# 响应
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "fullName": "管理员",
    "email": "admin@example.com"
  }
}
```

**刷新访问令牌**
```bash
curl -X POST http://localhost:4016/api/v1/auth/update-access-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'

# 响应
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**获取用户信息**
```bash
curl -X GET http://localhost:4016/api/v1/auth/user-info \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 响应
{
  "id": 1,
  "fullName": "管理员",
  "email": "admin@example.com",
  "roles": ["admin"],
  "permissions": ["read_products", "create_product", ...]
}
```

**用户注册**
```bash
curl -X POST http://localhost:4016/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "新用户",
    "email": "newuser@example.com",
    "password": "securePassword123"
  }'

# 响应
{
  "id": 2,
  "fullName": "新用户",
  "email": "newuser@example.com",
  "roles": ["customer"]
}
```

#### 密码重置

**发送重置邮件**
```bash
curl -X POST http://localhost:4016/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'

# 响应
true
```

**重置密码**
```bash
curl -X POST http://localhost:4016/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "newPassword": "newSecurePassword123"
  }'

# 响应
true
```

### CMS 管理端点 (`/api/v1/cms`)

#### 设置和配置

**获取公共设置**
```bash
curl -X GET http://localhost:4016/api/v1/cms/settings

# 响应
{
  "themeName": "theme-store",
  "language": "zh-CN",
  "currencyCode": "CNY",
  "timezone": "Asia/Shanghai",
  "publicSettings": {
    "siteName": "我的商店",
    "siteDescription": "最好的在线商店"
  }
}
```

**获取管理员设置（需要权限）**
```bash
curl -X GET http://localhost:4016/api/v1/cms/admin-settings \
  -H "Authorization: Bearer your-admin-token"

# 响应
{
  "smtpConnectionString": "smtp://user:pass@smtp.example.com:587",
  "sendFromEmail": "noreply@example.com",
  "paymentMethods": ["stripe", "paypal"],
  "shippingMethods": ["standard", "express"],
  "adminSettings": {
    "maxProductsPerPage": 20,
    "enableProductReviews": true
  }
}
```

#### 主题和插件管理

**获取已安装主题**
```bash
curl -X GET http://localhost:4016/api/v1/cms/themes \
  -H "Authorization: Bearer your-admin-token"

# 响应
[
  {
    "name": "theme-store",
    "version": "1.0.0",
    "isInstalled": true,
    "isActive": true,
    "title": "电商主题",
    "description": "功能齐全的电商主题"
  },
  {
    "name": "theme-blog",
    "version": "1.0.0",
    "isInstalled": true,
    "isActive": false,
    "title": "博客主题",
    "description": "简洁的博客主题"
  }
]
```

**激活主题**
```bash
curl -X GET "http://localhost:4016/api/v1/cms/activate-theme?themeName=theme-blog" \
  -H "Authorization: Bearer your-admin-token"

# 响应
true
```

**获取已安装插件**
```bash
curl -X GET http://localhost:4016/api/v1/cms/plugins \
  -H "Authorization: Bearer your-admin-token"

# 响应
[
  {
    "name": "stripe",
    "version": "1.0.0",
    "isInstalled": true,
    "isActive": true,
    "title": "Stripe 支付",
    "description": "Stripe 支付集成"
  },
  {
    "name": "newsletter",
    "version": "1.0.0",
    "isInstalled": true,
    "isActive": false,
    "title": "邮件订阅",
    "description": "邮件订阅功能"
  }
]
```

#### 文件管理

**上传文件**
```bash
curl -X POST "http://localhost:4016/api/v1/cms/upload-public-file?inPath=products&fileName=product-image.jpg" \
  -H "Authorization: Bearer your-admin-token" \
  -F "file=@/path/to/product-image.jpg"

# 响应
{
  "success": true,
  "message": "文件上传成功"
}
```

**读取目录**
```bash
curl -X GET "http://localhost:4016/api/v1/cms/read-public-dir?path=products" \
  -H "Authorization: Bearer your-admin-token"

# 响应
["product-image.jpg", "product-image-2.jpg", "subfolder/"]
```

## 🔐 认证和权限

### JWT 令牌结构

**访问令牌 (Access Token)**
```json
{
  "sub": 1,
  "email": "admin@example.com",
  "roles": ["admin"],
  "permissions": ["read_products", "create_product", "update_product"],
  "iat": 1640995200,
  "exp": 1641000000
}
```

**使用方式**
```bash
# Bearer Token 方式
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# GraphQL 请求示例
curl -X POST http://localhost:4016/api/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "query": "query { getProducts { elements { id name price } } }"
  }'
```

### 权限系统

**产品相关权限**
- `read_products` - 读取产品
- `create_product` - 创建产品  
- `update_product` - 更新产品
- `delete_product` - 删除产品
- `read_product_categories` - 读取产品分类
- `create_product_category` - 创建产品分类

**用户相关权限**
- `read_users` - 读取用户
- `create_user` - 创建用户
- `update_user` - 更新用户
- `delete_user` - 删除用户
- `read_my_user` - 读取自己的用户信息

**系统相关权限**
- `read_cms_settings` - 读取 CMS 设置
- `update_cms_settings` - 更新 CMS 设置
- `read_themes` - 读取主题
- `activate_theme` - 激活主题
- `read_plugins` - 读取插件
- `activate_plugin` - 激活插件
- `upload_file` - 上传文件
- `download_file` - 下载文件

## 🚨 错误处理

### GraphQL 错误响应
```json
{
  "errors": [
    {
      "message": "Access denied",
      "path": ["getProductById"],
      "statusCode": 403,
      "status": "FORBIDDEN",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "data": null
}
```

### REST API 错误响应
```json
{
  "message": "Validation failed",
  "statusCode": 400,
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "details": {
    "email": ["email must be a valid email address"],
    "password": ["password must be at least 8 characters"]
  }
}
```

### 常见错误码

| 状态码 | 描述 | 示例场景 |
|--------|------|----------|
| 400 | 请求参数错误 | 缺少必填字段、数据格式错误 |
| 401 | 未认证 | 缺少认证令牌或令牌过期 |
| 403 | 权限不足 | 用户角色权限不够 |
| 404 | 资源不存在 | 请求的产品或用户不存在 |
| 409 | 冲突 | 邮箱已存在、SKU 重复 |
| 422 | 数据验证失败 | 数据格式正确但业务逻辑验证失败 |
| 500 | 服务器内部错误 | 数据库连接失败、未捕获异常 |

## 📋 实用示例

### 完整电商流程示例

1. **用户注册和登录**
```bash
# 注册用户
curl -X POST http://localhost:4016/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"fullName":"张三","email":"zhangsan@example.com","password":"password123"}'

# 登录获取令牌
curl -X POST http://localhost:4016/api/v1/auth/get-tokens \
  -H "Content-Type: application/json" \
  -d '{"email":"zhangsan@example.com","password":"password123"}'
```

2. **浏览产品**
```graphql
# 获取产品列表
query BrowseProducts {
  getProducts(pagedParams: {pageSize: 12}) {
    elements {
      id
      name
      price
      mainImage
      rating { average }
    }
  }
  getRootCategories {
    id
    name
    children { id name }
  }
}
```

3. **查看产品详情**
```graphql
# 获取产品详细信息
query ProductDetails {
  getProductBySlug(slug: "macbook-air") {
    id
    name
    price
    oldPrice
    description
    images
    stockAmount
    attributes { key values }
    variants {
      id
      name
      price
      attributes { key values }
    }
    reviews(pagedParams: {pageSize: 5}) {
      elements {
        id
        rating
        title
        review
        author { fullName }
        createDate
      }
    }
  }
}
```

4. **创建订单**
```graphql
# 创建订单
mutation CreateOrder {
  createOrder(data: {
    cart: "[{\"productId\":1,\"quantity\":2,\"variantId\":null}]"
    customerName: "张三"
    customerEmail: "zhangsan@example.com"
    customerPhone: "13800138000"
    customerAddress: "北京市朝阳区某某街道123号"
    shippingMethod: "standard"
    paymentMethod: "credit_card"
  }) {
    id
    orderTotalPrice
    status
  }
}
```

### 内容管理示例

1. **创建博客文章**
```graphql
mutation CreatePost {
  createPost(data: {
    title: "如何选择合适的笔记本电脑"
    slug: "how-to-choose-laptop"
    content: "<p>选择笔记本电脑时需要考虑以下几个因素...</p>"
    excerpt: "笔记本电脑选购指南"
    publishDate: "2024-01-01T08:00:00Z"
    isEnabled: true
    featuredImage: "/uploads/laptop-guide.jpg"
    authorId: 1
    tagIds: [1, 2, 3]
  }) {
    id
    title
    slug
    publishDate
  }
}
```

2. **管理产品分类**
```graphql
# 创建产品分类
mutation CreateCategory {
  createProductCategory(data: {
    name: "笔记本电脑"
    slug: "laptops"
    description: "各种品牌的笔记本电脑"
    parentId: 1
    image: "/uploads/laptops-category.jpg"
  }) {
    id
    name
    slug
    parent { name }
  }
}
```

这份 API 文档提供了 Cromwell CMS 的全面 API 使用指南，包含了认证、CRUD 操作、文件管理等各个方面的详细示例。