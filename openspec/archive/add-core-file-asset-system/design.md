## Context

WordRhyme 作为 Headless CMS，需要一个健壮的文件/资源管理系统来支持：
1. **媒体库** - 图片、视频、文档的上传和管理
2. **内容关联** - 文件与内容模型的关联
3. **多存储后端** - 支持不同的存储提供者
4. **图片处理** - 动态生成不同尺寸的图片变体
5. **多租户隔离** - 文件按租户隔离

### Stakeholders
- 内容编辑 - 上传和管理媒体文件
- 开发者 - 通过 API 访问文件
- 插件开发者 - 通过 PluginContext 访问文件能力
- 平台管理员 - 配置存储后端和限制

### Constraints
- 遵循 DATA_MODEL_GOVERNANCE.md 的多租户数据模型
- 存储配置通过 Settings System 管理
- 敏感凭据（S3 keys 等）加密存储
- 大文件支持 multipart 上传
- 图片处理可选（不强制依赖）

---

## Goals / Non-Goals

### Goals
- 提供统一的存储抽象层
- 支持 Local, S3, OSS, R2 等存储后端
- 支持大文件 multipart 上传
- 提供签名 URL 机制（私有文件访问和直传）
- Asset 抽象支持图片变体
- 基本图片处理能力（resize, optimize）
- 完整的权限控制
- 文件访问审计

### Non-Goals
- 视频转码 - 后续版本
- 实时协作编辑 - 不在范围内
- 复杂图片编辑（裁剪、旋转）- 后续版本
- 版本控制 - 后续版本
- 全文搜索（文档内容）- 后续版本

---

## Decisions

### D1: 存储抽象模型

**Decision**: 使用 Provider Pattern，通过统一接口抽象不同存储后端

```typescript
// 存储提供者接口
interface StorageProvider {
  readonly type: 'local' | 's3' | 'oss' | 'r2';

  upload(input: UploadInput): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  // 签名 URL - 支持 GET 和 PUT 操作
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  getPublicUrl(key: string): string | null;

  // Multipart 操作
  initiateMultipartUpload(key: string): Promise<string>; // uploadId
  uploadPart(uploadId: string, partNumber: number, body: Buffer): Promise<PartResult>;
  completeMultipartUpload(uploadId: string, parts: PartResult[]): Promise<void>;
  abortMultipartUpload(uploadId: string): Promise<void>;
}

interface UploadInput {
  key: string;           // 存储路径
  body: Buffer | Stream;
  contentType: string;
  metadata?: Record<string, string>;
}

interface UploadResult {
  key: string;
  size: number;
  etag?: string;
}

interface SignedUrlOptions {
  expiresIn: number;     // 秒
  operation: 'get' | 'put';
  contentType?: string;  // PUT 时需要指定
}

interface PartResult {
  partNumber: number;
  etag: string;
}
```

**Rationale**:
- 统一接口便于切换存储后端
- 支持 multipart 处理大文件
- 签名 URL 支持 GET（下载）和 PUT（直传）两种操作

#### Provider 实现

```typescript
// Local Provider
class LocalStorageProvider implements StorageProvider {
  readonly type = 'local';
  private basePath: string;

  constructor(config: { basePath: string }) {
    this.basePath = config.basePath;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const filePath = path.join(this.basePath, input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.body);
    return { key: input.key, size: Buffer.byteLength(input.body) };
  }

  // Local provider 使用内部 API 路由（由服务端验证权限）
  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const token = this.generateAccessToken(key, options.expiresIn, options.operation);
    if (options.operation === 'put') {
      // 直传端点
      return `/api/files/upload/${encodeURIComponent(key)}?token=${token}`;
    }
    return `/api/files/${encodeURIComponent(key)}?token=${token}`;
  }
}

// S3 Provider - 支持 GET 和 PUT 签名 URL
class S3StorageProvider implements StorageProvider {
  readonly type = 's3';
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint, // 支持 MinIO 等兼容 S3
    });
    this.bucket = config.bucket;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }));
    return { key: input.key, size: Buffer.byteLength(input.body) };
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    if (options.operation === 'put') {
      // 生成 PUT 签名 URL 用于客户端直传
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.contentType,
      });
      return getSignedUrl(this.client, command, { expiresIn: options.expiresIn });
    }

    // GET 签名 URL
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresIn });
  }
}
```

---

### D2: 数据库模型

**Decision**: 分离 Files (原始文件) 和 Assets (带处理的资源)

```sql
-- 文件表：存储原始文件信息
files (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),

  -- 文件信息
  filename TEXT NOT NULL,          -- 原始文件名
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,            -- 字节数

  -- 存储信息
  storage_provider TEXT NOT NULL,  -- 'local', 's3', 'oss', 'r2'
  storage_key TEXT NOT NULL,       -- 存储路径/key
  storage_bucket TEXT,             -- bucket 名称 (cloud only)

  -- 公开访问
  public_url TEXT,                 -- CDN URL (如果公开)
  is_public BOOLEAN DEFAULT false,

  -- 元数据
  metadata JSONB DEFAULT '{}',     -- 自定义元数据
  checksum TEXT,                   -- SHA256

  -- 审计
  uploaded_by TEXT NOT NULL,       -- userId
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,            -- 软删除

  -- 唯一性
  UNIQUE(tenant_id, storage_provider, storage_key)
)

-- 索引
CREATE INDEX idx_files_tenant ON files(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_mime ON files(tenant_id, mime_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_created ON files(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_deleted ON files(deleted_at) WHERE deleted_at IS NOT NULL;
```

