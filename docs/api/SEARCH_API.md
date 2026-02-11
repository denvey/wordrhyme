# Search API

> 全文搜索系统 API 文档

## 概述

Search API 提供统一的全文搜索接口，支持多种搜索提供者（PostgreSQL 全文搜索、Meilisearch 等），自动按租户路由到活动的搜索引擎。

## 基础信息

- **服务类**: `SearchService`
- **多租户**: 搜索结果自动按租户隔离
- **可插拔**: 支持多种搜索引擎提供者

---

## 核心概念

### 索引 (Index)

搜索索引是文档的逻辑分组，类似数据库表。

常见索引：
- `content` - 内容索引
- `media` - 媒体文件索引
- `users` - 用户索引

### 文档 (Document)

可搜索的数据单元，包含可索引的字段。

```typescript
{
  id: 'doc-123',
  title: '文章标题',
  content: '文章正文...',
  tags: ['技术', 'AI'],
  createdAt: '2025-01-30T00:00:00Z',
}
```

### 提供者 (Provider)

实际执行搜索的引擎，如：
- `postgres` - PostgreSQL 全文搜索
- `meilisearch` - Meilisearch 搜索引擎

---

## Service API

### indexDocument

索引单个文档

```typescript
await searchService.indexDocument(
  index: string,           // 索引名称
  id: string,              // 文档 ID
  doc: Record<string, unknown>,  // 文档数据
  organizationId: string   // 租户 ID
);
```

**示例**:
```typescript
await searchService.indexDocument(
  'content',
  'article-123',
  {
    title: 'AI 技术趋势',
    content: '人工智能正在改变世界...',
    tags: ['AI', '技术'],
    author: 'user-456',
    publishedAt: new Date(),
  },
  'org-789'
);
```

---

### bulkIndex

批量索引多个文档

```typescript
await searchService.bulkIndex(
  index: string,
  docs: Array<{ id: string; doc: Record<string, unknown> }>,
  organizationId: string
);
```

**示例**:
```typescript
await searchService.bulkIndex(
  'content',
  [
    { id: 'article-1', doc: { title: '文章一', content: '...' } },
    { id: 'article-2', doc: { title: '文章二', content: '...' } },
    { id: 'article-3', doc: { title: '文章三', content: '...' } },
  ],
  'org-789'
);
```

---

### deleteDocument

从索引中删除文档

```typescript
await searchService.deleteDocument(
  index: string,
  id: string,
  organizationId: string
);
```

**示例**:
```typescript
await searchService.deleteDocument(
  'content',
  'article-123',
  'org-789'
);
```

---

### search

执行搜索查询

```typescript
const result = await searchService.search(
  index: string,
  query: SearchQuery
): Promise<SearchResult>;
```

**SearchQuery 参数**:

```typescript
interface SearchQuery {
  query: string;             // 搜索关键词
  organizationId: string;    // 租户 ID
  filters?: Record<string, unknown>;  // 过滤条件
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;  // 排序
  page?: number;             // 页码，从 1 开始
  pageSize?: number;         // 每页数量
  highlight?: boolean;       // 是否高亮匹配
  facets?: string[];         // 分面统计字段
}
```

**SearchResult 响应**:

```typescript
interface SearchResult {
  hits: Array<{
    id: string;
    score: number;           // 相关度分数
    doc: Record<string, unknown>;
    highlights?: Record<string, string[]>;  // 高亮片段
  }>;
  total: number;             // 总匹配数
  page: number;
  pageSize: number;
  processingTime: number;    // 处理时间（毫秒）
  facets?: Record<string, Array<{ value: string; count: number }>>;
}
```

**示例**:
```typescript
const result = await searchService.search('content', {
  query: 'AI 技术',
  organizationId: 'org-789',
  filters: {
    tags: ['技术'],
    publishedAt: { $gte: '2025-01-01' },
  },
  sort: [{ field: 'publishedAt', order: 'desc' }],
  page: 1,
  pageSize: 20,
  highlight: true,
  facets: ['tags', 'author'],
});

console.log(`找到 ${result.total} 条结果`);

result.hits.forEach(hit => {
  console.log(`[${hit.score.toFixed(2)}] ${hit.doc.title}`);
  if (hit.highlights?.content) {
    console.log(`  匹配: ${hit.highlights.content[0]}`);
  }
});

// 分面统计
if (result.facets?.tags) {
  console.log('标签分布:');
  result.facets.tags.forEach(f => {
    console.log(`  ${f.value}: ${f.count}`);
  });
}
```

