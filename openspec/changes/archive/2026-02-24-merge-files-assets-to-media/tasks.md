## 0. 前置检查

- [x] 0.1 审计 `files` 表的非资产用途（导出/导入/临时文件），确认是否有系统功能直接依赖 `files` 表
  - 运行：`rg 'files\b' apps/server/src --type ts -l` 识别所有引用点
  - 如有系统文件依赖，需先将其迁移到 `export_jobs` 等独立表或云存储 TTL 机制
- [x] 0.2 全局依赖扫描：`rg 'from.*file-storage|from.*\/asset|from.*\/files|from.*\/assets' apps/server/src --type ts` 产出完整依赖清单
- [ ] 0.3 数据体检：运行迁移脚本中的 Step 4 检查 SQL，确认无孤儿 variants 或缺失 file 引用
  - ⏳ 需要 DB 环境运行，在部署前执行

## 1. 数据库 Schema

- [x] 1.1 创建 `packages/db/src/schema/media.ts`（Drizzle schema + Zod 导出）
  - 包含 `CHECK (parent_id IS DISTINCT FROM id)` 防自引用
  - Service 层强制 `organization_id` 一致性（变体从 parent 继承，不接受外部传入）
- [x] 1.2 添加 media 自引用关系到 `packages/db/src/relations/index.ts`
- [ ] 1.3 编写 SQL 迁移脚本（files + assets → media，含 variants 展开 + 数据体检 + 迁移后验证）
  - ⏳ 需要 DB 环境，在部署前编写
- [x] 1.4 删除 `packages/db/src/schema/files.ts` 和 `assets.ts`
- [x] 1.5 更新 `packages/db/src/schema/index.ts` barrel 导出

## 2. 后端 Service 层

- [x] 2.1 创建 `apps/server/src/media/media.service.ts`（合并 FileService + AssetService）
  - 包含：upload, getUploadUrl, confirmUpload, get, update, delete, restore, list
  - 变体生成：创建 media 行而非 JSONB，parent_id 指向原始
  - `createVariant()` 方法 MUST 从 parent 复制 `organization_id`，确保跨租户安全
  - 软删除时级联软删所有变体（Service 层实现，`UPDATE media SET deleted_at = NOW() WHERE parent_id = ?`）
- [x] 2.2 修改 `ImageProcessorService` 输出 media 行（parent_id + variant_name）
  - ✅ 已迁移到 `apps/server/src/media/image-processor.service.ts`
- [x] 2.3 修改 `FileController` 查询 `media` 表（替换 `files` 表引用）
- [x] 2.4 修改 `StorageProviderFactory` 移除对 files 表的依赖（确认无 files 表依赖，无需修改）
- [x] 2.5 迁移 `MultipartUploadService`：从 `files` 表引用改为 `media` 表
- [x] 2.6 迁移 `CdnService`：从 `File` 类型改为 `Media` 类型
- [x] 2.7 删除 `apps/server/src/file-storage/file.service.ts`
- [x] 2.8 删除 `apps/server/src/asset/asset.service.ts`
  - ✅ 整个 `asset/` 目录已删除

## 3. 后端 tRPC Router

- [x] 3.1 创建 `apps/server/src/trpc/routers/media.ts`（合并 filesRouter + assetsRouter）
  - upload, getUploadUrl, getDownloadUrl, get, update, delete, restore, list
  - getVariants（查询 parent_id = mediaId 的子行）
  - bulkDelete, moveFolder, addTags
- [x] 3.2 注册 mediaRouter 到 appRouter（`apps/server/src/trpc/router.ts`），移除 filesRouter 和 assetsRouter 导入
- [x] 3.3 更新 `apps/server/src/trpc/trpc.module.ts`：移除 FileService/MultipartUpload 的旧导入，添加 MediaService
- [x] 3.4 删除 `apps/server/src/trpc/routers/files.ts`
- [x] 3.5 删除 `apps/server/src/trpc/routers/assets.ts`

## 4. 权限系统

- [x] 4.1 修改 `resource-definitions.ts`：删除 `File`（L288）+ `Asset`（L310）subject，添加 `Media` subject
- [x] 4.2 编写权限数据迁移脚本：
  - `UPDATE role_permissions SET subject = 'Media' WHERE subject IN ('File', 'Asset')`
  - 去重处理：同一 role 对 File 和 Asset 的规则合并后可能产生重复行