```sql
-- 资源表：带处理的文件（图片、视频等）
assets (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- 资源类型
  type TEXT NOT NULL,              -- 'image', 'video', 'document', 'other'

  -- 图片特定信息 (仅 type='image' 时有值)
  width INT,                       -- 原始宽度
  height INT,                      -- 原始高度
  format TEXT,                     -- 'jpeg', 'png', 'webp', etc.

  -- 组织
  alt TEXT,                        -- 替代文本
  title TEXT,                      -- 标题
  tags TEXT[] DEFAULT '{}',        -- 标签
  folder_path TEXT,                -- 虚拟文件夹路径

  -- 审计
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
)

-- 索引
CREATE INDEX idx_assets_tenant ON assets(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_type ON assets(tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_folder ON assets(tenant_id, folder_path) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_tags ON assets USING GIN(tags) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_deleted ON assets(deleted_at) WHERE deleted_at IS NOT NULL;
```

```sql
-- 资源变体表：处理后的版本 (仅图片)
asset_variants (
  id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- 变体信息 (记录实际输出值，非预设值)
  variant_name TEXT NOT NULL,      -- 'thumbnail', 'medium', 'large', 'original'
  width INT NOT NULL,              -- 实际输出宽度
  height INT NOT NULL,             -- 实际输出高度
  format TEXT NOT NULL,            -- 实际输出格式 (可能与原始不同)

  -- 处理参数
  transform_params JSONB,          -- { quality: 80, fit: 'cover' }

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(asset_id, variant_name)
)

CREATE INDEX idx_variants_asset ON asset_variants(asset_id);
```

#### Files vs Assets 的区别

| 层级 | 说明 | 示例 |
|------|------|------|
| File | 原始文件，纯存储 | 用户上传的 photo.jpg |
| Asset | 资源抽象，带处理和元数据 | 图片 asset 包含 alt、tags、variants |
| Variant | 处理后的版本 (仅图片) | thumbnail (200x200)、webp 优化版 |

**Rationale**:
- File 层纯粹处理存储，不关心业务语义
- Asset 层处理 CMS 业务逻辑（标签、分类、处理）
- 分离关注点，便于扩展

---

### D3: 存储路径策略

**Decision**: 租户隔离 + 日期分区 + 唯一 ID

```typescript
function generateStorageKey(tenantId: string, file: UploadFile): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const uuid = generateUUID();
  const ext = getExtension(file.filename);

  // 格式: tenants/{tenantId}/files/{year}/{month}/{day}/{uuid}.{ext}
  return `tenants/${tenantId}/files/${year}/${month}/${day}/${uuid}${ext}`;
}

// 变体路径 - 使用实际输出格式的扩展名
function generateVariantKey(
  originalKey: string,
  variantName: string,
  outputFormat: string  // 实际输出格式
): string {
  const dir = path.dirname(originalKey);
  const name = path.basename(originalKey, path.extname(originalKey));
  const ext = `.${outputFormat}`; // 使用输出格式的扩展名

  // 格式: tenants/{tenantId}/files/{date}/{uuid}/{variant}.{outputFormat}
  return `${dir}/${name}/${variantName}${ext}`;
}
```

**Rationale**:
- 租户 ID 前缀确保数据隔离
- 日期分区便于管理和清理
- UUID 防止冲突
- 变体使用实际输出格式的扩展名，避免 Content-Type 不匹配

---

### D4: Multipart 上传

**Decision**: 支持大文件分片上传，阈值 5MB

```typescript
const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB
const PART_SIZE = 5 * 1024 * 1024; // 5MB per part
const MULTIPART_EXPIRY_HOURS = 24;

interface MultipartUploadState {
  id: string;
  uploadId: string;
  tenantId: string;
  key: string;
  filename: string;
  mimeType: string;
  totalParts: number;
  uploadedParts: Map<number, PartResult>; // partNumber -> result
  expiresAt: Date;
  createdAt: Date;
}
```

```sql
-- Multipart 上传状态表（临时）
multipart_uploads (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,         -- Provider 返回的 uploadId
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  total_size BIGINT,
  total_parts INT NOT NULL,
  -- parts 使用 Map 结构，key 为 partNumber，确保唯一性和顺序
  parts JSONB DEFAULT '{}',        -- { "1": { etag: "..." }, "2": { etag: "..." } }
  expires_at TIMESTAMP NOT NULL,   -- 过期时间（24小时）
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(upload_id)
)

CREATE INDEX idx_multipart_tenant ON multipart_uploads(tenant_id);
CREATE INDEX idx_multipart_expires ON multipart_uploads(expires_at);
```

#### 上传流程