---

### listProviders

列出所有注册的搜索提供者

```typescript
const providers = searchService.listProviders(): SearchProviderMetadata[];
```

**响应**:

```typescript
interface SearchProviderMetadata {
  id: string;                // 提供者 ID
  name: string;              // 显示名称
  version: string;           // 版本
  capabilities: string[];    // 支持的能力
}
```

**示例**:
```typescript
const providers = searchService.listProviders();

providers.forEach(p => {
  console.log(`${p.name} (${p.id}) v${p.version}`);
  console.log(`  能力: ${p.capabilities.join(', ')}`);
});
```

---

### getProviderMetadata

获取特定提供者的元数据

```typescript
const metadata = searchService.getProviderMetadata(id: string): SearchProviderMetadata | null;
```

---

### healthCheck

检查搜索服务健康状态

```typescript
const health = await searchService.healthCheck(
  organizationId?: string
): Promise<SearchHealthCheckResult>;
```

**响应**:

```typescript
interface SearchHealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  details?: Record<string, unknown>;
}
```

**示例**:
```typescript
const health = await searchService.healthCheck('org-789');

if (health.status === 'ok') {
  console.log('搜索服务正常');
} else {
  console.error(`搜索服务异常: ${health.status}`);
  console.error(health.details);
}
```

---

## 搜索提供者

### PostgreSQL (内置)

使用 PostgreSQL 全文搜索功能，适合中小规模数据。

**特点**:
- 无需额外服务
- 支持中文分词（需配置）
- 事务一致性

**配置**:
```typescript
// 自动使用，无需额外配置
```

### Meilisearch (可选)

高性能全文搜索引擎，适合大规模数据。

**特点**:
- 毫秒级响应
- 优秀的中文支持
- 丰富的搜索功能

**配置**:
```typescript
// 通过插件安装
// plugins/search-meilisearch
```

---

## 过滤器语法

### 等值匹配

```typescript
filters: {
  status: 'published',
  type: 'article',
}
```

### 比较操作

```typescript
filters: {
  views: { $gt: 100 },      // 大于
  views: { $gte: 100 },     // 大于等于
  views: { $lt: 1000 },     // 小于
  views: { $lte: 1000 },    // 小于等于
  views: { $ne: 0 },        // 不等于
}
```

### 范围查询

```typescript
filters: {
  publishedAt: {
    $gte: '2025-01-01',
    $lte: '2025-12-31',
  },
}
```

### 数组包含

```typescript
filters: {
  tags: { $in: ['AI', '技术'] },    // 包含任一
  tags: { $all: ['AI', '技术'] },   // 包含全部
}
```

### 存在性

```typescript
filters: {
  thumbnail: { $exists: true },      // 字段存在
  deletedAt: { $exists: false },     // 字段不存在
}
```

---

## 排序

```typescript
sort: [
  { field: 'publishedAt', order: 'desc' },  // 按发布时间降序
  { field: 'title', order: 'asc' },         // 按标题升序
]
```

---

## 高亮

启用高亮后，匹配的文本片段会被标记：

```typescript
highlight: true

// 响应中
highlights: {
  content: [
    '人工<em>智能</em>正在改变世界',
    '<em>AI</em>技术的最新进展',
  ],
}
```

---

## 分面统计

用于构建过滤器 UI：

```typescript
facets: ['tags', 'category', 'author']

// 响应中
facets: {
  tags: [
    { value: 'AI', count: 42 },
    { value: '技术', count: 38 },
  ],
  category: [
    { value: '技术', count: 50 },
    { value: '商业', count: 30 },
  ],
}
```

---

## 错误处理

| 状态 | 说明 |
|------|------|
| `ok` | 搜索服务正常 |
| `degraded` | 部分功能受限 |
| `error` | 搜索服务不可用 |

---

## 最佳实践

1. **批量索引**: 大量文档使用 `bulkIndex` 而非循环调用 `indexDocument`
2. **合理分页**: 避免请求过大的 `pageSize`
3. **使用过滤器**: 过滤器比全文搜索更高效
4. **监控健康**: 定期调用 `healthCheck` 确保服务可用
5. **索引设计**: 根据查询模式设计索引结构
6. **租户隔离**: 始终传入正确的 `organizationId`

