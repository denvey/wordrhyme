# asset-management Specification

## Purpose

提供资源（Asset）抽象层，在 File 基础上增加 CMS 业务语义，支持图片处理、变体生成、标签管理等功能。

## ADDED Requirements

### Requirement: Asset Abstraction

系统 SHALL 提供 Asset 抽象，将原始 File 转化为具有 CMS 语义的资源。Asset MUST 关联到 File，支持类型分类：`image`、`video`、`document`、`other`。

#### Scenario: Create image asset
- **GIVEN** 文件 `photo.jpg` 已上传
- **WHEN** 调用 `assetService.create(fileId, { type: 'image', alt: 'A photo' })`
- **THEN** 创建 `assets` 表记录
- **AND** `type` 设置为 `image`
- **AND** 自动提取图片宽高信息

#### Scenario: Create document asset
- **GIVEN** 文件 `report.pdf` 已上传
- **WHEN** 调用 `assetService.create(fileId, { type: 'document' })`
- **THEN** 创建 `assets` 表记录
- **AND** `type` 设置为 `document`
- **AND** 不进行图片处理

#### Scenario: Asset type detection
- **GIVEN** 文件 MIME 类型为 `image/jpeg`
- **WHEN** 创建 Asset 未指定 type
- **THEN** 自动检测并设置 `type` 为 `image`

---

### Requirement: Image Variant Generation

系统 SHALL 支持图片变体生成，提供预定义变体：`thumbnail`（200x200）、`small`（400x400）、`medium`（800x800）、`large`（1600x1600）、`original`。变体处理 MUST 仅适用于 `type='image'` 的 Asset。

#### Scenario: Generate thumbnail variant
- **GIVEN** 原始图片为 2000x1500 像素
- **WHEN** 请求 `thumbnail` 变体
- **THEN** 生成 200x200 像素的裁剪图片（cover fit）
- **AND** 存储到独立的 storage key
- **AND** 创建 `asset_variants` 记录
- **AND** 记录实际输出尺寸（200x200）

#### Scenario: Generate medium variant with actual dimensions
- **GIVEN** 原始图片为 2000x1500 像素
- **WHEN** 请求 `medium` 变体（800x800 inside fit）
- **THEN** 生成保持比例的图片
- **AND** `asset_variants.width` 记录实际输出宽度 800
- **AND** `asset_variants.height` 记录实际输出高度 600（非预设值）

#### Scenario: Lazy variant generation
- **GIVEN** 图片 Asset 只有 original
- **WHEN** 首次请求 `thumbnail` 变体 URL
- **THEN** 按需生成 thumbnail 变体
- **AND** 后续请求直接返回缓存

#### Scenario: Original variant returns source
- **WHEN** 请求 `original` 变体
- **THEN** 返回原始文件 URL
- **AND** 不进行任何处理

#### Scenario: Non-image asset variant request rejected
- **GIVEN** Asset 类型为 `document`
- **WHEN** 请求 `thumbnail` 变体
- **THEN** 返回 `InvalidVariantError`
- **AND** 提示 "Variants are only available for image assets"

#### Scenario: Non-image asset original variant
- **GIVEN** Asset 类型为 `video`
- **WHEN** 请求 `original` 变体
- **THEN** 返回原始文件 URL
- **AND** 不进行任何处理

---

### Requirement: Image Processing

系统 SHALL 支持基本图片处理：resize、format 转换、质量调整。处理使用 Sharp 库实现，每个变体 MUST 使用克隆的 Sharp 实例避免状态累积。

#### Scenario: WebP format conversion with correct extension
- **GIVEN** 原始文件为 `photo.jpg`
- **AND** 配置 `storage.image.defaultFormat` 为 `webp`
- **WHEN** 生成 `thumbnail` 变体
- **THEN** 输出格式为 WebP
- **AND** 变体 storage key 为 `.../{uuid}/thumbnail.webp`（非 .jpg）
- **AND** Content-Type 为 `image/webp`

#### Scenario: Quality optimization
- **GIVEN** 配置质量为 85
- **WHEN** 生成 JPEG 变体
- **THEN** 输出质量为 85%
- **AND** 文件大小显著减小

#### Scenario: Preserve aspect ratio
- **GIVEN** 原始图片为 1920x1080
- **WHEN** 生成 `medium` 变体 (800x800 inside)
- **THEN** 输出尺寸为 800x450
- **AND** 宽高比保持 16:9
- **AND** `asset_variants` 记录实际尺寸 800x450

#### Scenario: Clone Sharp instance per variant
- **GIVEN** 需要生成 thumbnail 和 medium 两个变体
- **WHEN** 处理图片
- **THEN** 每个变体使用 `baseImage.clone()`
- **AND** 变体之间的处理互不影响

---

### Requirement: Image Size Limits

系统 SHALL 限制可处理的图片尺寸，防止内存溢出（OOM）。超限图片 MUST 被拒绝处理。

#### Scenario: Reject oversized image by pixel count
- **GIVEN** 配置 `storage.image.maxPixelSize` 为 100,000,000
- **AND** 图片为 12000x10000 像素（120 megapixels）
- **WHEN** 尝试生成变体
- **THEN** 返回 `ImageTooLargeError`
- **AND** 提示 "Image exceeds maximum pixel count"