```typescript
// 1. 初始化 multipart 上传
async function initiateUpload(input: InitiateInput): Promise<InitiateResult> {
  const key = generateStorageKey(input.tenantId, input.filename);
  const uploadId = await provider.initiateMultipartUpload(key);
  const totalParts = Math.ceil(input.totalSize / PART_SIZE);

  // 存储状态
  await db.insert(multipartUploads).values({
    id: generateUUID(),
    tenantId: input.tenantId,
    uploadId,
    storageProvider: provider.type,
    storageKey: key,
    filename: input.filename,
    mimeType: input.mimeType,
    totalSize: input.totalSize,
    totalParts,
    parts: {},  // 初始为空 Map
    expiresAt: addHours(new Date(), MULTIPART_EXPIRY_HOURS),
  });

  return {
    uploadId,
    key,
    partSize: PART_SIZE,
    totalParts,
  };
}

// 2. 上传分片 - 使用 Map 确保唯一性
async function uploadPart(input: UploadPartInput): Promise<PartResult> {
  const upload = await getMultipartUpload(input.uploadId);

  // 验证 partNumber 范围
  if (input.partNumber < 1 || input.partNumber > upload.totalParts) {
    throw new InvalidPartNumberError(
      `Part number must be between 1 and ${upload.totalParts}`
    );
  }

  const result = await provider.uploadPart(
    upload.uploadId,
    input.partNumber,
    input.body
  );

  // 使用 jsonb_set 更新特定 partNumber，自动处理重复上传
  await db.execute(sql`
    UPDATE multipart_uploads
    SET parts = jsonb_set(parts, ${[String(input.partNumber)]}, ${JSON.stringify(result)}::jsonb)
    WHERE upload_id = ${input.uploadId}
  `);

  return result;
}

// 3. 完成上传 - 验证所有分片并排序
async function completeUpload(uploadId: string): Promise<FileRecord> {
  const upload = await getMultipartUpload(uploadId);
  const parts = upload.parts as Record<string, PartResult>;

  // 验证所有分片都已上传
  const uploadedCount = Object.keys(parts).length;
  if (uploadedCount !== upload.totalParts) {
    throw new IncompletUploadError(
      `Missing parts: uploaded ${uploadedCount}/${upload.totalParts}`
    );
  }

  // 转换为有序数组
  const orderedParts: PartResult[] = [];
  for (let i = 1; i <= upload.totalParts; i++) {
    const part = parts[String(i)];
    if (!part) {
      throw new MissingPartError(`Part ${i} is missing`);
    }
    orderedParts.push({ partNumber: i, etag: part.etag });
  }

  await provider.completeMultipartUpload(upload.uploadId, orderedParts);

  // 创建文件记录 + 审计
  const file = await db.insert(files).values({
    tenantId: upload.tenantId,
    filename: upload.filename,
    mimeType: upload.mimeType,
    size: upload.totalSize,
    storageProvider: upload.storageProvider,
    storageKey: upload.storageKey,
    uploadedBy: ctx.userId,
  }).returning();

  await auditService.log({
    entityType: 'file',
    entityId: file.id,
    tenantId: upload.tenantId,
    action: 'create',
    metadata: { source: 'multipart_upload', size: upload.totalSize },
  });

  // 清理临时状态
  await db.delete(multipartUploads).where(eq(multipartUploads.uploadId, uploadId));

  return file;
}

// 4. 中止上传
async function abortUpload(uploadId: string): Promise<void> {
  const upload = await getMultipartUpload(uploadId);

  await provider.abortMultipartUpload(upload.uploadId);
  await db.delete(multipartUploads).where(eq(multipartUploads.uploadId, uploadId));
}
```

#### 过期上传清理任务

```typescript
// 定时任务：清理过期的 multipart 上传
@Cron('0 */15 * * * *') // 每 15 分钟执行
async function cleanupExpiredMultipartUploads(): Promise<void> {
  const now = new Date();

  // 查找过期的上传
  const expired = await db.select()
    .from(multipartUploads)
    .where(lt(multipartUploads.expiresAt, now));

  for (const upload of expired) {
    try {
      // 中止存储端的 multipart 上传
      const provider = getProvider(upload.storageProvider);
      await provider.abortMultipartUpload(upload.uploadId);

      // 删除数据库记录
      await db.delete(multipartUploads).where(eq(multipartUploads.id, upload.id));

      logger.info('Cleaned up expired multipart upload', {
        uploadId: upload.uploadId,
        tenantId: upload.tenantId,
      });
    } catch (error) {
      logger.error('Failed to cleanup multipart upload', { upload, error });
    }
  }
}
```

---

### D5: 图片处理

**Decision**: 使用 Sharp 库，按需生成变体，仅处理图片类型 Asset

```typescript
// 预定义变体配置
const VARIANT_PRESETS: Record<string, VariantConfig> = {
  thumbnail: { width: 200, height: 200, fit: 'cover', quality: 80 },
  small: { width: 400, height: 400, fit: 'inside', quality: 85 },
  medium: { width: 800, height: 800, fit: 'inside', quality: 85 },
  large: { width: 1600, height: 1600, fit: 'inside', quality: 90 },
  // original 不做处理，保持原样
};

interface VariantConfig {
  width?: number;
  height?: number;
  fit: 'cover' | 'contain' | 'inside' | 'fill';
  quality: number;
  format?: 'jpeg' | 'png' | 'webp';
}

// 图片尺寸限制 - 防止 OOM
const MAX_IMAGE_PIXELS = 100_000_000; // 100 megapixels (e.g., 10000x10000)
const MAX_IMAGE_DIMENSION = 16384;    // 最大单边尺寸
```

#### 处理流程

```typescript
async function processImageVariants(
  asset: Asset,
  variants: string[] = ['thumbnail', 'medium']
): Promise<void> {
  // 类型守卫：仅处理图片类型
  if (asset.type !== 'image') {
    throw new InvalidAssetTypeError(
      `Cannot process variants for non-image asset (type: ${asset.type})`
    );
  }

  const originalFile = await getFile(asset.fileId);
  const originalBuffer = await provider.download(originalFile.storageKey);

  // 创建 Sharp 实例并获取元数据
  const baseImage = sharp(originalBuffer);
  const metadata = await baseImage.metadata();

  // 验证图片尺寸限制
  if (metadata.width && metadata.height) {
    const pixels = metadata.width * metadata.height;
    if (pixels > MAX_IMAGE_PIXELS) {
      throw new ImageTooLargeError(
        `Image exceeds maximum pixel count: ${pixels} > ${MAX_IMAGE_PIXELS}`
      );
    }
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      throw new ImageTooLargeError(
        `Image dimension exceeds limit: ${metadata.width}x${metadata.height}`
      );
    }
  }

  // 更新 asset 元数据
  await db.update(assets).set({
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  }).where(eq(assets.id, asset.id));

  // 获取配置的默认输出格式
  const defaultFormat = await settingsService.get('storage.image.defaultFormat') || 'webp';

  // 生成变体
  for (const variantName of variants) {
    const config = VARIANT_PRESETS[variantName];
    if (!config) continue;

    // 为每个变体克隆 Sharp 实例，避免状态累积
    const image = baseImage.clone();

    const outputFormat = config.format ?? defaultFormat;

    const processed = await image
      .resize(config.width, config.height, { fit: config.fit })
      .toFormat(outputFormat, { quality: config.quality })
      .toBuffer({ resolveWithObject: true });  // 获取实际输出信息

    // 使用实际输出格式生成路径
    const variantKey = generateVariantKey(
      originalFile.storageKey,
      variantName,
      outputFormat
    );

    await provider.upload({
      key: variantKey,
      body: processed.data,
      contentType: `image/${outputFormat}`,
    });

    // 创建变体文件记录
    const variantFile = await db.insert(files).values({
      tenantId: asset.tenantId,
      filename: `${variantName}_${path.basename(originalFile.filename, path.extname(originalFile.filename))}.${outputFormat}`,
      mimeType: `image/${outputFormat}`,
      size: processed.data.length,
      storageProvider: provider.type,
      storageKey: variantKey,
      uploadedBy: 'system',
    }).returning();

    // 创建变体记录 - 使用实际输出尺寸
    await db.insert(assetVariants).values({
      assetId: asset.id,
      fileId: variantFile.id,
      variantName,
      width: processed.info.width,    // 实际输出宽度
      height: processed.info.height,  // 实际输出高度
      format: outputFormat,
      transformParams: config,
    });
  }
}
```

