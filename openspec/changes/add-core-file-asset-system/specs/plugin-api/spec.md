# plugin-api Specification

## Purpose

扩展 `PluginContext` 以支持文件、资源和存储提供者注册能力，使插件能够访问和扩展文件系统功能。

## MODIFIED Requirements

### Requirement: PluginContext File Capability

`PluginContext` SHALL 扩展以包含 `files` 能力，允许插件操作同租户的文件。

#### Scenario: Plugin accesses file capability
- **WHEN** 插件访问 `ctx.files`
- **THEN** 获得受限的 `FileCapability` 接口
- **AND** 只能访问同租户的文件

#### Scenario: Plugin uploads file
- **GIVEN** 插件声明了 `files:upload` 能力
- **WHEN** 插件调用 `ctx.files.upload(buffer, options)`
- **THEN** 文件上传成功
- **AND** `metadata.uploadedByPlugin` 设置为插件 ID
- **AND** 记录审计日志

#### Scenario: Plugin upload size restricted
- **GIVEN** 插件上传限制为 10MB
- **WHEN** 插件尝试上传 15MB 文件
- **THEN** 上传被拒绝
- **AND** 返回 `PluginUploadLimitExceededError`

#### Scenario: Plugin gets signed URL
- **GIVEN** 插件声明了 `files:read` 能力
- **WHEN** 插件调用 `ctx.files.getSignedUrl(fileId)`
- **THEN** 返回有效的签名 URL
- **AND** 记录访问审计

#### Scenario: Plugin gets direct upload URL
- **GIVEN** 插件声明了 `files:upload` 能力
- **WHEN** 插件调用 `ctx.files.getUploadUrl(filename, contentType)`
- **THEN** 返回签名的 PUT URL 和预创建的 fileId
- **AND** 客户端可使用该 URL 直传文件

#### Scenario: Plugin cross-tenant access denied
- **GIVEN** 插件属于租户 A
- **WHEN** 插件尝试访问租户 B 的文件
- **THEN** 返回 `AccessDeniedError`

---

### Requirement: PluginContext Asset Capability

`PluginContext` SHALL 扩展以包含 `assets` 能力，允许插件操作同租户的资源。

#### Scenario: Plugin accesses asset capability
- **WHEN** 插件访问 `ctx.assets`
- **THEN** 获得受限的 `AssetCapability` 接口
- **AND** 只能访问同租户的资源

#### Scenario: Plugin creates asset
- **GIVEN** 插件声明了 `assets:create` 能力
- **WHEN** 插件调用 `ctx.assets.create(fileId, options)`
- **THEN** Asset 创建成功
- **AND** `metadata.createdByPlugin` 设置为插件 ID
- **AND** 记录审计日志

#### Scenario: Plugin gets variant URL
- **GIVEN** 插件声明了 `assets:read` 能力
- **WHEN** 插件调用 `ctx.assets.getVariantUrl(assetId, 'thumbnail')`
- **THEN** 返回变体 URL（按需生成）

#### Scenario: Plugin lists assets
- **GIVEN** 插件声明了 `assets:read` 能力
- **WHEN** 插件调用 `ctx.assets.list({ type: 'image' })`
- **THEN** 返回同租户的图片资源列表

---

### Requirement: PluginContext Storage Extension Capability

`PluginContext` SHALL 扩展以包含 `storage` 能力，允许插件注册自定义存储提供者。此能力 MUST 仅对声明 `storage:provider` 的插件可用。

#### Scenario: Plugin registers storage provider
- **GIVEN** 插件声明了 `storage:provider` 能力
- **WHEN** 插件调用 `ctx.storage.registerProvider('cos', factory, metadata)`
- **THEN** 存储提供者注册成功
- **AND** 记录日志 `Storage provider registered: cos by plugin-storage-cos`

#### Scenario: Plugin without capability cannot register
- **GIVEN** 插件未声明 `storage:provider` 能力
- **WHEN** 插件尝试调用 `ctx.storage.registerProvider(...)`
- **THEN** 返回 `CapabilityNotDeclaredError`

#### Scenario: Provider metadata includes plugin ID
- **WHEN** 存储提供者注册成功
- **THEN** `metadata.pluginId` 自动设置为当前插件 ID
- **AND** 可追溯提供者来源

#### Scenario: Provider config schema validation
- **GIVEN** 插件注册时提供了 `configSchema`
- **WHEN** 管理员配置存储提供者
- **THEN** 配置值按 schema 验证
- **AND** 无效配置被拒绝

---

## ADDED Requirements

### Requirement: Storage Provider Capability Declaration

插件 manifest SHALL 支持声明 `storage:provider` 能力。此能力表示插件可注册存储提供者。

#### Scenario: Manifest declares storage provider capability
- **GIVEN** 插件 manifest 包含 `capabilities: ['storage:provider']`
- **WHEN** 插件加载
- **THEN** 插件可访问 `ctx.storage.registerProvider`

#### Scenario: Manifest declares provider types
- **GIVEN** 插件 manifest 包含 `storage.providerTypes: ['s3']`
- **WHEN** Admin UI 显示存储配置
- **THEN** 展示该插件提供 S3 存储支持

---

## Related Specs

- `file-storage` - 底层文件存储能力
- `asset-management` - 资源管理能力
