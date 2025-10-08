import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';
import { Service } from 'typedi';

export interface CacheOptions {
  ttl?: number; // 过期时间（秒）
  namespace?: string; // 缓存命名空间
  compress?: boolean; // 是否压缩数据
}

export interface CacheConfig {
  // Redis 配置
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  
  // 内存缓存配置
  memory?: {
    max: number; // 最大条目数
    ttl: number; // 默认TTL（秒）
  };
  
  // 默认选项
  defaultTTL: number;
  enableCompression: boolean;
}

/**
 * 多层缓存管理器
 * L1: 内存缓存 (最快，容量小)
 * L2: Redis缓存 (快，持久化)
 */
@Service()
@Injectable()
export class CacheManager {
  private readonly logger = new Logger(CacheManager.name);
  private memoryCache = new Map<string, { value: any; expiry: number; size: number }>();
  private redisClient?: Redis.Redis;
  private config: CacheConfig;
  private memoryStats = { hits: 0, misses: 0, sets: 0 };
  private redisStats = { hits: 0, misses: 0, sets: 0 };

  constructor(private configService: ConfigService) {
    this.config = this.loadConfig();
    this.initializeRedis();
    this.startCleanupTimer();
  }

  private loadConfig(): CacheConfig {
    return {
      redis: this.configService.get('REDIS_URL') ? {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB', 0),
        keyPrefix: this.configService.get('REDIS_PREFIX', 'cromwell:'),
      } : undefined,
      memory: {
        max: this.configService.get('CACHE_MEMORY_MAX', 1000),
        ttl: this.configService.get('CACHE_MEMORY_TTL', 300),
      },
      defaultTTL: this.configService.get('CACHE_DEFAULT_TTL', 300),
      enableCompression: this.configService.get('CACHE_COMPRESSION', 'true') === 'true',
    };
  }

  private async initializeRedis(): Promise<void> {
    if (!this.config.redis) {
      this.logger.warn('Redis configuration not found. Running with memory cache only.');
      return;
    }

    try {
      this.redisClient = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        keyPrefix: this.config.redis.keyPrefix,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redisClient.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Connected to Redis');
      });

      // 测试连接
      await this.redisClient.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      this.redisClient = undefined;
    }
  }

  /**
   * 获取缓存数据
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const cacheKey = this.buildCacheKey(key, options.namespace);

    try {
      // L1: 检查内存缓存
      const memoryResult = this.getFromMemory<T>(cacheKey);
      if (memoryResult !== null) {
        this.memoryStats.hits++;
        return memoryResult;
      }
      this.memoryStats.misses++;

      // L2: 检查Redis缓存
      if (this.redisClient) {
        const redisResult = await this.getFromRedis<T>(cacheKey);
        if (redisResult !== null) {
          this.redisStats.hits++;
          // 回填L1缓存
          this.setInMemory(cacheKey, redisResult, options.ttl || this.config.defaultTTL);
          return redisResult;
        }
        this.redisStats.misses++;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting cache key ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * 设置缓存数据
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildCacheKey(key, options.namespace);
    const ttl = options.ttl || this.config.defaultTTL;

    try {
      // 设置内存缓存
      this.setInMemory(cacheKey, value, ttl);
      this.memoryStats.sets++;

      // 设置Redis缓存
      if (this.redisClient) {
        await this.setInRedis(cacheKey, value, ttl, options.compress);
        this.redisStats.sets++;
      }
    } catch (error) {
      this.logger.error(`Error setting cache key ${cacheKey}:`, error);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildCacheKey(key, options.namespace);

    try {
      // 删除内存缓存
      this.memoryCache.delete(cacheKey);

      // 删除Redis缓存
      if (this.redisClient) {
        await this.redisClient.del(cacheKey);
      }
    } catch (error) {
      this.logger.error(`Error deleting cache key ${cacheKey}:`, error);
    }
  }

  /**
   * 按模式删除缓存
   */
  async delPattern(pattern: string, options: CacheOptions = {}): Promise<void> {
    try {
      // 删除内存缓存
      const memoryPattern = this.buildCacheKey(pattern, options.namespace);
      const regex = new RegExp(memoryPattern.replace(/\*/g, '.*'));
      
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          this.memoryCache.delete(key);
        }
      }

      // 删除Redis缓存
      if (this.redisClient) {
        const redisPattern = this.buildCacheKey(pattern, options.namespace);
        const keys = await this.redisClient.keys(redisPattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      }
    } catch (error) {
      this.logger.error(`Error deleting cache pattern ${pattern}:`, error);
    }
  }

  /**
   * 获取或设置缓存（如果不存在则调用回调函数）
   */
  async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    const value = await callback();
    await this.set(key, value, options);
    return value;
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      memory: {
        ...this.memoryStats,
        size: this.memoryCache.size,
        hitRate: this.memoryStats.hits / (this.memoryStats.hits + this.memoryStats.misses),
      },
      redis: this.redisClient ? {
        ...this.redisStats,
        connected: this.redisClient.status === 'ready',
        hitRate: this.redisStats.hits / (this.redisStats.hits + this.redisStats.misses),
      } : null,
    };
  }

  /**
   * 清空所有缓存
   */
  async flush(): Promise<void> {
    try {
      // 清空内存缓存
      this.memoryCache.clear();

      // 清空Redis缓存
      if (this.redisClient) {
        await this.redisClient.flushdb();
      }

      this.logger.log('All caches flushed');
    } catch (error) {
      this.logger.error('Error flushing caches:', error);
    }
  }

  // 私有方法

  private buildCacheKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private getFromMemory<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    return cached.value;
  }

  private setInMemory<T>(key: string, value: T, ttl: number): void {
    // 内存大小控制
    if (this.memoryCache.size >= (this.config.memory?.max || 1000)) {
      this.evictMemoryCache();
    }

    const size = this.calculateSize(value);
    this.memoryCache.set(key, {
      value,
      expiry: Date.now() + (ttl * 1000),
      size,
    });
  }

  private async getFromRedis<T>(key: string): Promise<T | null> {
    if (!this.redisClient) return null;

    const value = await this.redisClient.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      this.logger.error(`Error parsing Redis value for key ${key}:`, error);
      return null;
    }
  }

  private async setInRedis<T>(key: string, value: T, ttl: number, compress?: boolean): Promise<void> {
    if (!this.redisClient) return;

    let serialized = JSON.stringify(value);
    
    // TODO: 实现压缩逻辑
    if (compress && this.config.enableCompression) {
      // serialized = await this.compress(serialized);
    }

    await this.redisClient.setex(key, ttl, serialized);
  }

  private calculateSize(value: any): number {
    // 简单的大小估算
    return JSON.stringify(value).length * 2; // 粗略估算字符串字节数
  }

  private evictMemoryCache(): void {
    // 简单的LRU淘汰策略 - 删除最早过期的条目
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].expiry - b[1].expiry);
    
    const evictCount = Math.floor(this.memoryCache.size * 0.1); // 删除10%
    for (let i = 0; i < evictCount; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  private startCleanupTimer(): void {
    // 每分钟清理过期的内存缓存
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.memoryCache.entries()) {
        if (now > cached.expiry) {
          this.memoryCache.delete(key);
        }
      }
    }, 60000);
  }
}