#### 按需生成

```typescript
// 访问变体时按需生成（懒加载模式）
async function getVariant(assetId: string, variantName: string): Promise<string> {
  const asset = await getAsset(assetId);

  // 非图片类型只返回原始文件
  if (asset.type !== 'image') {
    if (variantName !== 'original') {
      throw new InvalidVariantError(
        `Variants are only available for image assets`
      );
    }
    const file = await getFile(asset.fileId);
    return provider.getSignedUrl(file.storageKey, {
      expiresIn: 3600,
      operation: 'get',
    });
  }

  // 1. 查找已有变体
  const existing = await db.query.assetVariants.findFirst({
    where: and(
      eq(assetVariants.assetId, assetId),
      eq(assetVariants.variantName, variantName)
    ),
  });

  if (existing) {
    const file = await getFile(existing.fileId);
    return provider.getSignedUrl(file.storageKey, {
      expiresIn: 3600,
      operation: 'get',
    });
  }

  // 2. original 变体直接返回原始文件
  if (variantName === 'original') {
    const file = await getFile(asset.fileId);
    return provider.getSignedUrl(file.storageKey, {
      expiresIn: 3600,
      operation: 'get',
    });
  }

  // 3. 按需生成
  await processImageVariants(asset, [variantName]);

  // 4. 返回新生成的变体 URL
  const newVariant = await db.query.assetVariants.findFirst({
    where: and(
      eq(assetVariants.assetId, assetId),
      eq(assetVariants.variantName, variantName)
    ),
  });

  const file = await getFile(newVariant.fileId);
  return provider.getSignedUrl(file.storageKey, {
    expiresIn: 3600,
    operation: 'get',
  });
}
```

---

### D6: CDN 集成

**Decision**: 配置驱动的 CDN URL 重写

```typescript
// Settings 配置
interface CDNConfig {
  enabled: boolean;
  baseUrl: string;              // https://cdn.example.com
  signedUrls: boolean;          // 是否签名
  signingKey?: string;          // CDN 签名密钥
  ttl: number;                  // 默认 TTL (秒)
}

// CDN Service
class CDNService {
  private config: CDNConfig;

  async getUrl(file: FileRecord): Promise<string> {
    if (!this.config.enabled) {
      return this.provider.getSignedUrl(file.storageKey, {
        expiresIn: 3600,
        operation: 'get',
      });
    }

    const path = this.buildCDNPath(file);

    if (this.config.signedUrls) {
      return this.signUrl(path);
    }

    return `${this.config.baseUrl}${path}`;
  }

  private buildCDNPath(file: FileRecord): string {
    // CDN 路径策略，可能与存储路径不同
    return `/${file.storageKey}`;
  }

  private signUrl(path: string): string {
    const expires = Math.floor(Date.now() / 1000) + this.config.ttl;
    const signature = this.generateSignature(path, expires);
    return `${this.config.baseUrl}${path}?expires=${expires}&signature=${signature}`;
  }
}
```

---

### D7: 权限模型

**Decision**: 基于现有 CASL 权限系统，定义文件/资源相关 capability，**租户隔离优先**

#### Capabilities

| Capability | 描述 | 典型角色 |
|------------|------|----------|
| `files:upload` | 上传文件 | Editor, Admin |
| `files:read` | 读取文件信息 | All authenticated |
| `files:delete` | 删除文件 | Owner, Admin |
| `files:manage` | 管理所有文件 | Admin |
| `assets:create` | 创建资源 | Editor, Admin |
| `assets:read` | 读取资源 | All authenticated |
| `assets:update` | 更新资源元数据 | Owner, Editor, Admin |
| `assets:delete` | 删除资源 | Owner, Admin |
| `assets:manage` | 管理所有资源 | Admin |

#### 权限检查逻辑 - 租户隔离优先

```typescript
// 文件权限检查
async function canAccessFile(
  userId: string,
  userTenantId: string,  // 用户所属租户
  fileId: string,
  action: string
): Promise<boolean> {
  const file = await getFile(fileId);

  // 1. 租户隔离检查 - 必须首先验证
  if (file.tenantId !== userTenantId) {
    // 跨租户访问始终拒绝，无论是否是所有者或管理员
    return false;
  }

  // 2. 公开文件 - 读取无需权限 (仍需租户匹配)
  if (file.isPublic && action === 'read') return true;

  // 3. 所有者
  if (file.uploadedBy === userId) return true;

  // 4. 管理员能力 (租户内)
  if (await can(userId, 'files:manage', file.tenantId)) return true;

  // 5. 具体操作能力 (租户内)
  return can(userId, `files:${action}`, file.tenantId);
}

// Asset 权限检查 - 同样租户隔离优先
async function canAccessAsset(
  userId: string,
  userTenantId: string,
  assetId: string,
  action: string
): Promise<boolean> {
  const asset = await getAsset(assetId);

  // 1. 租户隔离检查
  if (asset.tenantId !== userTenantId) {
    return false;
  }

  // 2. 所有者
  if (asset.createdBy === userId) return true;

  // 3. 管理员能力
  if (await can(userId, 'assets:manage', asset.tenantId)) return true;

  // 4. 具体操作能力
  return can(userId, `assets:${action}`, asset.tenantId);
}
```

