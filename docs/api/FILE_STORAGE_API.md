# File Storage API

> 文件存储系统 API 文档

## 概述

File Storage API 提供完整的文件管理功能，包括上传、下载、元数据管理和 CDN 集成。支持直接上传和大文件分片上传。

## 基础信息

- **路由前缀**: `trpc.files.*`
- **认证**: 需要登录（protectedProcedure）
- **权限**: 基于操作的权限检查

## 权限模型

| 操作 | 权限 |
|------|------|
| 上传文件 | `file:create` |
| 读取/下载 | `file:read` |
| 删除文件 | `file:delete` |

---

## API 端点

### files.upload

直接上传文件（Base64 编码）

> 适用于小文件（< 10MB）。大文件请使用分片上传。

```typescript
// 请求
{
  filename: string;        // 文件名 (1-255 字符)
  contentType: string;     // MIME 类型
  content: string;         // Base64 编码的文件内容
  isPublic?: boolean;      // 是否公开访问，默认 false
  metadata?: Record<string, unknown>;  // 自定义元数据
}

// 响应
{
  id: string;              // 文件 ID
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;      // 存储路径
  publicUrl: string | null;// 公开访问 URL（仅 isPublic=true 时）
  createdAt: Date;
}
```

**示例**:
```typescript
const file = await trpc.files.upload.mutate({
  filename: 'document.pdf',
  contentType: 'application/pdf',
  content: btoa(fileContent),  // Base64 编码
  isPublic: true,
  metadata: { author: 'John Doe' },
});

console.log(`File ID: ${file.id}`);
console.log(`Public URL: ${file.publicUrl}`);
```

---

### files.get

获取文件元数据

```typescript
// 请求
{
  fileId: string;
}

// 响应
{
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  publicUrl: string | null;
  isPublic: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### files.getSignedUrl

获取签名下载 URL（用于私有文件）

```typescript
// 请求
{
  fileId: string;
  expiresIn?: number;  // 过期时间（秒），默认 3600，范围 60-86400
}

// 响应
{
  url: string;         // 签名 URL
  expiresAt: Date;     // 过期时间
}
```

**示例**:
```typescript
const { url, expiresAt } = await trpc.files.getSignedUrl.query({
  fileId: 'file-123',
  expiresIn: 7200,  // 2 小时
});

// 使用签名 URL 下载
window.open(url);
```

---

### files.getUploadUrl

获取预签名上传 URL（用于客户端直传）

```typescript
// 请求
{
  filename: string;
  contentType: string;
}

// 响应
{
  uploadUrl: string;   // 预签名上传 URL
  fileId: string;      // 预分配的文件 ID
  expiresAt: Date;
}
```

**示例**:
```typescript
// 1. 获取上传 URL
const { uploadUrl, fileId } = await trpc.files.getUploadUrl.query({
  filename: 'video.mp4',
  contentType: 'video/mp4',
});

// 2. 客户端直接上传到存储服务
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'video/mp4' },
});

// 3. 使用 fileId 进行后续操作
```

---

### files.list

列出文件

```typescript
// 请求
{
  search?: string;     // 搜索文件名
  mimeType?: string;   // 按 MIME 类型过滤
  page?: number;       // 页码，默认 1
  pageSize?: number;   // 每页数量，默认 20，最大 100
}

// 响应
{
  files: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    publicUrl: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
```

**示例**:
```typescript
// 搜索 PDF 文件
const result = await trpc.files.list.query({
  search: 'report',
  mimeType: 'application/pdf',
  page: 1,
  pageSize: 20,
});
```

---

### files.delete

删除文件（软删除）

```typescript
// 请求
{
  fileId: string;
}

// 响应
{
  deleted: true;
}
```

---

### files.restore

恢复已删除的文件

```typescript
// 请求
{
  fileId: string;
}

// 响应
{
  restored: true;
}
```

---

## 分片上传

大文件（> 10MB）应使用分片上传。

### files.initiateMultipart

初始化分片上传

```typescript
// 请求
{
  filename: string;
  mimeType: string;
  totalSize: number;   // 总文件大小（字节）
}

// 响应
{
  uploadId: string;    // 上传会话 ID
  key: string;         // 存储路径
}
```

---

### files.uploadPart

上传分片

```typescript
// 请求
{
  uploadId: string;
  partNumber: number;  // 分片序号，从 1 开始
  content: string;     // Base64 编码的分片内容
}

// 响应
{
  etag: string;        // 分片 ETag
  partNumber: number;
}
```

---

### files.completeMultipart

完成分片上传

```typescript
// 请求
{
  uploadId: string;
}

// 响应
{
  id: string;          // 文件 ID
  filename: string;
  publicUrl: string | null;
}
```

---

### files.abortMultipart

取消分片上传

```typescript
// 请求
{
  uploadId: string;
}

// 响应
{
  aborted: true;
}
```

---

## 分片上传完整示例

```typescript
// 1. 初始化上传
const { uploadId, key } = await trpc.files.initiateMultipart.mutate({
  filename: 'large-video.mp4',
  mimeType: 'video/mp4',
  totalSize: 500 * 1024 * 1024,  // 500MB
});

// 2. 分片上传（每片 5MB）
const chunkSize = 5 * 1024 * 1024;
const parts = [];

for (let i = 0; i < file.size; i += chunkSize) {
  const chunk = file.slice(i, i + chunkSize);
  const partNumber = Math.floor(i / chunkSize) + 1;

  const { etag } = await trpc.files.uploadPart.mutate({
    uploadId,
    partNumber,
    content: btoa(await chunk.text()),
  });

  parts.push({ partNumber, etag });
}

// 3. 完成上传
const result = await trpc.files.completeMultipart.mutate({
  uploadId,
});

console.log(`File uploaded: ${result.id}`);
```

---

## 存储结构

文件按租户和日期组织：

```
{organizationId}/
  └── {year}/
      └── {month}/
          └── {filename-uuid}
```

示例：`org-123/2025/01/document-abc123.pdf`

---

## CDN 集成

公开文件自动通过 CDN 分发：

- **公开文件**: 直接通过 `publicUrl` 访问
- **私有文件**: 使用 `getSignedUrl` 获取临时访问 URL

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | 缺少租户或用户上下文 |
| `FORBIDDEN` | 权限不足 |
| `NOT_FOUND` | 文件不存在 |
| `PAYLOAD_TOO_LARGE` | 文件超过大小限制 |
| `UNSUPPORTED_MEDIA_TYPE` | 不支持的文件类型 |

---

## 文件类型限制

默认允许的文件类型：

- 图片: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- 文档: `application/pdf`, `application/msword`, `text/plain`
- 视频: `video/mp4`, `video/webm`
- 音频: `audio/mpeg`, `audio/wav`

禁止上传的类型：

- 可执行文件: `.exe`, `.dll`, `.bat`, `.sh`
- 脚本文件: `.js`, `.vbs`, `.ps1`

---

## 最佳实践

1. **小文件直传**: < 10MB 使用 `upload`
2. **大文件分片**: > 10MB 使用分片上传
3. **客户端直传**: 使用 `getUploadUrl` 减少服务器负载
4. **私有文件**: 默认 `isPublic: false`，按需生成签名 URL
5. **元数据**: 使用 `metadata` 存储业务相关信息
