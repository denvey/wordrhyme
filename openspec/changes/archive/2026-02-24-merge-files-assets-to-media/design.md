## Context

WordRhyme 的文件/资源管理经历了分层设计：`files` 表负责物理存储，`assets` 表负责 CMS 语义。实际使用中，两者始终 1:1 对应，分层带来的灵活性未被利用，反而增加了维护复杂度。

本变更将两者合并为单一 `media` 表，仅用于内容资产管理。

## Goals / Non-Goals

- Goals:
  - 统一为单一 `media` 表，消除 1:1 冗余
  - 变体使用 `parent_id` 自引用，替代 JSONB 数组
  - 统一权限为 `Media` subject
  - 统一插件 API 为 `ctx.media`
  - 统一前端为单一 MediaLibrary 页面
  - 提供 SQL 迁移脚本

- Non-Goals:
  - 不处理系统文件（导出/导入等），由 `export_jobs` 等任务表管理
  - 不做 CDN 集成（后续变更）
  - 不做媒体转码（视频处理等）

## Decisions

### Decision: 单一 media 表而非保留双表

合并 `files` + `assets` 为一张 `media` 表，包含物理字段（storage_key, size, mime_type）和业务字段（alt, title, tags, folder_path）。

- Alternatives considered:
  - **保留双表 + 视图层统一**：增加查询复杂度，不解决根本问题
  - **保留双表 + 前端合并**：仍需两套后端逻辑
- Rationale: 1:1 关系证明分层无意义，合并最简洁

### Decision: 变体使用 parent_id 自引用

```
media
├── original (parent_id = NULL)
│   ├── thumbnail (parent_id = original.id, variant_name = 'thumbnail')
│   ├── small (parent_id = original.id, variant_name = 'small')
│   ├── medium (parent_id = original.id, variant_name = 'medium')
│   └── large (parent_id = original.id, variant_name = 'large')
```

- Alternatives considered:
  - **JSONB variants 数组**（现有方案）：无法直接查询变体、无独立 URL
  - **独立 variants 表**：过度设计，变体字段与 media 完全重合
- Rationale: 自引用最简洁，支持 SQL 查询、独立删除、与原始媒体相同的存储能力

### Decision: 无 type/kind 字段

内容分类通过 `mime_type` 在查询时派生：
- `mime_type LIKE 'image/%'` → 图片
- `mime_type LIKE 'video/%'` → 视频
- `mime_type LIKE 'audio/%'` → 音频
- 其余 → 文档

- Rationale: 系统文件不进表，变体通过 `parent_id IS NOT NULL` 识别，不需要额外字段

### Decision: 系统文件不进 media 表

- 报表/导出/导入 → `export_jobs` 或 `tasks` 表管理（任务结果，非资产）
- 临时文件 → 云存储 TTL 机制，不入库
- Rationale: media 表专注于内容资产，保持清晰职责

## Schema

```sql
CREATE TABLE media (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL REFERENCES organization(id),
  parent_id         TEXT REFERENCES media(id) ON DELETE CASCADE,
  variant_name      TEXT,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size              BIGINT NOT NULL DEFAULT 0,
  storage_provider  TEXT NOT NULL,
  storage_key       TEXT NOT NULL,
  storage_bucket    TEXT,
  public_url        TEXT,
  is_public         BOOLEAN NOT NULL DEFAULT false,
  checksum          TEXT,
  width             INTEGER,
  height            INTEGER,
  format            TEXT,
  alt               TEXT,
  title             TEXT,
  tags              TEXT[] DEFAULT '{}',
  folder_path       TEXT,
  metadata          JSONB DEFAULT '{}',
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP,

  UNIQUE (organization_id, storage_provider, storage_key),

  -- 多租户安全：防止 parent_id 自引用
  CHECK (parent_id IS DISTINCT FROM id)
);

-- 多租户安全：确保变体与原始媒体属于同一租户
-- 应用层在创建变体时 MUST 从 parent 继承 organization_id
-- Service 层通过 CHECK 验证（Drizzle schema 中使用 .check()）
-- 注：PostgreSQL 不支持 CHECK 引用其他行，此约束由 Service 层强制执行
-- MediaService.createVariant() 中 organization_id 从 parent 复制，不接受外部传入

-- 部分唯一索引：同一原始媒体的变体名称唯一
CREATE UNIQUE INDEX media_parent_variant_unique
  ON media (parent_id, variant_name)
  WHERE parent_id IS NOT NULL;

-- 查询索引
CREATE INDEX media_org_folder ON media (organization_id, folder_path)
  WHERE deleted_at IS NULL;
CREATE INDEX media_org_mime ON media (organization_id, mime_type)
  WHERE deleted_at IS NULL;
CREATE INDEX media_parent ON media (parent_id)
  WHERE parent_id IS NOT NULL;
-- 标签搜索（GIN 索引）
CREATE INDEX media_tags_gin ON media USING GIN(tags)
  WHERE deleted_at IS NULL;
-- 时间范围查询
CREATE INDEX media_org_created ON media (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

## Migration Plan

### SQL 迁移脚本

```sql
-- Step 1: 创建 media 表
CREATE TABLE media (...);

