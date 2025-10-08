import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Service } from 'typedi';
import { 
  SelectQueryBuilder, 
  Repository, 
  EntityManager,
  Connection,
  QueryRunner 
} from 'typeorm';
import { CacheStrategyManager, CACHE_STRATEGIES } from './cache-strategy.manager';

/**
 * 数据库查询优化服务
 */
@Service()
@Injectable()
export class DatabaseOptimizer {
  private readonly logger = new Logger(DatabaseOptimizer.name);
  private slowQueryThreshold: number;
  private enableQueryCache: boolean;
  private queryMetrics = new Map<string, {
    count: number;
    totalTime: number;
    averageTime: number;
    slowQueries: number;
  }>();

  constructor(
    private configService: ConfigService,
    private cacheStrategyManager: CacheStrategyManager
  ) {
    this.slowQueryThreshold = this.configService.get('DB_SLOW_QUERY_THRESHOLD', 1000);
    this.enableQueryCache = this.configService.get('DB_QUERY_CACHE', 'true') === 'true';
  }

  /**
   * 优化查询构建器 - 预加载关联数据以避免N+1问题
   */
  optimizeQueryBuilder<T>(
    queryBuilder: SelectQueryBuilder<T>,
    options: {
      relations?: string[];
      selectFields?: string[];
      indexes?: string[];
    } = {}
  ): SelectQueryBuilder<T> {
    const { relations = [], selectFields = [], indexes = [] } = options;

    // 添加关联预加载
    relations.forEach(relation => {
      if (relation.includes('.')) {
        // 嵌套关联
        queryBuilder.leftJoinAndSelect(relation, relation.split('.').pop()!);
      } else {
        queryBuilder.leftJoinAndSelect(`${queryBuilder.alias}.${relation}`, relation);
      }
    });

    // 限制选择字段以减少数据传输
    if (selectFields.length > 0) {
      queryBuilder.select(selectFields);
    }

    // 添加索引提示（针对MySQL）
    if (indexes.length > 0) {
      // 注意：这需要根据具体数据库类型实现
      // MySQL: USE INDEX, PostgreSQL: 通过查询计划优化
    }

    return queryBuilder;
  }

  /**
   * 执行带缓存的查询
   */
  async executeWithCache<T>(
    queryKey: string,
    queryExecutor: () => Promise<T>,
    cacheOptions?: {
      ttl?: number;
      namespace?: string;
    }
  ): Promise<T> {
    if (!this.enableQueryCache) {
      return queryExecutor();
    }

    const strategy = CACHE_STRATEGIES.DB_QUERY;
    const cacheKey = `query:${queryKey}`;

    return this.cacheStrategyManager.getOrSet(
      cacheKey,
      queryExecutor,
      strategy
    );
  }

  /**
   * 批量查询优化
   */
  async batchQuery<T, K>(
    repository: Repository<T>,
    ids: K[],
    keyField: keyof T,
    options: {
      batchSize?: number;
      relations?: string[];
      cache?: boolean;
    } = {}
  ): Promise<T[]> {
    const { batchSize = 100, relations = [], cache = true } = options;
    
    if (ids.length === 0) return [];

    const batches: K[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      batches.push(ids.slice(i, i + batchSize));
    }

    const queryExecutor = async () => {
      const results: T[] = [];
      
      for (const batch of batches) {
        const queryBuilder = repository.createQueryBuilder('entity')
          .where(`entity.${String(keyField)} IN (:...ids)`, { ids: batch });

        // 添加关联
        relations.forEach(relation => {
          queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
        });

        const batchResults = await queryBuilder.getMany();
        results.push(...batchResults);
      }

      return results;
    };

    if (cache) {
      const cacheKey = `batch:${repository.metadata.name}:${String(keyField)}:${ids.join(',')}`;
      return this.executeWithCache(cacheKey, queryExecutor);
    }

    return queryExecutor();
  }

  /**
   * 分页查询优化（支持游标分页）
   */
  async optimizedPagination<T>(
    queryBuilder: SelectQueryBuilder<T>,
    options: {
      page?: number;
      limit: number;
      cursor?: string | number;
      cursorField?: string;
      orderBy?: string;
      orderDirection?: 'ASC' | 'DESC';
    }
  ) {
    const { 
      page, 
      limit, 
      cursor, 
      cursorField = 'id', 
      orderBy = 'id', 
      orderDirection = 'ASC' 
    } = options;

    if (cursor) {
      // 游标分页 - 更适合大数据量
      queryBuilder.where(`${queryBuilder.alias}.${cursorField} > :cursor`, { cursor });
      queryBuilder.orderBy(`${queryBuilder.alias}.${orderBy}`, orderDirection);
      queryBuilder.take(limit + 1); // 多取一个判断是否有下一页

      const items = await queryBuilder.getMany();
      const hasNext = items.length > limit;
      if (hasNext) items.pop();

      return {
        items,
        hasNext,
        nextCursor: hasNext ? (items[items.length - 1] as any)[cursorField] : null,
        totalCount: null, // 游标分页不提供总数
      };
    } else {
      // 传统分页
      const offset = page ? (page - 1) * limit : 0;
      queryBuilder.skip(offset).take(limit);
      queryBuilder.orderBy(`${queryBuilder.alias}.${orderBy}`, orderDirection);

      const [items, totalCount] = await queryBuilder.getManyAndCount();

      return {
        items,
        hasNext: offset + limit < totalCount,
        nextCursor: null,
        totalCount,
        page: page || 1,
        totalPages: Math.ceil(totalCount / limit),
      };
    }
  }