---

### D8: Plugin API 集成

**Decision**: 通过 PluginContext 提供文件和资源能力

```typescript
// 扩展 PluginContext
interface PluginContext {
  // ... existing capabilities

  files: FileCapability;
  assets: AssetCapability;
}

interface FileCapability {
  // 只能访问同租户的文件
  get(id: string): Promise<FileRecord | null>;
  upload(file: Buffer, options: UploadOptions): Promise<FileRecord>;
  delete(id: string): Promise<void>;
  getSignedUrl(id: string, expiresIn?: number): Promise<string>;
  getUploadUrl(filename: string, contentType: string): Promise<DirectUploadResult>;
}

interface DirectUploadResult {
  uploadUrl: string;      // 签名的 PUT URL
  fileId: string;         // 预创建的文件 ID
  storageKey: string;
  expiresIn: number;
}

interface AssetCapability {
  get(id: string): Promise<Asset | null>;
  create(fileId: string, options: CreateAssetOptions): Promise<Asset>;
  update(id: string, data: Partial<AssetData>): Promise<Asset>;
  delete(id: string): Promise<void>;
  list(query: AssetQuery): Promise<PaginatedResult<Asset>>;
  getVariantUrl(id: string, variant: string): Promise<string>;
}
```

#### 能力限制

```typescript
// Plugin 的文件能力是受限的
class PluginFileCapability implements FileCapability {
  constructor(
    private pluginId: string,
    private tenantId: string,
    private fileService: FileService,
    private auditService: AuditService,
  ) {}

  async upload(file: Buffer, options: UploadOptions): Promise<FileRecord> {
    // 检查插件是否声明了 files:upload 能力
    await this.checkCapability('files:upload');

    // 检查文件大小限制
    const limit = await this.getPluginUploadLimit();
    if (file.length > limit) {
      throw new Error(`File exceeds plugin upload limit (${limit} bytes)`);
    }

    // 验证文件类型
    await this.fileService.validateFileType(options.contentType);

    // 添加插件标识到元数据
    const result = await this.fileService.upload(file, {
      ...options,
      tenantId: this.tenantId,
      metadata: {
        ...options.metadata,
        uploadedByPlugin: this.pluginId,
      },
    });

    // 记录审计日志
    await this.auditService.log({
      entityType: 'file',
      entityId: result.id,
      tenantId: this.tenantId,
      action: 'create',
      metadata: {
        pluginId: this.pluginId,
        filename: options.filename,
        size: file.length,
      },
    });

    return result;
  }
}
```

---

### D9: 存储配置

**Decision**: 通过 Settings System 配置存储后端

```typescript
// Settings keys
const STORAGE_SETTINGS = {
  // 全局默认
  'storage.provider': 'local',               // 'local' | 's3' | 'oss' | 'r2'
  'storage.local.basePath': './uploads',

  // S3 配置
  'storage.s3.region': null,
  'storage.s3.bucket': null,
  'storage.s3.accessKeyId': null,            // encrypted
  'storage.s3.secretAccessKey': null,        // encrypted
  'storage.s3.endpoint': null,               // 可选，用于 MinIO

  // 阿里云 OSS 配置
  'storage.oss.region': null,
  'storage.oss.bucket': null,
  'storage.oss.accessKeyId': null,           // encrypted
  'storage.oss.accessKeySecret': null,       // encrypted

  // Cloudflare R2 配置
  'storage.r2.accountId': null,
  'storage.r2.bucket': null,
  'storage.r2.accessKeyId': null,            // encrypted
  'storage.r2.secretAccessKey': null,        // encrypted

  // CDN 配置
  'storage.cdn.enabled': false,
  'storage.cdn.baseUrl': null,
  'storage.cdn.signedUrls': false,
  'storage.cdn.signingKey': null,            // encrypted
  'storage.cdn.ttl': 86400,                  // 24 hours

  // 上传限制
  'storage.upload.maxSize': 104857600,       // 100MB
  'storage.upload.allowedTypes': ['image/*', 'video/*', 'application/pdf'],

  // 图片处理
  'storage.image.variants': ['thumbnail', 'medium', 'large'],
  'storage.image.defaultFormat': 'webp',
  'storage.image.quality': 85,
  'storage.image.maxPixelSize': 100000000,   // 100 megapixels
  'storage.image.maxDimension': 16384,       // 最大单边尺寸
};
```

#### 租户级覆盖

租户可以覆盖部分配置（如 CDN 配置、上传限制），但不能覆盖全局存储后端（统一管理）。

---

### D10: 文件上传验证

**Decision**: 上传前验证文件类型和大小

```typescript
interface ValidationConfig {
  maxSize: number;           // 字节
  allowedTypes: string[];    // MIME type patterns, e.g., 'image/*', 'application/pdf'
}

class FileValidationService {
  private async getConfig(tenantId?: string): Promise<ValidationConfig> {
    const maxSize = await settingsService.get('storage.upload.maxSize', tenantId);
    const allowedTypes = await settingsService.get('storage.upload.allowedTypes', tenantId);
    return { maxSize, allowedTypes };
  }

  async validate(file: UploadFile, tenantId?: string): Promise<void> {
    const config = await this.getConfig(tenantId);

    // 1. 文件大小验证
    if (file.size > config.maxSize) {
      throw new FileTooLargeError(
        `File size ${file.size} exceeds maximum ${config.maxSize} bytes`
      );
    }

    // 2. 文件类型验证
    const isAllowed = config.allowedTypes.some(pattern => {
      if (pattern.endsWith('/*')) {
        // 通配符匹配，如 'image/*'
        const category = pattern.slice(0, -2);
        return file.mimeType.startsWith(category + '/');
      }
      return file.mimeType === pattern;
    });

    if (!isAllowed) {
      throw new InvalidFileTypeError(
        `File type ${file.mimeType} is not allowed. Allowed: ${config.allowedTypes.join(', ')}`
      );
    }

    // 3. 文件名安全验证
    if (!this.isValidFilename(file.filename)) {
      throw new InvalidFilenameError('Filename contains invalid characters');
    }
  }

  private isValidFilename(filename: string): boolean {
    // 禁止路径遍历和特殊字符
    const invalidPatterns = [/\.\./, /[<>:"|?*\x00-\x1f]/];
    return !invalidPatterns.some(p => p.test(filename));
  }
}
```

