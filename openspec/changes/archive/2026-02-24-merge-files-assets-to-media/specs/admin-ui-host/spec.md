# admin-ui-host Specification

## ADDED Requirements

### Requirement: Media Library Page

Admin UI SHALL 提供统一的媒体库页面（路由 `/media`），替代原 Files 和 Assets 两个独立页面。该页面支持网格/列表视图切换、拖拽上传、搜索过滤、文件夹导航、批量操作和媒体详情编辑。

#### Scenario: Media library page accessible
- **WHEN** 用户导航到 `/media`
- **THEN** 显示媒体库页面
- **AND** 默认显示网格视图
- **AND** 展示当前租户的所有原始媒体（排除变体）

#### Scenario: Grid and list view toggle
- **WHEN** 用户切换视图模式
- **THEN** 在网格视图和列表视图之间切换
- **AND** 网格视图展示缩略图
- **AND** 列表视图展示文件名、大小、类型、创建时间

#### Scenario: Drag and drop upload
- **WHEN** 用户拖拽文件到上传区域
- **THEN** 显示上传进度指示器
- **AND** 支持多文件并发上传
- **AND** 上传完成后自动刷新列表

#### Scenario: Media detail sheet
- **WHEN** 用户点击一条媒体
- **THEN** 右侧滑出 Sheet 面板
- **AND** 显示图片预览
- **AND** 显示变体缩略图列表（thumbnail, small, medium, large）
- **AND** 提供元数据编辑表单（alt, title, tags, folder_path）

#### Scenario: Content type filter
- **WHEN** 用户选择内容类型过滤器
- **THEN** 支持以下分类（从 `mime_type` 派生）：
  - 图片：`image/*`
  - 视频：`video/*`
  - 音频：`audio/*`
  - 文档：`application/pdf`, `application/msword`, `text/*` 等
  - 压缩包：`application/zip`, `application/x-rar` 等
  - 其他：未匹配的 mime_type

#### Scenario: Storage provider visibility
- **WHEN** 媒体列表以列表视图展示
- **THEN** 显示 Storage Provider 列（Badge 形式：Local / S3 等）
- **AND** 支持按存储提供商过滤

#### Scenario: Search by filename
- **WHEN** 用户在搜索框输入关键词
- **THEN** 按 `filename` 模糊匹配过滤

---

### Requirement: Media Picker Dialog

Admin UI SHALL 提供可复用的 `<MediaPickerDialog>` 组件，供其他页面嵌入使用（如实体编辑表单中选择封面图）。

#### Scenario: Single select mode
- **WHEN** 页面以 `mode="single"` 打开 MediaPickerDialog
- **THEN** 用户可浏览和选择一条媒体
- **AND** 选择后返回媒体 ID 和元数据

#### Scenario: Multi select mode
- **WHEN** 页面以 `mode="multi"` 打开 MediaPickerDialog
- **THEN** 用户可勾选多条媒体
- **AND** 确认后返回选中的媒体列表

---

## REMOVED Requirements

### Requirement: Separate Files and Assets Pages
**Reason**: Files 和 Assets 页面合并为统一的 MediaLibrary 页面。
**Migration**: 路由从 `/files` + `/assets` 合并为 `/media`。

---

## Related Specs

- `media-management` — 媒体管理核心能力
- `plugin-api` — 插件 media 能力
