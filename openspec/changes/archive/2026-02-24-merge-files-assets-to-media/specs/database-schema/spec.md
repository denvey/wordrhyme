# database-schema Specification

## ADDED Requirements

### Requirement: Media Table

数据库 SHALL 包含 `media` 表，用于统一存储内容资产。该表合并了原 `files` 和 `assets` 表的职责，同时包含物理存储字段和业务语义字段。变体通过 `parent_id` 自引用关系存储。

#### Scenario: Media table created after migration
- **WHEN** 数据库迁移运行
- **THEN** `media` 表被创建
- **AND** 包含唯一约束 `(organization_id, storage_provider, storage_key)`
- **AND** 包含部分唯一索引 `(parent_id, variant_name) WHERE parent_id IS NOT NULL`
- **AND** `parent_id` 外键引用 `media(id)` 并设置 `ON DELETE CASCADE`

#### Scenario: Media table indexes applied
- **WHEN** `media` 表创建完成
- **THEN** 存在索引 `(organization_id, folder_path) WHERE deleted_at IS NULL`
- **AND** 存在索引 `(organization_id, mime_type) WHERE deleted_at IS NULL`
- **AND** 存在索引 `(parent_id) WHERE parent_id IS NOT NULL`

---

## REMOVED Requirements

### Requirement: Files and Assets Tables
**Reason**: `files` 和 `assets` 两表合并为统一 `media` 表，消除 1:1 冗余。
**Migration**: SQL 迁移脚本将数据从 `files` + `assets` 迁移到 `media`，包括展开 variants JSONB 数组为独立行。见 `design.md` 中的迁移脚本。
