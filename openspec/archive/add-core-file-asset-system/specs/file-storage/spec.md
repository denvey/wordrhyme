# file-storage Specification

## Purpose

提供统一的文件存储抽象层，支持多种存储后端（Local、S3、OSS、R2），处理文件上传、下载、删除和签名 URL 生成。

## ADDED Requirements

### Requirement: Storage Provider Abstraction

系统 SHALL 提供统一的存储提供者接口 `StorageProvider`。Core 内置 `local` 存储，其他云存储（S3、OSS、R2 等）MUST 通过插件扩展。所有存储操作 MUST 通过此接口进行。

#### Scenario: Upload file to local storage
- **GIVEN** 存储配置为 local provider
- **WHEN** 调用 `provider.upload(input)` 上传文件
- **THEN** 文件存储到本地文件系统
- **AND** 返回 `UploadResult` 包含 `key` 和 `size`

#### Scenario: Upload file to S3 storage
- **GIVEN** 存储配置为 S3 provider
- **WHEN** 调用 `provider.upload(input)` 上传文件
- **THEN** 文件上传到 S3 bucket
- **AND** 返回 `UploadResult` 包含 `key`、`size` 和 `etag`

#### Scenario: Download file from storage
- **WHEN** 调用 `provider.download(key)`
- **THEN** 返回文件内容的 `Buffer`
- **AND** 如果文件不存在则抛出 `FileNotFoundError`

#### Scenario: Delete file from storage
- **WHEN** 调用 `provider.delete(key)`
- **THEN** 文件从存储中删除
- **AND** 如果文件不存在则静默成功（幂等）

---

### Requirement: Signed URL Generation

系统 SHALL 支持生成签名 URL 用于私有文件的临时访问和直传。签名 URL MUST 包含过期时间，MUST 支持 GET（下载）和 PUT（直传）两种操作。

#### Scenario: Generate signed GET URL for private file
- **GIVEN** 文件 `file-123` 存储在 S3
- **WHEN** 调用 `provider.getSignedUrl(key, { expiresIn: 3600, operation: 'get' })`
- **THEN** 返回有效期为 1 小时的签名 URL
- **AND** URL 可用于直接下载文件

#### Scenario: Generate signed PUT URL for direct upload
- **GIVEN** 存储配置为 S3 provider
- **WHEN** 调用 `provider.getSignedUrl(key, { expiresIn: 3600, operation: 'put', contentType: 'image/jpeg' })`
- **THEN** 返回有效期为 1 小时的签名 PUT URL
- **AND** 客户端可使用该 URL 直接上传文件到 S3

#### Scenario: Signed URL expires
- **GIVEN** 签名 URL 过期时间已过
- **WHEN** 访问该 URL
- **THEN** 返回 403 Forbidden

#### Scenario: Local provider signed URL
- **GIVEN** 存储配置为 local provider
- **WHEN** 调用 `provider.getSignedUrl(key, { operation: 'get' })`
- **THEN** 返回内部 API 路由 `/api/files/{key}?token={token}`
- **AND** token 包含过期时间并签名

#### Scenario: Local provider signed PUT URL
- **GIVEN** 存储配置为 local provider
- **WHEN** 调用 `provider.getSignedUrl(key, { operation: 'put' })`
- **THEN** 返回内部 API 路由 `/api/files/upload/{key}?token={token}`
- **AND** 客户端可通过该端点上传文件

---

### Requirement: File Metadata Storage

系统 SHALL 在数据库中存储文件元数据，包括：`id`、`tenant_id`、`filename`、`mime_type`、`size`、`storage_provider`、`storage_key`、`uploaded_by`、`created_at`。

#### Scenario: File record created on upload
- **WHEN** 文件上传成功
- **THEN** 创建 `files` 表记录
- **AND** `storage_key` 包含租户隔离路径
- **AND** `uploaded_by` 设置为当前用户 ID

#### Scenario: Tenant isolation in storage path
- **GIVEN** 租户 ID 为 `tenant-abc`
- **WHEN** 上传文件 `photo.jpg`
- **THEN** `storage_key` 格式为 `tenants/tenant-abc/files/{date}/{uuid}.jpg`

---

### Requirement: Multipart Upload

系统 SHALL 支持大文件分片上传。当文件大小超过 5MB 时，MUST 使用 multipart 上传。分片 MUST 保证唯一性和顺序性。

