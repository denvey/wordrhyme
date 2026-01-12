# Change: Add Core File/Asset System

## Why

WordRhyme 作为 Headless CMS 缺少核心的文件管理能力：
1. 无法上传和管理媒体文件（图片、视频、文档）
2. 没有统一的存储抽象层，无法支持多种存储后端（Local、S3、OSS、R2）
3. 缺少图片处理能力（resize、optimize、watermark）
4. 插件无法以标准方式访问文件系统

文件/资源系统是 CMS 的核心功能，是内容管理、富文本编辑器、媒体库等功能的基础依赖。

## What Changes

### 新增功能

**File Storage Layer**:
- 多存储提供者抽象 (Local, S3, OSS, R2)
- Multipart 上传支持（大文件分片）
- 签名 URL 生成（私有文件访问）
- 文件元数据管理

**Asset Management**:
- Asset 抽象（带处理的文件）
- 图片变体生成（thumbnail, medium, large, original）
- 图片处理（resize, optimize, watermark）
- 标签和分类管理

**CDN 集成**:
- CDN URL 重写
- 缓存失效 API

### 数据库变更
- `files` - 文件记录表（元数据、存储位置）
- `assets` - 资源表（文件 + 处理信息）
- `asset_variants` - 资源变体表

### API 端点
- `file.upload(file, options)` - 上传文件
- `file.get(id)` - 获取文件信息
- `file.delete(id)` - 删除文件
- `file.getSignedUrl(id, expiresIn)` - 获取签名 URL
- `asset.create(fileId, options)` - 从文件创建资源
- `asset.list(query)` - 列出资源
- `asset.getVariant(id, variant)` - 获取资源变体

## Impact

### Affected Specs
- `database-schema` - 新增 files, assets, asset_variants 表
- `plugin-api` - 插件可访问 FileCapability 和 AssetCapability

### Affected Code
- `apps/server/src/db/schema/` - 新增 files.ts, assets.ts
- `apps/server/src/file-storage/` - 新增 FileStorageModule
- `apps/server/src/asset/` - 新增 AssetModule
- `apps/server/src/trpc/routers/` - 新增 fileRouter, assetRouter
- `packages/plugin/src/types.ts` - 扩展 PluginContext.files, PluginContext.assets

### Dependencies
- Settings System (存储配置：provider、bucket、credentials)

### Migration
- 新表创建，无数据迁移
- 存储配置通过 Settings System 管理
