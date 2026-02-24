# media-management Specification

## Purpose

统一媒体资源管理能力，提供内容资产（图片、视频、文档等）的上传、存储、变体生成、元数据管理和查询功能。

## ADDED Requirements

### Requirement: Media Abstraction

系统 SHALL 提供统一的 `media` 表来管理所有内容资产。每条 media 记录同时包含物理存储信息和业务语义信息。系统文件（导出/导入/临时文件）不进入 media 表。

#### Scenario: Upload and create media
- **GIVEN** 用户有 `Media:create` 权限
- **WHEN** 用户上传一个文件
- **THEN** 系统创建一条 media 记录
- **AND** `storage_key` 指向实际存储位置
- **AND** `mime_type` 从文件内容检测
- **AND** 如果是图片，`width`、`height`、`format` 自动填充

#### Scenario: Media record contains both storage and semantic fields
- **WHEN** 查询一条 media 记录
- **THEN** 记录包含物理字段：`storage_provider`, `storage_key`, `size`, `mime_type`, `checksum`
- **AND** 记录包含业务字段：`alt`, `title`, `tags`, `folder_path`

#### Scenario: System files excluded from media
- **WHEN** 系统生成导出文件（如 CSV 报表）
- **THEN** 该文件不写入 media 表
- **AND** 通过 `export_jobs` 或类似任务表管理

---

### Requirement: Media Variant Generation

对于图片类媒体，系统 SHALL 自动生成预设变体（thumbnail, small, medium, large）。变体 SHALL 作为独立的 media 行存储，通过 `parent_id` 引用原始媒体。