  /**
   * 聚合查询优化
   */
  async optimizedAggregation<T>(
    repository: Repository<T>,
    options: {
      groupBy: string[];
      select: { [key: string]: string }; // 例如: { count: 'COUNT(*)', avg: 'AVG(price)' }
      where?: string;
      having?: string;
      parameters?: any;
      cache?: boolean;
    }
  ) {
    const { groupBy, select, where, having, parameters = {}, cache = true } = options;

    const queryExecutor = async () => {
      const queryBuilder = repository.createQueryBuilder('entity');

      // 构建选择字段
      const selectFields = Object.entries(select).map(([alias, expression]) => 
        `${expression} as ${alias}`
      );
      selectFields.push(...groupBy.map(field => `entity.${field}`));
      
      queryBuilder.select(selectFields);

      // 添加分组
      groupBy.forEach(field => {
        queryBuilder.addGroupBy(`entity.${field}`);
      });

      // 添加条件
      if (where) {
        queryBuilder.where(where, parameters);
      }

      if (having) {
        queryBuilder.having(having, parameters);
      }

      return queryBuilder.getRawMany();
    };

    if (cache) {
      const cacheKey = `aggregation:${repository.metadata.name}:${JSON.stringify(options)}`;
      return this.executeWithCache(cacheKey, queryExecutor);
    }

    return queryExecutor();
  }

  /**
   * 监控慢查询
   */
  async monitorQuery<T>(
    queryName: string,
    queryExecutor: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryExecutor();
      const executionTime = Date.now() - startTime;
      
      this.updateQueryMetrics(queryName, executionTime);
      
      if (executionTime > this.slowQueryThreshold) {
        this.logger.warn(`Slow query detected: ${queryName} took ${executionTime}ms`);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Query failed: ${queryName} after ${executionTime}ms`, error);
      throw error;
    }
  }

  /**
   * 获取查询性能指标
   */
  getQueryMetrics() {
    const metrics = Array.from(this.queryMetrics.entries()).map(([name, stats]) => ({
      queryName: name,
      ...stats,
      averageTime: Math.round(stats.totalTime / stats.count),
    }));

    return {
      queries: metrics,
      summary: {
        totalQueries: metrics.reduce((sum, m) => sum + m.count, 0),
        totalSlowQueries: metrics.reduce((sum, m) => sum + m.slowQueries, 0),
        averageResponseTime: Math.round(
          metrics.reduce((sum, m) => sum + m.averageTime, 0) / metrics.length
        ),
      },
    };
  }

  /**
   * 清理查询指标
   */
  clearMetrics() {
    this.queryMetrics.clear();
    this.logger.log('Query metrics cleared');
  }

  // 私有方法

  private updateQueryMetrics(queryName: string, executionTime: number) {
    const current = this.queryMetrics.get(queryName) || {
      count: 0,
      totalTime: 0,
      averageTime: 0,
      slowQueries: 0,
    };

    current.count += 1;
    current.totalTime += executionTime;
    current.averageTime = current.totalTime / current.count;
    
    if (executionTime > this.slowQueryThreshold) {
      current.slowQueries += 1;
    }

    this.queryMetrics.set(queryName, current);
  }
}

/**
 * 查询优化装饰器
 */
export function OptimizeQuery(options: {
  cache?: boolean;
  relations?: string[];
  monitor?: boolean;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const queryName = `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const dbOptimizer = this.dbOptimizer as DatabaseOptimizer;
      
      if (!dbOptimizer) {
        return method.apply(this, args);
      }

      const execute = () => method.apply(this, args);

      if (options.monitor) {
        return dbOptimizer.monitorQuery(queryName, execute);
      }

      return execute();
    };

    return descriptor;
  };
}

/**
 * 查询结果缓存装饰器
 */
export function QueryCache(options: {
  ttl?: number;
  keyGenerator?: (...args: any[]) => string;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const dbOptimizer = this.dbOptimizer as DatabaseOptimizer;
      
      if (!dbOptimizer) {
        return method.apply(this, args);
      }

      const cacheKey = options.keyGenerator 
        ? options.keyGenerator(...args)
        : `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;

      return dbOptimizer.executeWithCache(
        cacheKey,
        () => method.apply(this, args),
        { ttl: options.ttl }
      );
    };

    return descriptor;
  };
}