- [x] 4.3 更新 `condition-presets.ts`：移除 `File`/`Asset` 相关 preset，添加 `Media` preset
- [x] 4.4 更新菜单 seed：media 相关菜单的 `requiredPermission` 使用 `Media` subject
  - ✅ `menus.seed.ts` 从 RESOURCE_DEFINITIONS 自动生成，无需手动改动
- [x] 4.5 更新 CASL ability 定义
  - ✅ `casl-ability.ts` 使用 `SubjectType` 泛型 catch-all，无需显式修改
- [x] 4.6 更新权限 seed 数据（`seed-roles.ts`、`seed-admin-missing-permissions.ts`）

## 5. 插件能力

- [x] 5.1 创建 `media.capability.ts`（合并 file.capability + asset.capability）
  - ctx.media: upload, get, update, delete, list, download, getSignedUrl, getVariantUrl, getVariants
- [x] 5.2 删除 `file.capability.ts` 和 `asset.capability.ts`
- [x] 5.3 更新 `capabilities/index.ts`：导入 media capability，注入 MediaService
- [x] 5.4 更新 `@wordrhyme/plugin` 包导出（ctx.media 类型定义，旧 files/assets 标记 @deprecated）
- [x] 5.5 更新 `plugin-manager.ts`：注册 media capability（MediaService 注入）
- [x] 5.6 更新 `plugin.module.ts` 和 `file-storage.module.ts`：注册并导出 MediaService

## 6. 前端 Admin UI

- [x] 6.1 创建 `apps/admin/src/pages/MediaLibrary.tsx`（统一媒体管理页面）
  - 网格/列表视图切换
  - 拖拽上传区域 + 进度指示
  - 搜索/过滤（mime_type 派生分类、tags、日期范围、存储提供商）
  - 存储提供商 Badge 展示
  - 文件夹导航
- [x] 6.2 创建媒体详情 Sheet（右侧滑出）
  - 图片预览 + 变体缩略图列表
  - 元数据编辑（alt, title, tags, folder_path）
- [x] 6.3 批量操作（多选删除、移动、打标签）
  - ✅ 多选 checkbox + bulkDelete 已实现
- [ ] 6.4 创建 `<MediaPickerDialog>` 可复用组件
  - ⏳ 延迟到有内容编辑器需要 picker 时实现
- [x] 6.5 更新路由：`/media` 替换 `/files` + `/assets`
  - ✅ App.tsx 路由已更新，menuPath 已在 resource-definitions.ts 中设为 '/media'
- [x] 6.6 删除 `Files.tsx` 和 `Assets.tsx`

## 7. 内部插件迁移

- [x] 7.1 更新 `hello-world` 插件：`ctx.files`/`ctx.assets` → `ctx.media`
  - ✅ 经验证，该插件不使用 ctx.files/ctx.assets，无需修改
- [x] 7.2 更新 `email-resend` 插件：同上
  - ✅ 经验证，该插件不使用 ctx.files/ctx.assets，无需修改
- [x] 7.3 更新 `storage-s3` 插件：确保与 media 表兼容
  - ✅ 经验证，该插件仅使用 ctx.storage/ctx.settings/ctx.permissions，无需修改

## 8. 测试与验证

- [x] 8.1 创建 `plugin-media-capability.test.ts`（18 个测试全部通过）
  - ✅ 覆盖：upload、get、update、delete、list、getSignedUrl、getVariants、getVariantUrl
  - ✅ 覆盖：组织上下文校验、文件大小限制、MIME 类型限制、通配符 MIME
  - ✅ Storage capability 测试保留不变
- [x] 8.2 零残留验证：确认活跃代码中无旧文件/资产引用

## 9. 清理

- [x] 9.1 删除 `apps/server/src/asset/` 目录
  - ✅ `image-processor.service.ts` 已迁移到 `apps/server/src/media/`
  - ✅ 旧 `asset.service.ts`、`asset.module.ts`、`index.ts` 已删除
- [x] 9.2 归档 `add-media-library-ui` 变更（被本变更取代）
  - ✅ 移至 `openspec/changes/archive/2026-02-24-add-media-library-ui`
- [x] 9.3 更新文档
  - ✅ 删除 `docs/api/ASSET_API.md` 和 `docs/api/FILE_STORAGE_API.md`
  - ✅ 创建 `docs/api/MEDIA_API.md`（统一 API 文档）
  - ✅ 更新 `docs/API_REFERENCE.md`（PluginContext 添加 media/settings/storage）
