# Search Engine Integration System - 实施计划

**OpenSpec ID**: `core-search-engine`
**状态**: 待批准
**创建时间**: 2026-01-13

---

## 1. 概述

实现可扩展的搜索引擎集成系统，支持多种搜索后端的无缝切换。

### 设计决策
- **方案**: Registry 优先 + SettingsService 驱动选择
- **双层设计**: SimpleSearchProvider（回退） + PostgresSearchProvider（Phase 1）
- **模式参考**: StorageProviderRegistry / SchedulerProviderRegistry

---

## 2. 文件结构

### Core 搜索抽象 (`apps/server/src/search/`)
```
apps/server/src/search/
├── index.ts                           # 模块导出
├── search.module.ts                   # NestJS 模块
├── search.service.ts                  # 门面服务
├── types.ts                           # 公共类型导出
├── providers/
│   ├── provider.interface.ts          # SearchProvider 接口定义
│   ├── provider.registry.ts           # SearchProviderRegistry
│   └── simple.provider.ts             # ILIKE 回退实现（Core 内置）
└── __tests__/
    ├── provider.registry.test.ts
    ├── simple.provider.test.ts
    └── search.service.test.ts
```

### 官方插件 (`plugins/search-postgres/`)
```
plugins/search-postgres/
├── plugin.json                        # 插件清单
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts                       # 插件入口
    ├── postgres.provider.ts           # PostgreSQL FTS 实现
    └── __tests__/
        └── postgres.provider.test.ts
```

### 多 Provider 共存设计
- 多个搜索插件可同时安装（postgres, meilisearch, elasticsearch）
- 通过 Settings 配置选择活跃 Provider
- 支持按租户级别切换搜索引擎

---

## 3. 接口和类型定义

### 3.1 SearchProviderMetadata

```typescript
interface SearchProviderMetadata {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  default?: boolean;
}
```

### 3.2 SearchQuery

```typescript
interface SearchQuery {
  term: string;
  filters?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  pagination?: { limit: number; offset: number };
  sort?: Array<{ field: string; direction: 'asc' | 'desc'; mode?: 'rank' | 'field' }>;
  highlight?: { fields?: string[]; fragmentSize?: number };
  language?: string;
}
```

### 3.3 SearchResult

```typescript
interface SearchHit {
  id: string;
  score: number;
  source: unknown;
  highlights?: Record<string, string[]>;
}

interface SearchResult {
  hits: SearchHit[];
  total: number;
  took?: number;
  facets?: Record<string, Array<{ value: string; count: number }>>;
}
```

### 3.4 SearchProvider

```typescript
interface SearchProvider {
  readonly metadata: SearchProviderMetadata;

  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<{ status: 'ok' | 'degraded' | 'error'; details?: unknown }>;

  indexDocument(index: string, id: string, doc: Record<string, unknown>): Promise<void>;
  bulkIndex(index: string, docs: Array<{ id: string; doc: Record<string, unknown> }>): Promise<void>;
  deleteDocument(index: string, id: string): Promise<void>;
  search(index: string, query: SearchQuery): Promise<SearchResult>;
}
```

### 3.5 SearchProviderFactory

```typescript
type SearchProviderFactory = (config: Record<string, unknown>) => SearchProvider;
```

---

## 4. PostgreSQL Full-text Search Schema

### 4.1 tsvector 列设计

```sql
-- 为可索引表添加 search_vector 列
ALTER TABLE <table_name> ADD COLUMN search_vector tsvector;

-- 带权重的 tsvector 生成
UPDATE <table_name> SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(tags::text, '')), 'C');
```

### 4.2 GIN 索引

```sql
CREATE INDEX CONCURRENTLY idx_<table>_search_vector
ON <table_name> USING GIN (search_vector);
```

### 4.3 触发器方案

```sql
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_<table>_search_vector
BEFORE INSERT OR UPDATE ON <table_name>
FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

### 4.4 查询示例

```sql
SELECT id, ts_rank_cd(search_vector, query) AS score
FROM <table_name>, websearch_to_tsquery('english', $1) query
WHERE search_vector @@ query
  AND tenant_id = $2
ORDER BY score DESC
LIMIT $3 OFFSET $4;
```

---

## 5. NestJS 模块设计

### 5.1 SearchModule

```typescript
@Module({
  imports: [SettingsModule, DatabaseModule],
  providers: [
    SearchProviderRegistry,
    SearchService,
    SimpleSearchProvider,
    PostgresSearchProvider,
  ],
  exports: [SearchService, SearchProviderRegistry],
})
export class SearchModule implements OnModuleInit {
  async onModuleInit() {
    // 注册内置 providers
    // simple 作为默认
  }
}
```

### 5.2 Settings 集成

| Key | Scope | 说明 |
|-----|-------|------|
| `search.provider` | tenant/global | 活跃 provider ID |
| `search.postgres.language` | global | FTS 语言配置 |
| `search.postgres.indexes.<name>.fields` | global | 索引字段配置 |

---

## 6. 实施步骤

### Phase 1: Core 搜索抽象

| 步骤 | 任务 | 文件 |
|------|------|------|
| 1 | 接口与类型定义 | `apps/server/src/search/providers/provider.interface.ts`, `types.ts` |
| 2 | Provider Registry 实现 | `apps/server/src/search/providers/provider.registry.ts` |
| 3 | SimpleSearchProvider 实现 | `apps/server/src/search/providers/simple.provider.ts` |
| 4 | SearchService 门面服务 | `apps/server/src/search/search.service.ts` |
| 5 | SearchModule 装配 | `apps/server/src/search/search.module.ts`, `index.ts` |
| 6 | 集成到 AppModule | `apps/server/src/app.module.ts` |
| 7 | Core 单元测试 | `apps/server/src/search/__tests__/*.test.ts` |

### Phase 2: PostgreSQL FTS 插件

| 步骤 | 任务 | 文件 |
|------|------|------|
| 8 | 插件脚手架 | `plugins/search-postgres/plugin.json`, `package.json`, etc. |
| 9 | PostgresSearchProvider 实现 | `plugins/search-postgres/src/postgres.provider.ts` |
| 10 | 插件入口与注册 | `plugins/search-postgres/src/index.ts` |
| 11 | 插件单元测试 | `plugins/search-postgres/src/__tests__/*.test.ts` |

---

## 7. 测试策略

### 7.1 单元测试

- **ProviderRegistry**: register/unregister/getActive with SettingsService mocks
- **SimpleSearchProvider**: ILIKE query building, tenant filter, pagination/sort
- **PostgresSearchProvider**: tsquery generation, ts_rank_cd ordering, filters
- **SearchService**: per-tenant provider dispatch

### 7.2 集成测试

- 迁移后 tsvector + GIN 索引能正确执行查询
- Trigger/hook 能在 insert/update 时生成 search_vector
- BulkIndex/Index/Delete 执行验证
- SettingsService 变更 providerId 后切换实现

---

## 8. 风险与缓解

| 风险 | 缓解策略 |
|------|----------|
| ILIKE 性能差 | 仅作回退，文档说明限制 |
| 多租户数据泄露 | 强制租户过滤，代码审查 |
| Schema 迁移复杂 | 幂等触发器，并发建索引 |
| FTS 语言配置不当 | 默认 'english'，可配置 |

---

## 9. 未来扩展 (Phase 2)

- ElasticsearchProvider stub
- MeilisearchProvider stub
- 高级功能：facets, highlighting, autocomplete
