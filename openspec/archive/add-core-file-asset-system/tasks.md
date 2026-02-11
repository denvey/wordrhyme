# Tasks: Add Core File/Asset System

## Prerequisites
- [ ] Settings System 已实现（存储配置依赖）
- [ ] AuditService 可用（审计日志依赖）

---

## Phase 1: Database Schema ✅

### 1.1 Create files table migration
- [x] 创建 `apps/server/drizzle/0005_file_asset_system.sql`
- [x] 定义 `files` 表结构
- [x] 添加索引：`idx_files_tenant`, `idx_files_mime`, `idx_files_created`
- **验证**: 运行 `pnpm db:migrate` 成功

### 1.2 Create multipart_uploads table migration
- [x] 创建 `multipart_uploads` 临时表
- [x] 添加过期索引：`idx_multipart_expires`
- **验证**: 表结构正确

### 1.3 Create assets and asset_variants tables migration
- [x] 创建 `assets` 表
- [x] 创建 `asset_variants` 表
- [x] 添加 GIN 索引用于标签查询
- **验证**: 外键约束正确

### 1.4 Define Drizzle schema files
- [x] 创建 `apps/server/src/db/schema/files.ts`
- [x] 创建 `apps/server/src/db/schema/assets.ts`
- [x] 导出 Zod schemas
- **验证**: TypeScript 类型正确

---

## Phase 2: Storage Provider Layer ✅

### 2.1 Define StorageProvider interface
- [x] 创建 `apps/server/src/file-storage/storage-provider.interface.ts`
- [x] 定义 `StorageProvider`, `UploadInput`, `UploadResult` 等类型
- [x] 定义 `StorageProviderFactory`, `StorageProviderMetadata` 类型
- **验证**: 接口类型完整

### 2.2 Implement StorageProviderRegistry
- [x] 创建 `apps/server/src/file-storage/storage-provider.registry.ts`
- [x] 实现 `register`, `get`, `list`, `getConfigSchema` 方法
- [x] 实现懒加载配置和实例化
- [x] 内置注册 `local` 提供者
- **验证**: 注册和获取提供者正确

### 2.3 Implement LocalStorageProvider
- [x] 创建 `apps/server/src/file-storage/providers/local.provider.ts`
- [x] 实现文件系统操作
- [x] 实现签名 token 生成（GET 和 PUT）
- **验证**: 单元测试覆盖 upload/download/delete

### 2.4 Implement storage provider factory
- [x] 创建 `apps/server/src/file-storage/storage-provider.factory.ts`
- [x] 根据 Settings 配置从 Registry 获取 provider
- **验证**: 动态切换 provider 正确

---

## Phase 3: File Service ✅

### 3.1 Create FileService
- [x] 创建 `apps/server/src/file-storage/file.service.ts`
- [x] 实现 `upload`, `get`, `delete`, `getSignedUrl`
- [x] 集成 AuditService
- **验证**: CRUD 操作正确

### 3.2 Implement file validation
- [x] 文件类型白名单验证
- [x] 文件大小限制验证
- [x] 读取 Settings 配置
- **验证**: 非法文件被拒绝

### 3.3 Implement storage path generation
- [x] 租户隔离路径：`tenants/{tenantId}/files/{date}/{uuid}.{ext}`
- **验证**: 路径格式正确，租户隔离

### 3.4 Implement soft delete
- [x] 标记 `deleted_at`
- [x] 查询自动过滤已删除
- **验证**: 软删除逻辑正确

---

## Phase 4: Multipart Upload ✅

### 4.1 Implement multipart upload service
- [x] 创建 `apps/server/src/file-storage/multipart-upload.service.ts`
- [x] 实现 `initiate`, `uploadPart`, `complete`, `abort`
- **验证**: 大文件上传成功

### 4.2 Add multipart cleanup job
- [x] 定期清理过期的 multipart uploads（24小时）
- **验证**: 过期上传被清理

---

## Phase 5: Asset Service ✅

### 5.1 Create AssetService
- [x] 创建 `apps/server/src/asset/asset.service.ts`
- [x] 实现 `create`, `get`, `update`, `delete`, `list`
- [x] 关联 File 记录
- **验证**: CRUD 操作正确

### 5.2 Implement asset type detection
- [x] 根据 MIME 类型自动检测 asset type
- **验证**: 图片/文档/视频正确分类

### 5.3 Implement asset query
- [x] 分页、排序、过滤
- [x] 标签 GIN 查询
- [x] 文件夹路径 LIKE 查询
- **验证**: 复杂查询正确

---

## Phase 6: Image Processing ✅

### 6.1 Integrate Sharp library
- [x] 安装 `sharp` 依赖（可选）
- [x] 创建 `apps/server/src/asset/image-processor.service.ts`
- **验证**: 基本图片操作可用

### 6.2 Implement variant generation
- [x] 预定义变体配置：thumbnail, small, medium, large
- [x] 实现 resize、format 转换
- **验证**: 变体尺寸正确

### 6.3 Implement lazy variant generation
- [x] 首次请求时生成
- [x] 缓存已生成的变体
- **验证**: 按需生成正确

### 6.4 Create variant storage
- [x] 变体存储到独立 key
- [x] 创建 `asset_variants` 记录
- **验证**: 变体记录正确

---

## Phase 7: CDN Integration ✅

