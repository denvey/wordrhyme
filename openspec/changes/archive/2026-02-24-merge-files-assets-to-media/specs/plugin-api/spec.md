# plugin-api Specification

## ADDED Requirements

### Requirement: PluginContext Media Capability

`PluginContext` SHALL 扩展以包含 `media` 能力，替代原 `files` + `assets` 两组能力。插件通过 `ctx.media` 访问统一的媒体操作接口。

#### Scenario: Plugin accesses media capability
- **WHEN** 插件访问 `ctx.media`
- **THEN** 获得 `MediaCapability` 接口
- **AND** 只能访问同租户的媒体

#### Scenario: Plugin uploads media
- **GIVEN** 插件声明了 `media:upload` 能力
- **WHEN** 插件调用 `ctx.media.upload(buffer, options)`
- **THEN** 媒体上传成功，创建 media 记录
- **AND** `metadata.uploadedByPlugin` 设置为插件 ID
- **AND** 如果是图片，自动生成变体

#### Scenario: Plugin gets signed URL
- **GIVEN** 插件声明了 `media:read` 能力
- **WHEN** 插件调用 `ctx.media.getSignedUrl(mediaId)`
- **THEN** 返回有效的签名下载 URL

#### Scenario: Plugin gets upload URL
- **GIVEN** 插件声明了 `media:upload` 能力
- **WHEN** 插件调用 `ctx.media.getUploadUrl(filename, contentType)`
- **THEN** 返回签名的 PUT URL 和预创建的 mediaId
- **AND** 客户端可使用该 URL 直传文件

#### Scenario: Plugin gets variant URL
- **GIVEN** 插件声明了 `media:read` 能力
- **WHEN** 插件调用 `ctx.media.getVariantUrl(mediaId, 'thumbnail')`
- **THEN** 返回该变体的下载 URL

#### Scenario: Plugin lists media
- **GIVEN** 插件声明了 `media:read` 能力
- **WHEN** 插件调用 `ctx.media.list({ mimeType: 'image/%' })`
- **THEN** 返回同租户的图片媒体列表（排除变体）

#### Scenario: Plugin upload size restricted
- **GIVEN** 插件上传限制为 10MB
- **WHEN** 插件尝试上传 15MB 文件
- **THEN** 上传被拒绝
- **AND** 返回 `PluginUploadLimitExceededError`

#### Scenario: Plugin cross-tenant access denied
- **GIVEN** 插件属于租户 A
- **WHEN** 插件尝试访问租户 B 的媒体
- **THEN** 返回 `AccessDeniedError`

---

### Requirement: Media Capability Declaration

插件 manifest SHALL 通过 `permissions.required` 声明媒体相关权限。支持的权限：`media:read`、`media:upload`、`media:update`、`media:delete`。这些权限替代原 `files:*` 和 `assets:*` 权限。

#### Scenario: Manifest declares media permissions
- **GIVEN** 插件 manifest 的 `permissions.required` 包含 `['media:read', 'media:upload']`
- **WHEN** 插件加载
- **THEN** 插件可访问 `ctx.media.getSignedUrl` 和 `ctx.media.upload`
- **AND** 不能访问 `ctx.media.delete`（未声明）

---

## REMOVED Requirements

### Requirement: PluginContext File Capability
**Reason**: 合并到统一的 `ctx.media` 能力中。
**Migration**: 插件将 `ctx.files.*` 调用替换为 `ctx.media.*`，能力声明从 `files:*` 改为 `media:*`。

### Requirement: PluginContext Asset Capability
**Reason**: 合并到统一的 `ctx.media` 能力中。
**Migration**: 插件将 `ctx.assets.*` 调用替换为 `ctx.media.*`，能力声明从 `assets:*` 改为 `media:*`。

---

## Related Specs

- `media-management` — 媒体管理核心能力
- `plugin-runtime` — 插件运行时