---

### D11: 审计日志

**Decision**: 使用平台级 AuditService 记录文件/资源操作

#### 审计事件

| 操作 | entityType | action | 说明 |
|------|------------|--------|------|
| 上传文件 | file | create | 记录上传来源、大小 |
| 下载文件 | file | access | 记录访问方式 |
| 删除文件 | file | delete | 记录删除原因 |
| 创建资源 | asset | create | 记录关联文件 |
| 更新资源 | asset | update | 记录变更字段 |
| 删除资源 | asset | delete | 记录删除原因 |
| 生成变体 | asset_variant | create | 记录变体名称 |

```typescript
// FileService 中集成审计
class FileService {
  constructor(
    private storageProvider: StorageProvider,
    private auditService: AuditService,
  ) {}

  async upload(file: Buffer, options: UploadOptions): Promise<FileRecord> {
    // ... 上传逻辑 ...

    // 记录审计
    await this.auditService.log({
      entityType: 'file',
      entityId: record.id,
      tenantId: options.tenantId,
      action: 'create',
      metadata: {
        filename: options.filename,
        mimeType: options.contentType,
        size: file.length,
        storageProvider: this.storageProvider.type,
      },
    });

    return record;
  }

  async getSignedUrl(fileId: string): Promise<string> {
    const file = await this.get(fileId);

    // 记录访问审计
    await this.auditService.log({
      entityType: 'file',
      entityId: fileId,
      tenantId: file.tenantId,
      action: 'access',
      metadata: { method: 'signed_url' },
    });

    return this.storageProvider.getSignedUrl(file.storageKey, {
      expiresIn: 3600,
      operation: 'get',
    });
  }

  async delete(fileId: string): Promise<void> {
    const file = await this.get(fileId);

    // 软删除
    await db.update(files)
      .set({ deletedAt: new Date() })
      .where(eq(files.id, fileId));

    // 记录审计
    await this.auditService.log({
      entityType: 'file',
      entityId: fileId,
      tenantId: file.tenantId,
      action: 'delete',
      changes: { old: file, new: null },
      metadata: { type: 'soft_delete' },
    });
  }
}
```

---

### D12: 软删除与保留策略

**Decision**: 软删除 + 定时硬删除 + 可配置保留期

```typescript
// Settings
const RETENTION_SETTINGS = {
  'storage.retention.softDeleteDays': 30,     // 软删除保留天数
  'storage.retention.cleanupBatchSize': 100,  // 每批清理数量
};

// 软删除后的状态机
// Active -> Soft-Deleted -> (30 days) -> Hard-Deleted

interface RetentionPolicy {
  softDeleteDays: number;
  cleanupBatchSize: number;
}
```

#### 硬删除清理任务

```typescript
@Cron('0 0 3 * * *') // 每天凌晨 3 点执行
async function permanentDeleteCleanup(): Promise<void> {
  const retentionDays = await settingsService.get('storage.retention.softDeleteDays');
  const batchSize = await settingsService.get('storage.retention.cleanupBatchSize');
  const cutoffDate = subDays(new Date(), retentionDays);

  // 1. 清理过期的 Assets（先清理，因为有外键依赖）
  const expiredAssets = await db.select()
    .from(assets)
    .where(and(
      isNotNull(assets.deletedAt),
      lt(assets.deletedAt, cutoffDate)
    ))
    .limit(batchSize);

  for (const asset of expiredAssets) {
    try {
      // 删除变体记录
      await db.delete(assetVariants).where(eq(assetVariants.assetId, asset.id));
      // 删除 asset 记录
      await db.delete(assets).where(eq(assets.id, asset.id));

      logger.info('Permanently deleted asset', { assetId: asset.id });
    } catch (error) {
      logger.error('Failed to permanently delete asset', { asset, error });
    }
  }

  // 2. 清理过期的 Files
  const expiredFiles = await db.select()
    .from(files)
    .where(and(
      isNotNull(files.deletedAt),
      lt(files.deletedAt, cutoffDate)
    ))
    .limit(batchSize);

  for (const file of expiredFiles) {
    try {
      // 从存储中删除实际文件
      const provider = getProvider(file.storageProvider);
      await provider.delete(file.storageKey);

      // 删除数据库记录
      await db.delete(files).where(eq(files.id, file.id));

      // 审计
      await auditService.log({
        entityType: 'file',
        entityId: file.id,
        tenantId: file.tenantId,
        action: 'permanent_delete',
        metadata: {
          deletedAt: file.deletedAt,
          storageKey: file.storageKey,
        },
      });

      logger.info('Permanently deleted file from storage', {
        fileId: file.id,
        storageKey: file.storageKey,
      });
    } catch (error) {
      logger.error('Failed to permanently delete file', { file, error });
    }
  }
}
```

#### 恢复软删除

```typescript
async function restoreFile(fileId: string): Promise<FileRecord> {
  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),  // 包含已删除的
  });

  if (!file) {
    throw new FileNotFoundError(fileId);
  }

  if (!file.deletedAt) {
    throw new FileNotDeletedError('File is not deleted');
  }

  // 检查存储中文件是否还存在
  const provider = getProvider(file.storageProvider);
  if (!await provider.exists(file.storageKey)) {
    throw new FileAlreadyPermanentlyDeletedError(
      'File has been permanently deleted from storage'
    );
  }

  // 恢复
  await db.update(files)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(files.id, fileId));

  // 审计
  await auditService.log({
    entityType: 'file',
    entityId: fileId,
    tenantId: file.tenantId,
    action: 'restore',
  });

  return getFile(fileId);
}
```