#### Scenario: Reject oversized image by dimension
- **GIVEN** 配置 `storage.image.maxDimension` 为 16384
- **AND** 图片为 20000x5000 像素
- **WHEN** 尝试生成变体
- **THEN** 返回 `ImageTooLargeError`
- **AND** 提示 "Image dimension exceeds limit"

#### Scenario: Accept image within limits
- **GIVEN** 配置 maxPixelSize 为 100,000,000
- **AND** 图片为 8000x6000 像素（48 megapixels）
- **WHEN** 生成变体
- **THEN** 处理成功

---

### Requirement: Asset Metadata

Asset SHALL 支持元数据管理：`alt`（替代文本）、`title`（标题）、`tags`（标签数组）、`folder_path`（虚拟文件夹）。

#### Scenario: Update asset metadata
- **GIVEN** Asset `asset-123` 存在
- **WHEN** 调用 `assetService.update(id, { alt: 'New alt', tags: ['nature', 'photo'] })`
- **THEN** 更新 `assets` 表记录
- **AND** `updated_at` 更新

#### Scenario: Search assets by tag
- **GIVEN** 多个 Asset 有标签 `nature`
- **WHEN** 调用 `assetService.list({ tags: ['nature'] })`
- **THEN** 返回所有包含 `nature` 标签的 Asset

#### Scenario: Filter by folder path
- **GIVEN** Asset 有 `folder_path` 为 `/products/electronics`
- **WHEN** 调用 `assetService.list({ folderPath: '/products' })`
- **THEN** 返回该文件夹及子文件夹下的所有 Asset

---

### Requirement: Asset Query

系统 SHALL 提供丰富的 Asset 查询能力：分页、排序、类型过滤、标签过滤、日期范围。

#### Scenario: Paginated asset list
- **WHEN** 调用 `assetService.list({ page: 2, pageSize: 20 })`
- **THEN** 返回第 2 页的 20 个 Asset
- **AND** 包含 `total`、`page`、`pageSize`、`totalPages`

#### Scenario: Filter by type
- **WHEN** 调用 `assetService.list({ type: 'image' })`
- **THEN** 只返回 `type` 为 `image` 的 Asset

#### Scenario: Sort by created date
- **WHEN** 调用 `assetService.list({ sortBy: 'createdAt', sortOrder: 'desc' })`
- **THEN** 按创建时间降序返回

---

### Requirement: Asset Deletion

Asset 删除 SHALL 级联删除关联的变体文件。删除采用软删除策略。

#### Scenario: Delete asset soft deletes variants
- **WHEN** 调用 `assetService.delete(assetId)`
- **THEN** Asset 标记 `deleted_at`
- **AND** 关联的 `asset_variants` 记录保留（通过外键关联）

#### Scenario: Permanent delete cleans storage
- **GIVEN** Asset 已软删除超过 30 天
- **WHEN** 清理任务运行
- **THEN** 删除原始文件和所有变体文件
- **AND** 删除 `assets`、`asset_variants`、`files` 记录

---

### Requirement: CDN URL Generation

系统 SHALL 支持 CDN URL 生成。当 CDN 配置启用时，Asset URL SHOULD 使用 CDN 域名。

#### Scenario: CDN enabled returns CDN URL
- **GIVEN** CDN 配置 `enabled: true, baseUrl: 'https://cdn.example.com'`
- **WHEN** 获取 Asset 变体 URL
- **THEN** 返回 `https://cdn.example.com/{path}`

#### Scenario: CDN signed URL
- **GIVEN** CDN 配置 `signedUrls: true`
- **WHEN** 获取 Asset URL
- **THEN** URL 包含 `expires` 和 `signature` 参数

#### Scenario: CDN disabled returns direct URL
- **GIVEN** CDN 配置 `enabled: false`
- **WHEN** 获取 Asset URL
- **THEN** 返回存储 provider 的签名 URL

---

## MODIFIED Requirements

### Requirement: Database Schema Extension (database-schema)

`database-schema` spec SHALL 扩展以包含 Asset 相关表。

#### Scenario: Assets table exists
- **WHEN** 数据库迁移运行
- **THEN** 创建 `assets` 表
- **AND** 包含索引：`idx_assets_tenant`、`idx_assets_type`、`idx_assets_folder`
- **AND** 包含 GIN 索引：`idx_assets_tags`

#### Scenario: Asset variants table exists
- **WHEN** 数据库迁移运行
- **THEN** 创建 `asset_variants` 表
- **AND** 包含唯一约束：`(asset_id, variant_name)`

---

### Requirement: Plugin Context Extension (plugin-api)

`plugin-api` spec SHALL 扩展 `PluginContext` 以包含 `assets` 能力。

#### Scenario: Plugin accesses asset capability
- **WHEN** 插件访问 `ctx.assets`
- **THEN** 获得受限的 `AssetCapability` 接口
- **AND** 只能访问同租户的 Asset

#### Scenario: Plugin creates asset
- **GIVEN** 插件声明了 `assets:create` 能力
- **WHEN** 插件调用 `ctx.assets.create(fileId, options)`
- **THEN** Asset 创建成功
- **AND** `metadata.createdByPlugin` 设置为插件 ID

#### Scenario: Plugin asset access audit
- **WHEN** 插件访问 Asset
- **THEN** 记录审计事件
- **AND** `actor_type` 为 `plugin`
- **AND** `metadata.pluginId` 为插件 ID

---

## Related Specs

- `file-storage` - 底层文件存储（Asset 依赖 File）
- `database-schema` - 数据库表定义
- `plugin-api` - 插件能力接口
