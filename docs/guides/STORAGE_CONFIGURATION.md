# Storage Configuration Guide

> 文件存储系统配置指南

## 概述

WordRhyme 支持多种存储后端，通过 Settings 系统进行配置。本指南介绍如何配置本地存储、S3 兼容存储以及 CDN 集成。

---

## 存储提供者

### 内置提供者

| 提供者 | 类型标识 | 说明 |
|--------|----------|------|
| 本地存储 | `local` | 文件系统存储（默认） |

### 插件提供者

| 插件 | 类型标识 | 说明 |
|------|----------|------|
| storage-s3 | `plugin_storage_s3_s3` | AWS S3 / 兼容服务 |

---

## 基础配置

### Settings 配置路径

存储配置通过 Settings API 管理：

```typescript
// 获取当前配置
const config = await trpc.settings.get.query({
  key: 'storage.provider',
});

// 更新配置
await trpc.settings.set.mutate({
  key: 'storage.provider',
  value: {
    type: 'local',
    config: {
      basePath: '/data/uploads',
    },
  },
});
```

---

## 本地存储配置

### 配置项

```typescript
{
  type: 'local',
  config: {
    basePath: string;       // 存储根目录（必填）
    baseUrl?: string;       // 公开访问 URL 前缀
    signedUrlSecret?: string; // 签名 URL 密钥（自动生成）
    signedUrlExpiry?: number; // 签名 URL 有效期（秒，默认 3600）
  }
}
```

### 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.provider',
  value: {
    type: 'local',
    config: {
      basePath: '/var/wordrhyme/uploads',
      baseUrl: 'https://files.example.com',
      signedUrlExpiry: 7200,
    },
  },
});
```

### 目录结构

本地存储自动创建以下目录结构：

```
{basePath}/
├── tenants/
│   └── {organizationId}/
│       └── files/
│           └── {YYYY-MM-DD}/
│               └── {uuid}.{ext}
```

### 权限要求

- 存储目录需要读写权限
- 建议使用专用用户运行服务
- 生产环境建议使用 NFS/NAS 共享存储

---

## S3 存储配置

### 前置条件

1. 安装 storage-s3 插件
2. 创建 S3 Bucket
3. 配置 IAM 权限

### 配置项

```typescript
{
  type: 'plugin_storage_s3_s3',
  config: {
    bucket: string;           // S3 Bucket 名称（必填）
    region: string;           // AWS 区域（必填）
    accessKeyId: string;      // Access Key ID（必填）
    secretAccessKey: string;  // Secret Access Key（必填）
    endpoint?: string;        // 自定义端点（用于 MinIO 等）
    forcePathStyle?: boolean; // 使用路径风格（默认 false）
    publicUrlPrefix?: string; // 公开 URL 前缀
    signedUrlExpiry?: number; // 签名 URL 有效期（秒）
  }
}
```

### AWS S3 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.provider',
  value: {
    type: 'plugin_storage_s3_s3',
    config: {
      bucket: 'wordrhyme-files',
      region: 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      signedUrlExpiry: 3600,
    },
  },
});
```

### MinIO 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.provider',
  value: {
    type: 'plugin_storage_s3_s3',
    config: {
      bucket: 'wordrhyme',
      region: 'us-east-1',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
    },
  },
});
```

### IAM 权限策略

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::wordrhyme-files",
        "arn:aws:s3:::wordrhyme-files/*"
      ]
    }
  ]
}
```

---

## CDN 配置

### 配置项

```typescript
// CDN 配置
await trpc.settings.set.mutate({
  key: 'storage.cdn',
  value: {
    enabled: boolean;           // 是否启用 CDN
    baseUrl: string;            // CDN 域名
    signedUrls?: {
      enabled: boolean;         // 是否使用签名 URL
      keyPairId?: string;       // CloudFront Key Pair ID
      privateKey?: string;      // 私钥（PEM 格式）
      expiry?: number;          // 过期时间（秒）
    };
  },
});
```