#### Scenario: Initiate multipart upload
- **GIVEN** 文件大小为 50MB
- **WHEN** 调用 `initiateUpload({ filename, mimeType, totalSize })`
- **THEN** 返回 `uploadId`、`partSize` 和 `totalParts`
- **AND** 创建 `multipart_uploads` 临时记录

#### Scenario: Upload part with ordering
- **GIVEN** multipart 上传已初始化，totalParts 为 10
- **WHEN** 调用 `uploadPart({ uploadId, partNumber: 3, body })`
- **THEN** 分片上传到存储
- **AND** 使用 `parts[partNumber]` 存储结果，确保唯一性

#### Scenario: Upload duplicate part number
- **GIVEN** partNumber 3 已上传
- **WHEN** 再次调用 `uploadPart({ uploadId, partNumber: 3, body })`
- **THEN** 覆盖之前的分片结果
- **AND** 操作幂等

#### Scenario: Invalid part number rejected
- **GIVEN** totalParts 为 10
- **WHEN** 调用 `uploadPart({ uploadId, partNumber: 15, body })`
- **THEN** 返回 `InvalidPartNumberError`
- **AND** 分片不上传

#### Scenario: Complete multipart upload with validation
- **GIVEN** totalParts 为 10，仅上传了 8 个分片
- **WHEN** 调用 `completeUpload(uploadId)`
- **THEN** 返回 `IncompleteUploadError`
- **AND** 提示缺失的分片编号

#### Scenario: Complete multipart upload success
- **GIVEN** 所有 10 个分片已上传
- **WHEN** 调用 `completeUpload(uploadId)`
- **THEN** 按 partNumber 顺序合并所有分片
- **AND** 创建 `files` 表记录
- **AND** 删除 `multipart_uploads` 临时记录
- **AND** 记录审计日志

#### Scenario: Abort multipart upload
- **WHEN** 调用 `abortUpload(uploadId)`
- **THEN** 清理已上传的分片
- **AND** 删除 `multipart_uploads` 临时记录

#### Scenario: Multipart upload expires
- **GIVEN** multipart 上传超过 24 小时未完成
- **WHEN** 清理任务运行（每 15 分钟）
- **THEN** 自动 abort 过期的上传
- **AND** 记录清理日志

---

### Requirement: File Upload Validation

系统 SHALL 在上传前验证文件类型和大小。不符合限制的文件 MUST 被拒绝。

#### Scenario: File type validation
- **GIVEN** 允许的文件类型为 `['image/*', 'application/pdf']`
- **WHEN** 上传 `script.exe` (application/octet-stream)
- **THEN** 上传被拒绝
- **AND** 返回 `InvalidFileTypeError`

#### Scenario: File size validation
- **GIVEN** 最大文件大小为 100MB
- **WHEN** 上传 150MB 的文件
- **THEN** 上传被拒绝
- **AND** 返回 `FileTooLargeError`

---

### Requirement: Soft Delete and Retention

文件 SHALL 支持软删除。删除的文件 MUST 标记 `deleted_at` 而非物理删除。系统 SHALL 提供可配置的保留期和定时清理机制。

#### Scenario: Soft delete file
- **WHEN** 调用 `fileService.delete(fileId)`
- **THEN** 更新 `files.deleted_at` 为当前时间
- **AND** 文件不再在列表查询中返回
- **AND** 存储中的实际文件保留
- **AND** 记录审计日志

#### Scenario: Permanent delete after retention period
- **GIVEN** 保留期配置为 30 天
- **AND** 文件已软删除超过 30 天
- **WHEN** 清理任务运行（每天凌晨 3 点）
- **THEN** 从存储中删除实际文件
- **AND** 删除 `files` 表记录
- **AND** 记录 `permanent_delete` 审计日志

#### Scenario: Restore soft-deleted file
- **GIVEN** 文件已软删除但未超过保留期
- **WHEN** 调用 `fileService.restore(fileId)`
- **THEN** 清除 `files.deleted_at`
- **AND** 文件重新可访问
- **AND** 记录 `restore` 审计日志

#### Scenario: Restore permanently deleted file fails
- **GIVEN** 文件已被永久删除
- **WHEN** 调用 `fileService.restore(fileId)`
- **THEN** 返回 `FileAlreadyPermanentlyDeletedError`

