# Media API

> 统一媒体管理 API（合并原 File Storage API + Asset API）

## 概述

Media API 提供统一的媒体文件管理功能，包括上传、下载、元数据管理、图片变体生成、标签管理、文件夹组织和 CDN 集成。

## 基础信息

- **路由前缀**: `trpc.media.*`
- **认证**: 需要登录（protectedProcedure）
- **权限 Subject**: `Media`

## 权限模型

| 操作 | 权限 |
|------|------|
| 上传/创建 | `media:create` |
| 读取/下载 | `media:read` |
| 更新元数据 | `media:update` |
| 删除 | `media:delete` |

---

## API 端点

### media.upload

直接上传文件（Base64 编码）

```typescript
// 请求
{
  filename: string;
  contentType: string;
  content: string;           // Base64 编码
  isPublic?: boolean;
  alt?: string;
  title?: string;
  tags?: string[];
  folderPath?: string;
  storageProvider?: string;  // 存储提供商（默认使用系统设置）
}

// 响应: MediaInfo
```

### media.getUploadUrl

获取预签名上传 URL（推荐大文件使用）

```typescript
// 请求
{
  filename: string;
  contentType: string;
  isPublic?: boolean;
  storageProvider?: string;
}

// 响应
{
  uploadUrl: string;
  mediaId: string;
  storageKey: string;
}
```

### media.confirmUpload

确认预签名上传完成

```typescript
// 请求
{
  mediaId: string;
  fileSize: number;
}

// 响应: MediaInfo
```

### media.get

获取媒体详情

```typescript
// 请求
{ mediaId: string }

// 响应: MediaInfo
```

### media.update

更新媒体元数据

```typescript
// 请求
{
  mediaId: string;
  alt?: string;
  title?: string;
  tags?: string[];
  folderPath?: string;
  isPublic?: boolean;
}

// 响应: MediaInfo
```

### media.delete

删除媒体（软删除，级联删除变体）

```typescript
// 请求
{ mediaId: string }
// 响应
{ deleted: true }
```

### media.restore

恢复已删除的媒体

```typescript
// 请求
{ mediaId: string }
// 响应: MediaInfo
```

### media.list

列出媒体（支持过滤和分页）

```typescript
// 请求
{
  category?: 'image' | 'video' | 'audio' | 'document';  // MIME 类别
  mimeType?: string;
  tags?: string[];
  folderPath?: string;
  search?: string;
  storageProvider?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'filename' | 'size';
  sortOrder?: 'asc' | 'desc';
  page?: number;        // 默认 1
  pageSize?: number;    // 默认 20，最大 100
}

// 响应
{
  items: MediaInfo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### media.getSignedUrl

获取下载签名 URL

```typescript
// 请求
{ mediaId: string; expiresIn?: number }
// 响应
{ url: string; expiresIn: number }
```

### media.getVariants

获取媒体的所有变体

```typescript
// 请求
{ mediaId: string }
// 响应
{
  variants: Array<{
    name: string;
    mediaId: string;
    width: number;
    height: number;
    format: string;
  }>;
}
```

### media.getVariantUrl

获取变体 URL

```typescript
// 请求
{ mediaId: string; variant: string }
// 响应
{ url: string; variant: string }
```

### media.bulkDelete

批量删除媒体

```typescript
// 请求
{ mediaIds: string[] }
// 响应
{ deleted: number }
```

### media.moveToFolder

批量移动到文件夹

```typescript
// 请求
{ mediaIds: string[]; folderPath: string }
// 响应
{ moved: number }
```

### media.addTags

批量添加标签

```typescript
// 请求
{ mediaIds: string[]; tags: string[] }
// 响应
{ updated: number }
```

---

## MediaInfo 类型

```typescript
interface MediaInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  isPublic: boolean;
  storageKey: string;
  storageProvider: string;
  storageBucket: string | null;
  parentId: string | null;       // 变体指向原始媒体
  variantName: string | null;    // 变体名称
  width: number | null;
  height: number | null;
  format: string | null;
  alt: string | null;
  title: string | null;
  tags: string[] | null;
  folderPath: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

---

## 变体系统

变体通过 `parent_id` 关联到原始媒体。系统预定义变体：

| 变体名 | 尺寸 | 说明 |
|--------|------|------|
| `thumbnail` | 150x150 | 缩略图（裁剪） |
| `small` | 320px 宽 | 小图（保持比例） |
| `medium` | 640px 宽 | 中图（保持比例） |
| `large` | 1280px 宽 | 大图（保持比例） |

---

## 插件 API

插件通过 `ctx.media` 访问媒体能力：

```typescript
export async function handler(ctx: PluginContext) {
  // 上传媒体
  const media = await ctx.media.upload({
    content: Buffer.from(data),
    filename: 'product.jpg',
    mimeType: 'image/jpeg',
    alt: 'Product image',
    tags: ['product'],
  });

  // 获取变体 URL
  const url = await ctx.media.getVariantUrl(media.id, 'thumbnail');

  // 列出媒体
  const list = await ctx.media.list({ tags: ['product'] });

  return { imageUrl: url };
}
```

**插件限制**:
- 只能访问当前组织的媒体
- 需要在 manifest 中声明相应 capabilities
- 受文件大小和 MIME 类型限制