### CloudFront 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.cdn',
  value: {
    enabled: true,
    baseUrl: 'https://d1234567890.cloudfront.net',
    signedUrls: {
      enabled: true,
      keyPairId: 'APKAXXXXXXXXXXXXXXXX',
      privateKey: process.env.CLOUDFRONT_PRIVATE_KEY,
      expiry: 86400,
    },
  },
});
```

### 通用 CDN 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.cdn',
  value: {
    enabled: true,
    baseUrl: 'https://cdn.example.com/files',
    signedUrls: {
      enabled: false,
    },
  },
});
```

---

## 文件验证配置

### 配置项

```typescript
await trpc.settings.set.mutate({
  key: 'storage.validation',
  value: {
    maxFileSize: number;              // 最大文件大小（字节）
    allowedMimeTypes: string[];       // 允许的 MIME 类型
    blockedExtensions?: string[];     // 禁止的扩展名
  },
});
```

### 示例

```typescript
await trpc.settings.set.mutate({
  key: 'storage.validation',
  value: {
    maxFileSize: 50 * 1024 * 1024,  // 50MB
    allowedMimeTypes: [
      'image/*',
      'application/pdf',
      'text/plain',
      'application/zip',
    ],
    blockedExtensions: ['.exe', '.bat', '.sh'],
  },
});
```

---

## 图片变体配置

### 配置项

```typescript
await trpc.settings.set.mutate({
  key: 'storage.imageVariants',
  value: {
    thumbnail: { width: 150, height: 150, fit: 'cover' },
    small: { width: 320, fit: 'inside' },
    medium: { width: 640, fit: 'inside' },
    large: { width: 1280, fit: 'inside' },
    // 自定义变体
    hero: { width: 1920, height: 600, fit: 'cover' },
  },
});
```

### 变体选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `width` | number | 目标宽度 |
| `height` | number | 目标高度（可选） |
| `fit` | string | 裁剪模式：`cover`, `contain`, `inside`, `outside` |
| `format` | string | 输出格式：`jpeg`, `png`, `webp`, `avif` |
| `quality` | number | 压缩质量（1-100） |

---

## 环境变量

推荐通过环境变量管理敏感配置：

```bash
# 本地存储
STORAGE_LOCAL_BASE_PATH=/var/wordrhyme/uploads
STORAGE_LOCAL_BASE_URL=https://files.example.com

# S3 存储
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=wordrhyme-files

# CDN
CDN_BASE_URL=https://cdn.example.com
CLOUDFRONT_KEY_PAIR_ID=APKAXXXXXXXXXXXXXXXX
CLOUDFRONT_PRIVATE_KEY_PATH=/path/to/private-key.pem
```

---

## 迁移存储提供者

### 迁移步骤

1. **配置新提供者**（不切换）
2. **运行迁移脚本**同步现有文件
3. **验证迁移完整性**
4. **切换活动提供者**
5. **清理旧存储**（可选）

### 迁移命令

```bash
# 预览迁移
pnpm storage:migrate --from=local --to=s3 --dry-run

# 执行迁移
pnpm storage:migrate --from=local --to=s3

# 验证
pnpm storage:verify --provider=s3
```

---

## 故障排除

### 常见问题

**Q: 上传失败 - Permission Denied**
- 检查存储目录权限
- 检查 S3 IAM 策略

**Q: 签名 URL 失效**
- 检查服务器时间同步
- 调整 `signedUrlExpiry` 配置

**Q: CDN 无法访问**
- 检查 CDN 源站配置
- 检查 CORS 设置

**Q: 图片变体生成失败**
- 检查 Sharp 依赖是否正确安装
- 检查文件格式是否支持

### 日志位置

```bash
# 存储相关日志
tail -f logs/storage.log

# 查看上传错误
grep "storage:error" logs/app.log
```

---

## 最佳实践

1. **生产环境使用对象存储**：S3/MinIO 提供更好的可靠性和扩展性
2. **启用 CDN**：减少源站压力，提升访问速度
3. **使用签名 URL**：保护私有文件，控制访问有效期
4. **配置文件验证**：防止恶意文件上传
5. **定期备份**：对象存储开启版本控制
6. **监控存储用量**：设置告警阈值

---

## 相关文档

- [File Storage API](../api/FILE_STORAGE_API.md)
- [Asset API](../api/ASSET_API.md)
- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md)