---

### D13: 插件扩展存储提供者

**Decision**: Core 仅内置 `local` 存储，其他云存储（S3、OSS、COS、OBS 等）通过插件扩展

#### 设计原则

| 层级 | 职责 | 示例 |
|------|------|------|
| Core | 定义接口 + 注册机制 + 内置 local | `StorageProvider`, `StorageProviderRegistry` |
| 官方插件 | 主流云存储适配 | `@wordrhyme/plugin-storage-s3`, `@wordrhyme/plugin-storage-oss` |
| 社区插件 | 其他云存储适配 | `plugin-storage-cos`, `plugin-storage-qiniu` |

**Rationale**:
- Core 保持精简，仅包含开发必需的 local 存储
- 云存储种类繁多，通过插件机制灵活扩展
- 社区可贡献各种存储适配器
- 符合 WordRhyme "插件扩展，不修改 Core" 原则

#### StorageProviderRegistry

```typescript
// Core 提供的注册机制
interface StorageProviderFactory {
  (config: Record<string, unknown>): StorageProvider;
}

interface StorageProviderMetadata {
  type: string;                    // 'cos', 'obs', 'qiniu'
  displayName: string;             // '腾讯云 COS'
  configSchema: JSONSchema;        // 配置项 JSON Schema
  pluginId: string;                // 来源插件 ID
}

interface StorageProviderRegistry {
  // 注册存储提供者（仅 storage:provider 能力的插件可调用）
  register(
    type: string,
    factory: StorageProviderFactory,
    metadata: Omit<StorageProviderMetadata, 'type' | 'pluginId'>
  ): void;

  // 获取存储提供者实例
  get(type: string): StorageProvider | null;

  // 列出所有已注册的提供者
  list(): StorageProviderMetadata[];

  // 获取配置 Schema（用于 Admin UI 动态渲染配置表单）
  getConfigSchema(type: string): JSONSchema | null;
}

// Core 实现
@Injectable()
class StorageProviderRegistryImpl implements StorageProviderRegistry {
  private providers = new Map<string, {
    factory: StorageProviderFactory;
    metadata: StorageProviderMetadata;
    instance?: StorageProvider;
  }>();

  constructor() {
    // 内置 local provider
    this.register('local', (config) => new LocalStorageProvider(config), {
      displayName: 'Local Storage',
      configSchema: {
        type: 'object',
        properties: {
          basePath: { type: 'string', default: './uploads' },
        },
        required: ['basePath'],
      },
    });
  }

  register(type: string, factory: StorageProviderFactory, metadata: Omit<StorageProviderMetadata, 'type' | 'pluginId'>): void {
    const pluginId = this.als.getStore()?.pluginId ?? 'core';

    if (this.providers.has(type)) {
      throw new ProviderAlreadyRegisteredError(`Storage provider '${type}' already registered`);
    }

    this.providers.set(type, {
      factory,
      metadata: { ...metadata, type, pluginId },
    });

    logger.info('Storage provider registered', { type, pluginId });
  }

  get(type: string): StorageProvider | null {
    const entry = this.providers.get(type);
    if (!entry) return null;

    // 懒加载实例
    if (!entry.instance) {
      const config = await this.loadConfig(type);
      entry.instance = entry.factory(config);
    }

    return entry.instance;
  }

  private async loadConfig(type: string): Promise<Record<string, unknown>> {
    // 从 Settings 动态加载配置
    const configKeys = await settingsService.list({
      pattern: `storage.${type}.*`,
      scope: 'global',
    });

    const config: Record<string, unknown> = {};
    for (const key of configKeys) {
      const shortKey = key.replace(`storage.${type}.`, '');
      config[shortKey] = await settingsService.get(key);
    }
    return config;
  }
}
```

#### Plugin 实现示例

```typescript
// @wordrhyme/plugin-storage-s3/src/index.ts
import { definePlugin } from '@wordrhyme/plugin-api';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default definePlugin({
  pluginId: 'storage-s3',
  version: '1.0.0',
  capabilities: ['storage:provider'],

  async onEnable(ctx) {
    ctx.storage.registerProvider('s3', (config) => new S3StorageProvider(config), {
      displayName: 'Amazon S3',
      configSchema: {
        type: 'object',
        properties: {
          region: { type: 'string', title: 'Region' },
          bucket: { type: 'string', title: 'Bucket' },
          accessKeyId: { type: 'string', title: 'Access Key ID', encrypted: true },
          secretAccessKey: { type: 'string', title: 'Secret Access Key', encrypted: true },
          endpoint: { type: 'string', title: 'Endpoint (Optional)', description: 'For S3-compatible services like MinIO' },
        },
        required: ['region', 'bucket', 'accessKeyId', 'secretAccessKey'],
      },
    });
  },
});

class S3StorageProvider implements StorageProvider {
  readonly type = 's3';
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
    });
    this.bucket = config.bucket;
  }

  // ... 实现 StorageProvider 接口的所有方法
}
```

```typescript
// plugin-storage-cos (腾讯云) 示例
export default definePlugin({
  pluginId: 'storage-cos',
  version: '1.0.0',
  capabilities: ['storage:provider'],

  async onEnable(ctx) {
    ctx.storage.registerProvider('cos', (config) => new COSStorageProvider(config), {
      displayName: '腾讯云 COS',
      configSchema: {
        type: 'object',
        properties: {
          region: { type: 'string', title: '地域', enum: ['ap-beijing', 'ap-shanghai', 'ap-guangzhou', '...'] },
          bucket: { type: 'string', title: 'Bucket 名称' },
          secretId: { type: 'string', title: 'SecretId', encrypted: true },
          secretKey: { type: 'string', title: 'SecretKey', encrypted: true },
        },
        required: ['region', 'bucket', 'secretId', 'secretKey'],
      },
    });
  },
});
```

