# Cromwell CMS 性能优化配置指南

## 环境变量配置

在项目根目录创建 `.env` 文件，添加以下配置：

```bash
# 数据库配置
DB_SLOW_QUERY_THRESHOLD=1000  # 慢查询阈值（毫秒）
DB_QUERY_CACHE=true           # 启用查询缓存

# Redis 缓存配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_PREFIX=cromwell:

# 内存缓存配置
CACHE_MEMORY_MAX=1000         # 内存缓存最大条目数
CACHE_MEMORY_TTL=300          # 内存缓存默认TTL（秒）
CACHE_DEFAULT_TTL=300         # 默认缓存TTL（秒）
CACHE_COMPRESSION=true        # 启用缓存压缩

# 性能监控配置
PERFORMANCE_SLOW_REQUEST_THRESHOLD=1000  # 慢请求阈值（毫秒）
PERFORMANCE_HISTORY_SIZE=1000            # 性能历史数据大小

# 构建优化配置
BUILD_CACHE_ENABLED=true      # 启用构建缓存
BUILD_PARALLEL_JOBS=4         # 并行构建任务数
BUILD_INCREMENTAL=true        # 启用增量构建
```

## 包依赖配置

### 1. 添加 Redis 依赖

在 `system/core/backend/package.json` 中添加：

```json
{
  "dependencies": {
    "ioredis": "^5.3.2",
    "compression": "^1.7.4"
  }
}
```

### 2. 添加构建优化依赖

在根目录 `package.json` 中添加：

```json
{
  "devDependencies": {
    "p-limit": "^4.0.0",
    "glob": "^10.3.10"
  }
}
```

## 系统集成配置

### 1. 在 NestJS 应用中注册服务

在 `system/server/src/app.module.ts` 中：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheManager } from '@cromwell/core-backend/services/cache.manager';
import { CacheStrategyManager } from '@cromwell/core-backend/services/cache-strategy.manager';
import { DatabaseOptimizer } from '@cromwell/core-backend/services/database-optimizer';
import { PerformanceMonitor } from '@cromwell/core-backend/services/performance-monitor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [
    CacheManager,
    CacheStrategyManager,
    DatabaseOptimizer,
    PerformanceMonitor,
  ],
  exports: [
    CacheManager,
    CacheStrategyManager,
    DatabaseOptimizer,
    PerformanceMonitor,
  ],
})
export class AppModule {}
```

### 2. 中间件集成

创建 `system/server/src/middleware/performance.middleware.ts`：

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PerformanceMonitor } from '@cromwell/core-backend/services/performance-monitor';

@Injectable()
export class PerformanceMiddleware implements NestMiddleware {
  constructor(private performanceMonitor: PerformanceMonitor) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      this.performanceMonitor.recordRequest({
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime,
        timestamp: Date.now(),
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    });

    next();
  }
}
```

### 3. 控制器集成示例

更新 `system/server/src/controllers/product.controller.ts`：

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { CacheStrategyManager, CACHE_STRATEGIES } from '@cromwell/core-backend/services/cache-strategy.manager';
import { DatabaseOptimizer } from '@cromwell/core-backend/services/database-optimizer';

@Controller('products')
export class ProductController {
  constructor(
    private cacheStrategyManager: CacheStrategyManager,
    private databaseOptimizer: DatabaseOptimizer
  ) {}

  @Get()
  async getProducts(@Query() query: any) {
    const cacheKey = `products:${JSON.stringify(query)}`;
    
    return this.cacheStrategyManager.getOrSet(
      cacheKey,
      async () => {
        // 优化的数据库查询
        return this.databaseOptimizer.monitorQuery(
          'getProducts',
          () => this.productService.getProducts(query)
        );
      },
      CACHE_STRATEGIES.PRODUCT_DATA
    );
  }