### 7.1 Create CDNService
- [x] 创建 `apps/server/src/file-storage/cdn.service.ts`
- [x] URL 重写逻辑
- **验证**: CDN URL 格式正确

### 7.2 Implement signed CDN URLs
- [x] 签名算法实现
- [x] 过期时间处理
- **验证**: 签名验证通过

---

## Phase 8: tRPC API ✅

### 8.1 Create fileRouter
- [x] 创建 `apps/server/src/trpc/routers/files.ts`
- [x] 实现 `upload`, `get`, `delete`, `getSignedUrl`
- [x] 权限检查中间件
- **验证**: API 端点可用

### 8.2 Create assetRouter
- [x] 创建 `apps/server/src/trpc/routers/assets.ts`
- [x] 实现 `create`, `get`, `update`, `delete`, `list`, `getVariantUrl`
- **验证**: API 端点可用

### 8.3 Implement file upload endpoint
- [x] Multipart form 处理
- [x] 流式上传支持
- **验证**: 前端上传成功

---

## Phase 9: Plugin Integration ✅

### 9.1 Extend PluginContext types
- [x] 更新 `packages/plugin/src/types.ts`
- [x] 添加 `PluginFileCapability`, `PluginAssetCapability` 接口
- [x] 添加 `PluginStorageCapability` 接口
- **验证**: 类型定义完整

### 9.2 Implement PluginFileCapability
- [x] 租户限制
- [x] 能力声明检查
- [x] 上传限制
- **验证**: 插件访问受限

### 9.3 Implement PluginAssetCapability
- [x] 租户限制
- [x] 审计日志记录
- **验证**: 插件审计正确

### 9.4 Implement PluginStorageCapability
- [x] 实现 `registerProvider` 方法
- [x] 验证 `storage:provider` 能力声明
- [x] 自动注入 pluginId 到 metadata
- **验证**: 插件可注册存储提供者

---

## Phase 10: Official Storage Plugins ✅

### 10.1 Create plugin-storage-s3
- [x] 创建 `plugins/storage-s3/` 目录结构
- [x] 实现 `S3StorageProvider` 类
- [x] 定义配置 JSON Schema
- **验证**: S3 上传/下载/签名 URL 正确

### 10.2 Create plugin-storage-oss (Deferred - P3)
- [x] ~~创建 `plugins/storage-oss/` 目录结构~~ (Deferred to future iteration)
- **状态**: 延期到后续版本

### 10.3 Create plugin-storage-r2 (Deferred - P3)
- [x] ~~创建 `plugins/storage-r2/` 目录结构~~ (Deferred to future iteration)
- **状态**: 延期到后续版本

### 10.4 Storage plugin integration tests
- [x] 使用 MinIO 测试 S3 插件 (测试文件: `plugins/storage-s3/__tests__/`)
- [x] ~~模拟测试 OSS/R2 插件~~ (N/A - deferred)
- **验证**: 插件注册和使用流程正确

---

## Phase 11: Testing ✅

### 11.1 Unit tests for StorageProviders
- [x] LocalStorageProvider 测试 (`local-storage.provider.test.ts`)
- [x] S3StorageProvider 测试 (`plugins/storage-s3/__tests__/`)
- **验证**: 覆盖率 > 80%

### 11.2 Unit tests for FileService
- [x] 上传、下载、删除测试 (`storage.service.test.ts`)
- [x] 验证逻辑测试
- **验证**: 覆盖率 > 80%

### 11.3 Unit tests for AssetService
- [x] CRUD 测试 (`asset.service.test.ts`)
- [x] 查询测试
- **验证**: 覆盖率 > 80%

### 11.4 Integration tests
- [x] 端到端上传流程 (`file-upload-lifecycle.test.ts`)
- [x] Multipart 上传流程
- [x] 变体生成流程
- [x] Plugin Capability 测试 (`plugin-file-asset-capability.test.ts`)
- **验证**: 关键路径覆盖

---

## Phase 12: Documentation ✅

### 12.1 Update API documentation
- [x] 文档化 file/asset API 端点 (`docs/api/FILE_STORAGE_API.md`, `docs/api/ASSET_API.md`)
- [x] 请求/响应示例
- **验证**: 文档与实现一致

### 12.2 Add configuration guide
- [x] 存储配置指南 (`docs/guides/STORAGE_CONFIGURATION.md`)
- [x] CDN 配置指南 (包含在存储配置指南中)
- **验证**: 配置步骤清晰

---

## Parallelizable Tasks

以下任务可并行执行：
- Phase 2.2 (Local Provider) 和 Phase 2.3 (S3 Provider)
- Phase 3 (File Service) 和 Phase 6.1 (Sharp Integration)
- Phase 8.1 (fileRouter) 和 Phase 8.2 (assetRouter)
- Phase 10 (Official Storage Plugins) 各插件实现
- Phase 11 (Testing) 各测试任务

---

## Dependencies Graph

```
Phase 1 (DB Schema)
    ↓
Phase 2 (Storage Providers)
    ↓
Phase 3 (File Service) ← Phase 4 (Multipart)
    ↓
Phase 5 (Asset Service) ← Phase 6 (Image Processing)
    ↓
Phase 7 (CDN) ← Phase 8 (tRPC API)
    ↓
Phase 9 (Plugin Integration)
    ↓
Phase 10 (Official Storage Plugins)
    ↓
Phase 11 (Testing)
    ↓
Phase 12 (Documentation)
```