#### Plugin Manifest 声明

```json
{
  "pluginId": "storage-s3",
  "version": "1.0.0",
  "type": "backend",
  "capabilities": ["storage:provider"],
  "storage": {
    "providerTypes": ["s3"],
    "configurable": true
  }
}
```

#### Admin UI 集成

```typescript
// 存储配置页面可动态渲染
async function StorageConfigPage() {
  // 获取所有已注册的存储提供者
  const providers = await trpc.storage.listProviders.query();
  const currentProvider = await trpc.settings.get.query({ key: 'storage.provider' });

  return (
    <div>
      <Select value={currentProvider} onChange={handleProviderChange}>
        {providers.map(p => (
          <Option key={p.type} value={p.type}>{p.displayName}</Option>
        ))}
      </Select>

      {/* 根据 configSchema 动态渲染配置表单 */}
      <DynamicForm
        schema={providers.find(p => p.type === currentProvider)?.configSchema}
        onSubmit={handleConfigSubmit}
      />
    </div>
  );
}
```

#### 官方插件规划

| 插件 | 类型 | 状态 | 说明 |
|------|------|------|------|
| `@wordrhyme/plugin-storage-s3` | 官方 | 首发 | Amazon S3 + S3 兼容（MinIO） |
| `@wordrhyme/plugin-storage-oss` | 官方 | 首发 | 阿里云 OSS |
| `@wordrhyme/plugin-storage-r2` | 官方 | 首发 | Cloudflare R2 |
| `plugin-storage-cos` | 社区 | 规划 | 腾讯云 COS |
| `plugin-storage-obs` | 社区 | 规划 | 华为云 OBS |
| `plugin-storage-qiniu` | 社区 | 规划 | 七牛云 |
| `plugin-storage-upyun` | 社区 | 规划 | 又拍云 |

#### 扩展 Plugin API

```typescript
// packages/plugin/src/types.ts
interface PluginContext {
  // ... existing capabilities

  // 仅 storage:provider 能力的插件可访问
  storage: StorageExtensionCapability;
}

interface StorageExtensionCapability {
  /**
   * 注册存储提供者
   * @requires capability: storage:provider
   */
  registerProvider(
    type: string,
    factory: StorageProviderFactory,
    metadata: ProviderMetadata
  ): void;
}
```

#### 配置动态化

```typescript
// 不再硬编码特定提供者的配置
// D9 中的 STORAGE_SETTINGS 简化为：
const STORAGE_SETTINGS = {
  // 全局
  'storage.provider': 'local',           // 当前使用的提供者类型

  // 通用配置（所有提供者共享）
  'storage.upload.maxSize': 104857600,
  'storage.upload.allowedTypes': ['image/*', 'video/*', 'application/pdf'],

  // CDN 配置
  'storage.cdn.enabled': false,
  'storage.cdn.baseUrl': null,
  // ...

  // 图片处理配置
  'storage.image.variants': ['thumbnail', 'medium', 'large'],
  'storage.image.defaultFormat': 'webp',
  // ...

  // 提供者特定配置由插件注册的 configSchema 定义
  // 例如：'storage.s3.region', 'storage.s3.bucket' 等
};
```

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 存储凭据泄露 | 通过 Settings System 加密存储 |
| 大文件上传超时 | Multipart 上传 + 可恢复 |
| 图片处理阻塞 | 异步队列处理（后续版本） |
| 图片处理 OOM | maxPixelSize 限制 + Sharp 流式处理 |
| 存储成本失控 | 配额限制 + 软删除保留策略 + 定期硬删除 |
| CDN 缓存失效延迟 | 提供手动清理 API |
| 租户数据泄露 | 路径隔离 + 权限检查（租户优先） |
| Multipart 上传孤立 | 24h 过期 + 定时清理任务 |

---

## Migration Plan

### Phase 1: 基础存储
1. 创建 `files` 表
2. 实现 `StorageProvider` 接口
3. 实现 `LocalStorageProvider`
4. 实现 `FileService` 基础 CRUD
5. 实现文件验证服务

### Phase 2: S3 兼容存储
1. 实现 `S3StorageProvider` (含 GET/PUT 签名 URL)
2. 配置 Settings 集成
3. 实现 Multipart 上传 (含清理任务)

### Phase 3: Asset 管理
1. 创建 `assets`, `asset_variants` 表
2. 实现 `AssetService`
3. 集成 Sharp 图片处理 (含类型守卫、尺寸限制)
4. 实现变体生成 (正确记录实际尺寸)

### Phase 4: API 层
1. 实现 tRPC routers
2. 权限检查中间件 (租户隔离优先)
3. 审计日志集成

### Phase 5: Plugin 集成
1. 扩展 `PluginContext`
2. 实现能力限制
3. 更新 plugin-api 包

### Phase 6: CDN 和优化
1. CDN Service 实现
2. URL 签名
3. 缓存策略

### Phase 7: 清理与保留
1. 软删除保留策略
2. 硬删除清理任务
3. 恢复功能

### Rollback
- 删除新表（文件数据需要手动处理存储清理）
- 回退代码变更
- 恢复 Settings 配置

---

## Open Questions

1. ~~是否需要支持视频转码？~~ → 后续版本
2. ~~变体生成是同步还是异步？~~ → MVP 同步，后续可改为队列
3. ~~是否需要文件版本控制？~~ → 后续版本
4. ~~存储配置是全局还是租户级？~~ → 存储后端全局，限制和 CDN 可租户覆盖
5. ~~非图片资源如何处理变体请求？~~ → 类型守卫，仅 original 可用
6. ~~变体扩展名与输出格式不匹配？~~ → 使用实际输出格式作为扩展名
7. ~~过期 multipart 如何处理？~~ → 24h 过期 + 定时清理任务
8. ~~软删除文件何时物理删除？~~ → 30 天保留期 + 每日清理任务