#### Scenario: Image upload triggers variant generation
- **GIVEN** 上传了一张图片（mime_type 为 image/*）
- **WHEN** 上传确认后
- **THEN** `ImageProcessorService` 生成 4 个变体
- **AND** 每个变体创建一条 media 记录
- **AND** `parent_id` 指向原始媒体
- **AND** `variant_name` 分别为 'thumbnail', 'small', 'medium', 'large'

#### Scenario: Variant is identified by parent_id
- **WHEN** 查询 `media` 表中 `parent_id IS NOT NULL` 的记录
- **THEN** 返回的都是变体
- **AND** 原始媒体的 `parent_id IS NULL`

#### Scenario: Variant uniqueness
- **GIVEN** 原始媒体 M 已有 variant_name='thumbnail' 的变体
- **WHEN** 尝试为 M 创建另一个 variant_name='thumbnail' 的变体
- **THEN** 操作失败，违反部分唯一索引 `(parent_id, variant_name) WHERE parent_id IS NOT NULL`

#### Scenario: Variant inherits organization_id from parent
- **WHEN** 创建变体
- **THEN** `organization_id` MUST 从 parent 复制
- **AND** Service 层不接受外部传入的 `organization_id`
- **AND** 防止跨租户 parent-child 关联

#### Scenario: Soft delete original cascades to variants
- **GIVEN** 原始媒体 M 有 4 个变体
- **WHEN** 软删除 M（设置 `deleted_at`）
- **THEN** 所有变体的 `deleted_at` 也被同步设置（Service 层级联）
- **AND** 变体不再出现在默认列表中

#### Scenario: Restore original restores variants
- **WHEN** 恢复软删除的原始媒体 M
- **THEN** 所有变体的 `deleted_at` 也被清除
- **AND** 变体重新可用

#### Scenario: Permanent delete original cascades to variants
- **WHEN** 永久删除一条原始媒体记录
- **THEN** 数据库 `ON DELETE CASCADE` 自动删除所有变体行
- **AND** 变体对应的存储文件也被清理

---

### Requirement: Signed URL for Upload and Download

系统 SHALL 通过签名 URL 机制处理文件上传和下载。本地存储使用 token 参数，S3 使用预签名 URL。

#### Scenario: Get upload URL
- **GIVEN** 用户有 `Media:create` 权限
- **WHEN** 请求上传 URL
- **THEN** 系统创建一条 `size=0` 的占位 media 记录
- **AND** 返回签名的 PUT URL
- **AND** URL 在配置的过期时间内有效

#### Scenario: Get download URL
- **GIVEN** 用户有 `Media:read` 权限
- **WHEN** 请求下载 URL
- **THEN** 系统返回签名的 GET URL
- **AND** URL 在配置的过期时间内有效

#### Scenario: Token verification for local storage
- **GIVEN** 使用本地存储提供者
- **WHEN** 客户端使用签名 URL 上传/下载
- **THEN** `FileController` 验证 token 中的 operation 和 key
- **AND** token 过期或不匹配时返回 401/403

---

### Requirement: Media Metadata Management

系统 SHALL 支持媒体元数据的查看和编辑，包括 alt 文本、标题、标签和文件夹路径。

#### Scenario: Update media metadata
- **GIVEN** 用户有 `Media:update` 权限
- **WHEN** 修改媒体的 alt, title, tags, folder_path
- **THEN** 更新成功
- **AND** `updated_at` 时间戳更新

#### Scenario: Tag-based filtering
- **WHEN** 按标签过滤媒体列表
- **THEN** 返回包含指定标签的媒体记录
- **AND** 结果不包含变体（只返回原始媒体）

#### Scenario: Folder-based navigation
- **WHEN** 按 folder_path 浏览媒体
- **THEN** 返回指定文件夹下的媒体记录
- **AND** 支持虚拟文件夹层级

---

### Requirement: Media Query and List

系统 SHALL 支持分页查询媒体列表，支持按 mime_type、tags、folder_path、日期范围过滤。列表查询默认排除变体。

#### Scenario: List media with pagination
- **WHEN** 查询媒体列表
- **THEN** 返回分页结果
- **AND** 默认按 `created_at DESC` 排序
- **AND** 默认过滤条件：`parent_id IS NULL AND deleted_at IS NULL`

#### Scenario: Filter by content type
- **WHEN** 过滤 `type=image`
- **THEN** 查询条件为 `mime_type LIKE 'image/%'`
- **AND** 返回所有图片类型的原始媒体

#### Scenario: Get variants for a media
- **GIVEN** 媒体 M 有 4 个变体
- **WHEN** 查询 M 的变体列表
- **THEN** 返回 4 条变体记录
- **AND** 每条包含 `variant_name`, `width`, `height`, `storage_key`

---

### Requirement: Media Soft Delete

系统 SHALL 支持软删除媒体。软删除的媒体可被恢复。软删除原始媒体时 SHALL 级联软删其所有变体（Service 层实现）。永久删除由数据库 `ON DELETE CASCADE` 级联处理。

#### Scenario: Soft delete media
- **GIVEN** 用户有 `Media:delete` 权限
- **WHEN** 软删除一条原始媒体
- **THEN** 原始媒体的 `deleted_at` 设置为当前时间
- **AND** 所有变体的 `deleted_at` 也被同步设置（Service 层）
- **AND** 媒体和变体不再出现在默认列表中

#### Scenario: Restore soft-deleted media
- **WHEN** 恢复一条软删除的原始媒体
- **THEN** 原始媒体和所有变体的 `deleted_at` 设置为 NULL
- **AND** 媒体和变体重新出现在默认列表中

#### Scenario: Permanent delete
- **WHEN** 永久删除一条原始媒体
- **THEN** media 记录从数据库删除
- **AND** 数据库 `ON DELETE CASCADE` 自动删除所有变体行
- **AND** 存储中的原始文件和变体文件被清理

---

### Requirement: Bulk Operations

系统 SHALL 支持批量操作：批量删除、批量移动文件夹、批量添加标签。

#### Scenario: Bulk delete
- **GIVEN** 选中 N 条媒体
- **WHEN** 执行批量删除
- **THEN** 所有选中媒体被软删除
- **AND** 返回成功/失败计数

#### Scenario: Bulk move to folder
- **GIVEN** 选中 N 条媒体
- **WHEN** 移动到目标文件夹
- **THEN** 所有选中媒体的 `folder_path` 更新为目标路径

#### Scenario: Bulk add tags
- **GIVEN** 选中 N 条媒体
- **WHEN** 添加标签 ['banner', 'featured']
- **THEN** 标签追加到每条媒体的 `tags` 数组（去重）

---

## Related Specs

- `database-schema` — media 表定义
- `plugin-api` — 插件 ctx.media 能力
- `admin-ui-host` — MediaLibrary 页面