#### Scenario: Configurable retention period
- **GIVEN** 设置 `storage.retention.softDeleteDays` 为 60
- **WHEN** 清理任务运行
- **THEN** 仅清理软删除超过 60 天的文件

---

### Requirement: File Access Audit

系统 SHALL 记录文件访问和操作的审计日志。

#### Scenario: Upload audit
- **WHEN** 文件上传成功
- **THEN** 记录审计事件 `{ entityType: 'file', action: 'create' }`

#### Scenario: Download audit
- **WHEN** 获取文件签名 URL
- **THEN** 记录审计事件 `{ entityType: 'file', action: 'access' }`

#### Scenario: Delete audit
- **WHEN** 文件被删除
- **THEN** 记录审计事件 `{ entityType: 'file', action: 'delete' }`

---

### Requirement: Plugin Storage Provider Registration

系统 SHALL 允许插件注册自定义存储提供者。插件 MUST 声明 `storage:provider` 能力才能注册存储提供者。

#### Scenario: Plugin registers storage provider
- **GIVEN** 插件声明了 `storage:provider` 能力
- **WHEN** 调用 `ctx.storage.registerProvider('cos', factory, metadata)`
- **THEN** 注册成功
- **AND** 提供者类型 `cos` 可用于存储配置

#### Scenario: List available providers
- **GIVEN** 系统内置 `local` 提供者
- **AND** 插件注册了 `s3` 和 `oss` 提供者
- **WHEN** 调用 `storageRegistry.list()`
- **THEN** 返回三个提供者的元数据
- **AND** 包含 `type`、`displayName`、`configSchema`、`pluginId`

#### Scenario: Duplicate provider type rejected
- **GIVEN** 提供者类型 `s3` 已注册
- **WHEN** 另一个插件尝试注册 `s3`
- **THEN** 返回 `ProviderAlreadyRegisteredError`
- **AND** 拒绝注册

#### Scenario: Get provider with lazy initialization
- **GIVEN** 提供者 `s3` 已注册
- **AND** Settings 配置了 S3 凭据
- **WHEN** 首次调用 `storageRegistry.get('s3')`
- **THEN** 从 Settings 加载配置
- **AND** 创建提供者实例
- **AND** 后续调用返回缓存实例

#### Scenario: Provider config schema for Admin UI
- **GIVEN** 插件注册提供者时提供了 `configSchema`
- **WHEN** Admin UI 查询 `storageRegistry.getConfigSchema('s3')`
- **THEN** 返回 JSON Schema 定义
- **AND** Admin UI 可动态渲染配置表单

#### Scenario: Provider not found
- **WHEN** 调用 `storageRegistry.get('unknown')`
- **THEN** 返回 `null`

#### Scenario: Switch storage provider
- **GIVEN** 当前配置为 `local` 提供者
- **WHEN** 管理员将 `storage.provider` 改为 `s3`
- **THEN** 新上传使用 `s3` 提供者
- **AND** 现有文件仍可通过原提供者访问

---

## MODIFIED Requirements

### Requirement: Database Schema Extension (database-schema)

`database-schema` spec SHALL 扩展以包含文件存储相关表。

#### Scenario: Files table exists
- **WHEN** 数据库迁移运行
- **THEN** 创建 `files` 表
- **AND** 包含索引：`idx_files_tenant`、`idx_files_mime`、`idx_files_created`

#### Scenario: Multipart uploads table exists
- **WHEN** 数据库迁移运行
- **THEN** 创建 `multipart_uploads` 临时表
- **AND** 包含过期索引：`idx_multipart_expires`

---

### Requirement: Plugin Context Extension (plugin-api)

`plugin-api` spec SHALL 扩展 `PluginContext` 以包含 `files` 能力。

#### Scenario: Plugin accesses file capability
- **WHEN** 插件访问 `ctx.files`
- **THEN** 获得受限的 `FileCapability` 接口
- **AND** 只能访问同租户的文件

#### Scenario: Plugin upload restricted
- **GIVEN** 插件声明了 `files:upload` 能力
- **AND** 插件上传限制为 10MB
- **WHEN** 插件上传 15MB 文件
- **THEN** 上传被拒绝
- **AND** 返回 `PluginUploadLimitExceededError`
