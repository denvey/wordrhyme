# Asset API

> CMS 资产管理系统 API 文档

## 概述

Asset API 提供 CMS 资产管理功能，支持图片变体生成、标签管理、文件夹组织等功能。Asset 是对 File 的业务层封装，添加了 CMS 语义。

## 基础信息

- **路由前缀**: `trpc.assets.*`
- **认证**: 需要登录（protectedProcedure）
- **依赖**: File Storage API

## 权限模型

| 操作 | 权限 |
|------|------|
| 创建资产 | `asset:create` |
| 读取资产 | `asset:read` |
| 更新元数据 | `asset:update` |
| 删除资产 | `asset:delete` |

---

## API 端点

### assets.create

从文件创建资产

```typescript
// 请求
{
  fileId: string;           // 关联的文件 ID
  type?: 'image' | 'video' | 'document' | 'other';  // 资产类型（自动检测）
  alt?: string;             // Alt 文本（用于无障碍访问）
  title?: string;           // 标题（默认使用文件名）
  tags?: string[];          // 标签数组
  folderPath?: string;      // 文件夹路径（如 /photos/2025）
}

// 响应
{
  id: string;
  fileId: string;
  type: 'image' | 'video' | 'document' | 'other';
  alt: string | null;
  title: string;
  tags: string[];
  folderPath: string | null;
  width: number | null;     // 图片宽度
  height: number | null;    // 图片高度
  format: string | null;    // 图片格式
  createdAt: Date;
  updatedAt: Date;
}
```

**示例**:
```typescript
// 1. 先上传文件
const file = await trpc.files.upload.mutate({
  filename: 'hero-image.jpg',
  contentType: 'image/jpeg',
  content: btoa(imageData),
});

// 2. 创建资产
const asset = await trpc.assets.create.mutate({
  fileId: file.id,
  alt: 'Homepage hero image',
  title: 'Hero Banner',
  tags: ['homepage', 'banner'],
  folderPath: '/marketing/banners',
});
```

---

### assets.get

获取资产详情

```typescript
// 请求
{
  assetId: string;
}

// 响应
{
  id: string;
  fileId: string;
  type: 'image' | 'video' | 'document' | 'other';
  alt: string | null;
  title: string;
  tags: string[];
  folderPath: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  variants: AssetVariant[];  // 已生成的变体列表
  createdAt: Date;
  updatedAt: Date;
}
```

---

### assets.update

更新资产元数据

```typescript
// 请求
{
  assetId: string;
  alt?: string;
  title?: string;
  tags?: string[];
  folderPath?: string;
}

// 响应
{
  id: string;
  alt: string | null;
  title: string;
  tags: string[];
  folderPath: string | null;
  updatedAt: Date;
}
```

---

### assets.delete

删除资产（软删除）

```typescript
// 请求
{
  assetId: string;
}

// 响应
{
  deleted: true;
}
```

---

### assets.list

列出资产（支持过滤和分页）

```typescript
// 请求
{
  type?: 'image' | 'video' | 'document' | 'other';
  tags?: string[];          // 必须包含所有指定标签
  folderPath?: string;      // 文件夹路径前缀匹配
  search?: string;          // 搜索 alt/title
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;            // 默认 1
  pageSize?: number;        // 默认 20，最大 100
}

// 响应
{
  items: Asset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

**示例**:
```typescript
// 获取所有带 "banner" 标签的图片
const result = await trpc.assets.list.query({
  type: 'image',
  tags: ['banner'],
  folderPath: '/marketing',
  sortBy: 'createdAt',
  sortOrder: 'desc',
});
```

---

### assets.getVariantUrl

获取图片变体 URL

```typescript
// 请求
{
  assetId: string;
  variant: string;  // 变体名称：'original' | 'thumbnail' | 'small' | 'medium' | 'large'
}

// 响应
{
  url: string;
}
```

**预定义变体**:

| 变体名 | 尺寸 | 说明 |
|--------|------|------|
| `original` | 原始尺寸 | 原文件 |
| `thumbnail` | 150x150 | 缩略图（裁剪） |
| `small` | 320px 宽 | 小图（保持比例） |
| `medium` | 640px 宽 | 中图（保持比例） |
| `large` | 1280px 宽 | 大图（保持比例） |

**示例**:
```typescript
// 获取缩略图 URL
const { url } = await trpc.assets.getVariantUrl.query({
  assetId: 'asset-123',
  variant: 'thumbnail',
});

// 用于 img 标签
<img src={url} alt={asset.alt} />
```

---

### assets.getVariants

获取资产的所有变体

```typescript
// 请求
{
  assetId: string;
}

// 响应
{
  variants: Array<{
    name: string;
    fileId: string;
    width: number;
    height: number;
    format: string;
  }>;
}
```

---

## 资产类型检测

系统根据 MIME 类型自动检测资产类型：

| MIME 类型前缀 | 资产类型 |
|--------------|----------|
| `image/*` | `image` |
| `video/*` | `video` |
| `application/pdf`, `text/*` | `document` |
| 其他 | `other` |

---

## 图片变体生成

变体采用**懒加载**策略：

1. 首次请求变体时自动生成
2. 生成后缓存，后续请求直接返回
3. 仅图片类型资产支持变体

**支持的图片格式**:
- JPEG, PNG, WebP, GIF, AVIF, TIFF

---

## 文件夹组织

使用 `folderPath` 组织资产：

```typescript
// 创建带文件夹路径的资产
await trpc.assets.create.mutate({
  fileId: 'file-123',
  folderPath: '/products/electronics/phones',
});

// 按文件夹查询（前缀匹配）
const phones = await trpc.assets.list.query({
  folderPath: '/products/electronics',  // 匹配所有子文件夹
});
```

---

## 标签系统

使用 `tags` 进行分类和筛选：

```typescript
// 添加多个标签
await trpc.assets.create.mutate({
  fileId: 'file-123',
  tags: ['product', 'featured', 'sale'],
});

// 按标签筛选（AND 逻辑）
const featured = await trpc.assets.list.query({
  tags: ['featured', 'sale'],  // 必须同时包含两个标签
});
```

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | 缺少必需参数 |
| `FORBIDDEN` | 权限不足 |
| `NOT_FOUND` | 资产或文件不存在 |
| `INVALID_VARIANT` | 变体名称无效或不支持 |

---

## 插件 API

插件可通过 `ctx.assets` 访问资产能力：

```typescript
// 在插件中使用
export async function handler(ctx: PluginContext) {
  // 创建资产
  const asset = await ctx.assets.create('file-123', {
    alt: 'Product image',
    tags: ['product'],
  });

  // 获取变体 URL
  const url = await ctx.assets.getVariantUrl(asset.id, 'thumbnail');

  return { imageUrl: url };
}
```

**插件限制**:
- 只能访问当前组织的资产
- 需要在 manifest 中声明 `capabilities.assets`

---

## 最佳实践

1. **Alt 文本**: 始终为图片提供有意义的 alt 文本
2. **标签规范**: 使用小写、连字符分隔的标签（如 `product-photo`）
3. **文件夹结构**: 按业务逻辑组织（如 `/products/{category}`）
4. **变体使用**: 根据展示场景选择合适的变体尺寸
5. **批量操作**: 使用 list API 分页处理大量资产