  @Get('featured')
  async getFeaturedProducts() {
    return this.cacheStrategyManager.getOrSet(
      'featured_products',
      () => this.productService.getFeaturedProducts(),
      CACHE_STRATEGIES.PRODUCT_DATA
    );
  }
}
```

### 4. Repository 优化示例

更新 `system/core/backend/src/repositories/product.repository.ts`：

```typescript
import { Injectable } from '@nestjs/common';
import { EntityRepository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { BaseRepository } from './base.repository';
import { DatabaseOptimizer, OptimizeQuery, QueryCache } from '../services/database-optimizer';

@EntityRepository(Product)
@Injectable()
export class ProductRepository extends BaseRepository<Product> {
  constructor(private databaseOptimizer: DatabaseOptimizer) {
    super(Product);
  }

  @OptimizeQuery({ 
    cache: true, 
    relations: ['categories', 'images', 'attributes'],
    monitor: true 
  })
  @QueryCache({ ttl: 1800 }) // 30分钟缓存
  async findFeaturedProducts(limit: number = 10): Promise<Product[]> {
    const queryBuilder = this.createQueryBuilder('product');
    
    return this.databaseOptimizer.optimizeQueryBuilder(queryBuilder, {
      relations: ['categories', 'images', 'attributes'],
      selectFields: [
        'product.id',
        'product.name',
        'product.price', 
        'product.mainImage',
        'categories.name',
        'attributes.key',
        'attributes.values'
      ]
    })
    .where('product.isFeatured = :featured', { featured: true })
    .andWhere('product.isEnabled = :enabled', { enabled: true })
    .orderBy('product.views', 'DESC')
    .limit(limit)
    .getMany();
  }

  async findProductsWithPagination(options: {
    page: number;
    limit: number;
    categoryId?: number;
  }) {
    const queryBuilder = this.createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'category')
      .where('product.isEnabled = :enabled', { enabled: true });

    if (options.categoryId) {
      queryBuilder.andWhere('category.id = :categoryId', { 
        categoryId: options.categoryId 
      });
    }

    return this.databaseOptimizer.optimizedPagination(queryBuilder, {
      page: options.page,
      limit: options.limit,
      orderBy: 'createDate',
      orderDirection: 'DESC'
    });
  }
}
```

## Docker 配置优化

### docker-compose.yml 添加 Redis

```yaml
version: '3.8'
services:
  cromwell-app:
    build: .
    ports:
      - "4016:4016"
    environment:
      - REDIS_HOST=redis
      - DB_HOST=postgres
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: cromwell
      POSTGRES_USER: cromwell
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  redis_data:
  postgres_data:
```

## 数据库索引优化

### PostgreSQL 优化脚本

创建 `database/optimize.sql`：

```sql
-- 产品表优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_enabled_featured 
  ON products (is_enabled, is_featured) WHERE is_enabled = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_price 
  ON products (category_id, price) WHERE is_enabled = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_search 
  ON products USING gin(to_tsvector('english', name)) WHERE is_enabled = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_create_date 
  ON products (create_date DESC) WHERE is_enabled = true;

-- 订单表优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_date 
  ON orders (user_id, create_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_date 
  ON orders (status, create_date DESC);

-- 文章表优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_published 
  ON posts (is_enabled, publish_date DESC) WHERE is_enabled = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_date 
  ON posts (author_id, publish_date DESC) WHERE is_enabled = true;

-- 分类表优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_parent_tree 
  ON product_categories (parent_id) WHERE parent_id IS NOT NULL;

-- 产品评价表优化
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_product_approved 
  ON product_reviews (product_id, is_approved, create_date DESC) 
  WHERE is_approved = true;

-- 更新表统计信息
ANALYZE products;
ANALYZE orders;
ANALYZE posts;
ANALYZE product_categories;
ANALYZE product_reviews;
```

## 监控和告警配置

### 1. 健康检查端点

在 `system/server/src/controllers/health.controller.ts`：

```typescript
import { Controller, Get } from '@nestjs/common';
import { PerformanceMonitor } from '@cromwell/core-backend/services/performance-monitor';
import { CacheManager } from '@cromwell/core-backend/services/cache.manager';
import { DatabaseOptimizer } from '@cromwell/core-backend/services/database-optimizer';

@Controller('health')
export class HealthController {
  constructor(
    private performanceMonitor: PerformanceMonitor,
    private cacheManager: CacheManager,
    private databaseOptimizer: DatabaseOptimizer
  ) {}

  @Get()
  async getHealth() {
    return this.performanceMonitor.getHealthStatus();
  }

  @Get('metrics')
  async getMetrics() {
    const performanceMetrics = await this.performanceMonitor.getCurrentMetrics();
    const cacheStats = this.cacheManager.getStats();
    const queryStats = this.databaseOptimizer.getQueryMetrics();

    return {
      performance: performanceMetrics,
      cache: cacheStats,
      database: queryStats,
    };
  }

  @Get('report')
  async getReport(@Query() query: { from?: string; to?: string }) {
    const from = query.from ? new Date(query.from).getTime() : Date.now() - 24 * 60 * 60 * 1000;
    const to = query.to ? new Date(query.to).getTime() : Date.now();

    return this.performanceMonitor.generatePerformanceReport({ from, to });
  }
}
```

## 部署优化建议

### 1. 生产环境配置

```bash
# 生产环境变量
NODE_ENV=production
DB_SLOW_QUERY_THRESHOLD=500
CACHE_DEFAULT_TTL=1800
PERFORMANCE_SLOW_REQUEST_THRESHOLD=500

# Redis 集群配置
REDIS_CLUSTER=true
REDIS_NODES=redis-1:6379,redis-2:6379,redis-3:6379
```

### 2. PM2 配置

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'cromwell-cms',
    script: 'system/manager/build/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4016
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

这些配置将显著提升 Cromwell CMS 的性能和稳定性，包括：

1. ✅ **缓存优化** - 多层缓存策略，Redis + 内存缓存
2. ✅ **数据库优化** - 查询优化、索引优化、连接池管理
3. ✅ **性能监控** - 实时性能指标、告警机制
4. ✅ **构建优化** - 并行构建、增量构建、构建缓存
5. ✅ **部署优化** - Docker 容器化、集群部署支持