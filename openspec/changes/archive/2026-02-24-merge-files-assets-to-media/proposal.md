# Change: Merge Files + Assets to Unified Media Table

## Why

WordRhyme 目前使用 `files`（存储层）和 `assets`（CMS 语义层）两张表来管理媒体资源，它们之间存在 1:1 外键关系。这导致：

- 前端需维护两个管理页面（Files 和 Assets），用户操作割裂
- 后端两套 Service / Router / Capability，逻辑高度重复
- 插件需同时声明 `files:*` 和 `assets:*` 两组权限
- 变体通过 JSONB 数组存储，查询效率低

核心表只用于存储**内容资产**（运营/创作者上传的图片、视频、文档），系统文件（导出/导入/临时文件）不进入 media 表。

## What Changes

- **BREAKING** 合并 `files` + `assets` 为单一 `media` 表
- **BREAKING** 删除 `filesRouter` 和 `assetsRouter`，替换为 `mediaRouter`
- **BREAKING** 删除 `FileService` 和 `AssetService`，替换为 `MediaService`
- **BREAKING** 插件 API `ctx.files` + `ctx.assets` 合并为 `ctx.media`
- **BREAKING** 权限 subject 从 `File` + `Asset` 合并为 `Media`
- 前端合并 `Files.tsx` + `Assets.tsx` 为统一 `MediaLibrary.tsx`
- 变体从 JSONB 数组改为 `parent_id` 自引用关系行
- 内容分类通过 `mime_type` 派生，无额外 `type`/`kind` 字段
- 提供数据迁移脚本（SQL）
- 归档 `add-media-library-ui` 变更（被本变更取代）

## Impact

- Affected specs: `database-schema`, `plugin-api`, `admin-ui-host`
- New spec: `media-management`
- Supersedes change: `add-media-library-ui`
- Supersedes archived specs: `file-storage`, `asset-management`（在 `archive/add-core-file-asset-system/` 中）
- Affected code:
  - `packages/db/src/schema/files.ts` (DELETE)
  - `packages/db/src/schema/assets.ts` (DELETE)
  - `packages/db/src/schema/media.ts` (NEW)
  - `apps/server/src/file-storage/` (REFACTOR → `media/`)
  - `apps/server/src/asset/` (DELETE)
  - `apps/server/src/trpc/routers/files.ts` (DELETE)
  - `apps/server/src/trpc/routers/assets.ts` (DELETE)
  - `apps/server/src/trpc/routers/media.ts` (NEW)
  - `apps/server/src/plugins/capabilities/file.capability.ts` (DELETE)
  - `apps/server/src/plugins/capabilities/asset.capability.ts` (DELETE)
  - `apps/server/src/plugins/capabilities/media.capability.ts` (NEW)
  - `apps/server/src/permission/resource-definitions.ts` (MODIFY)
  - `apps/admin/src/pages/Files.tsx` (DELETE)
  - `apps/admin/src/pages/Assets.tsx` (DELETE)
  - `apps/admin/src/pages/MediaLibrary.tsx` (NEW)
  - `apps/admin/src/App.tsx` (MODIFY routes)
- No backward compatibility layers — direct migration