-- Step 2: 迁移原始文件（非变体）
INSERT INTO media (
  id, organization_id, parent_id, variant_name,
  filename, mime_type, size,
  storage_provider, storage_key, storage_bucket,
  public_url, is_public, checksum,
  width, height, format,
  alt, title, tags, folder_path, metadata,
  created_by, created_at, updated_at, deleted_at
)
SELECT
  a.id,                    -- 使用 asset.id 作为 media.id
  f.organization_id,
  NULL,                    -- parent_id = NULL (原始媒体)
  NULL,                    -- variant_name = NULL
  f.filename, f.mime_type, f.size,
  f.storage_provider, f.storage_key, f.storage_bucket,
  f.public_url, f.is_public, f.checksum,
  a.width, a.height, a.format,
  a.alt, a.title, a.tags, a.folder_path,
  COALESCE(f.metadata, '{}')::jsonb || COALESCE(a.metadata, '{}')::jsonb,
  COALESCE(a.created_by, f.uploaded_by),
  COALESCE(a.created_at, f.created_at),
  COALESCE(a.updated_at, f.updated_at),
  COALESCE(a.deleted_at, f.deleted_at)
FROM assets a
JOIN files f ON a.file_id = f.id;

-- Step 3: 迁移没有 asset 记录的孤立 files
INSERT INTO media (...)
SELECT
  f.id, f.organization_id, NULL, NULL,
  f.filename, f.mime_type, f.size,
  f.storage_provider, f.storage_key, f.storage_bucket,
  f.public_url, f.is_public, f.checksum,
  NULL, NULL, NULL,       -- 无图像信息
  NULL, NULL, '{}', NULL,
  f.metadata,
  f.uploaded_by, f.created_at, f.updated_at, f.deleted_at
FROM files f
LEFT JOIN assets a ON a.file_id = f.id
WHERE a.id IS NULL;

-- Step 4: 数据体检（迁移前执行，确认无脏数据）
-- 检查孤儿 variants（引用不存在的 fileId）
SELECT a.id AS asset_id, v->>'name' AS variant_name, v->>'fileId' AS file_id
FROM assets a
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.variants, '[]'::jsonb)) AS v
LEFT JOIN files vf ON vf.id = v->>'fileId'
WHERE vf.id IS NULL AND v->>'fileId' IS NOT NULL;
-- 如果有结果，需手动清理后再执行 Step 5

-- Step 5: 展开 variants JSONB 数组为独立行
INSERT INTO media (
  id, organization_id, parent_id, variant_name,
  filename, mime_type, size,
  storage_provider, storage_key, storage_bucket,
  public_url, is_public, checksum,
  width, height, format,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  m.organization_id,
  m.id,                   -- parent_id = 原始媒体
  v->>'name',             -- variant_name
  m.filename,
  m.mime_type,
  COALESCE((v->>'size')::bigint, 0),
  m.storage_provider,
  vf.storage_key,         -- 从 variant 引用的 file 获取 key
  m.storage_bucket,
  vf.public_url,
  m.is_public,
  vf.checksum,
  (v->>'width')::int,
  (v->>'height')::int,
  v->>'format',
  m.created_by,
  COALESCE((v->>'createdAt')::timestamp, m.created_at),
  m.updated_at
FROM media m
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE((SELECT a.variants FROM assets a WHERE a.id = m.id), '[]'::jsonb)
) AS v
INNER JOIN files vf ON vf.id = v->>'fileId'  -- INNER JOIN：跳过无效引用
WHERE m.parent_id IS NULL
  AND v->>'fileId' IS NOT NULL;

-- Step 6: 迁移后验证
SELECT 'total_media' AS check, COUNT(*) AS count FROM media
UNION ALL
SELECT 'originals', COUNT(*) FROM media WHERE parent_id IS NULL
UNION ALL
SELECT 'variants', COUNT(*) FROM media WHERE parent_id IS NOT NULL
UNION ALL
SELECT 'old_files', COUNT(*) FROM files
UNION ALL
SELECT 'old_assets', COUNT(*) FROM assets;
-- 确认 originals ≈ old_assets + 孤立 files，variants 数量合理后再删旧表

-- Step 7: 删除旧表
DROP TABLE assets;
DROP TABLE files;
```

### 回滚

如果需要回滚，需从备份恢复。建议在执行前 `pg_dump` 相关表。

## Risks / Trade-offs

- **Risk**: 迁移期间服务不可用 → Mitigation: 维护窗口执行，提前 pg_dump 备份
- **Risk**: 插件依赖旧 API → Mitigation: 内部插件（hello-world, email-resend, storage-s3）同步修改
- **Trade-off**: 变体使用自引用行增加行数 → 但简化查询、支持独立操作

## Open Questions

（无 — 所有设计决策已在分析阶段确认）
