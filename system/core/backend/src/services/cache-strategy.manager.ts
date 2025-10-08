import { Injectable, Logger } from '@nestjs/common';
import { Service } from 'typedi';
import { CacheManager, CacheOptions } from './cache.manager';

/**
 * 缓存策略配置
 */
export interface CacheStrategyConfig {
  name: string;
  ttl: number;
  namespace: string;
  invalidateOn?: string[]; // 触发失效的事件
  warmUp?: boolean; // 是否预热
  compress?: boolean;
}

/**
 * 预定义的缓存策略
 */
export const CACHE_STRATEGIES = {
  // 静态内容 - 长期缓存
  STATIC_CONTENT: {
    name: 'static_content',
    ttl: 86400, // 24小时
    namespace: 'static',
    compress: true,
  } as CacheStrategyConfig,

  // 用户会话 - 中期缓存
  USER_SESSION: {
    name: 'user_session',
    ttl: 1800, // 30分钟
    namespace: 'session',
    invalidateOn: ['user.logout', 'user.update'],
  } as CacheStrategyConfig,

  // API响应 - 短期缓存
  API_RESPONSE: {
    name: 'api_response',
    ttl: 300, // 5分钟
    namespace: 'api',
    invalidateOn: ['*.create', '*.update', '*.delete'],
  } as CacheStrategyConfig,

  // 数据库查询 - 自适应缓存
  DB_QUERY: {
    name: 'db_query',
    ttl: 600, // 10分钟
    namespace: 'db',
    invalidateOn: ['*.create', '*.update', '*.delete'],
  } as CacheStrategyConfig,

  // 产品数据 - 中期缓存
  PRODUCT_DATA: {
    name: 'product_data',
    ttl: 1800, // 30分钟
    namespace: 'product',
    invalidateOn: ['product.create', 'product.update', 'product.delete'],
    warmUp: true,
  } as CacheStrategyConfig,

  // 分类数据 - 长期缓存
  CATEGORY_DATA: {
    name: 'category_data',
    ttl: 3600, // 1小时
    namespace: 'category',
    invalidateOn: ['category.create', 'category.update', 'category.delete'],
    warmUp: true,
  } as CacheStrategyConfig,

  // 用户数据 - 中期缓存
  USER_DATA: {
    name: 'user_data',
    ttl: 1800, // 30分钟
    namespace: 'user',
    invalidateOn: ['user.update', 'user.delete'],
  } as CacheStrategyConfig,

  // 订单数据 - 短期缓存
  ORDER_DATA: {
    name: 'order_data',
    ttl: 600, // 10分钟
    namespace: 'order',
    invalidateOn: ['order.create', 'order.update', 'order.delete'],
  } as CacheStrategyConfig,

  // 内容数据 - 中期缓存
  CONTENT_DATA: {
    name: 'content_data',
    ttl: 1800, // 30分钟
    namespace: 'content',
    invalidateOn: ['post.create', 'post.update', 'post.delete'],
  } as CacheStrategyConfig,

  // 主题配置 - 长期缓存
  THEME_CONFIG: {
    name: 'theme_config',
    ttl: 7200, // 2小时
    namespace: 'theme',
    invalidateOn: ['theme.update', 'theme.change'],
  } as CacheStrategyConfig,

  // 插件数据 - 长期缓存
  PLUGIN_DATA: {
    name: 'plugin_data',
    ttl: 3600, // 1小时
    namespace: 'plugin',
    invalidateOn: ['plugin.activate', 'plugin.deactivate', 'plugin.update'],
  } as CacheStrategyConfig,
};

/**
 * 应用级缓存策略管理器
 */
@Service()
@Injectable()
export class CacheStrategyManager {
  private readonly logger = new Logger(CacheStrategyManager.name);
  private eventListeners = new Map<string, Set<CacheStrategyConfig>>();

  constructor(private cacheManager: CacheManager) {
    this.initializeEventListeners();
  }

  /**
   * 根据策略获取缓存
   */
  async get<T>(key: string, strategy: CacheStrategyConfig): Promise<T | null> {
    const options: CacheOptions = {
      namespace: strategy.namespace,
      ttl: strategy.ttl,
      compress: strategy.compress,
    };

    return this.cacheManager.get<T>(key, options);
  }

  /**
   * 根据策略设置缓存
   */
  async set<T>(key: string, value: T, strategy: CacheStrategyConfig): Promise<void> {
    const options: CacheOptions = {
      namespace: strategy.namespace,
      ttl: strategy.ttl,
      compress: strategy.compress,
    };

    return this.cacheManager.set(key, value, options);
  }

  /**
   * 获取或设置缓存（根据策略）
   */
  async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    strategy: CacheStrategyConfig
  ): Promise<T> {
    const options: CacheOptions = {
      namespace: strategy.namespace,
      ttl: strategy.ttl,
      compress: strategy.compress,
    };

    return this.cacheManager.getOrSet(key, callback, options);
  }

  /**
   * 使策略相关的缓存失效
   */
  async invalidateStrategy(strategy: CacheStrategyConfig): Promise<void> {
    const pattern = `${strategy.namespace}:*`;
    await this.cacheManager.delPattern(pattern);
    this.logger.log(`Invalidated cache strategy: ${strategy.name}`);
  }

  /**
   * 处理事件，使相关缓存失效
   */
  async handleEvent(eventName: string): Promise<void> {
    const affectedStrategies = this.eventListeners.get(eventName) || new Set();
    
    // 通配符事件匹配
    for (const [pattern, strategies] of this.eventListeners.entries()) {
      if (this.matchPattern(eventName, pattern)) {
        strategies.forEach(strategy => affectedStrategies.add(strategy));
      }
    }

    if (affectedStrategies.size > 0) {
      this.logger.log(`Event ${eventName} triggered cache invalidation for ${affectedStrategies.size} strategies`);
      
      const invalidations = Array.from(affectedStrategies).map(strategy => 
        this.invalidateStrategy(strategy)
      );
      
      await Promise.all(invalidations);
    }
  }

  /**
   * 预热指定策略的缓存
   */
  async warmUpStrategy(strategy: CacheStrategyConfig, warmUpData: { [key: string]: any }): Promise<void> {
    if (!strategy.warmUp) return;

    this.logger.log(`Warming up cache strategy: ${strategy.name}`);
    
    const warmUpPromises = Object.entries(warmUpData).map(([key, value]) =>
      this.set(key, value, strategy)
    );

    await Promise.all(warmUpPromises);
    this.logger.log(`Cache strategy ${strategy.name} warmed up with ${Object.keys(warmUpData).length} items`);
  }

  /**
   * 预热所有需要预热的策略
   */
  async warmUpAll(): Promise<void> {
    const strategies = Object.values(CACHE_STRATEGIES).filter(s => s.warmUp);
    
    for (const strategy of strategies) {
      try {
        const warmUpData = await this.getWarmUpData(strategy);
        await this.warmUpStrategy(strategy, warmUpData);
      } catch (error) {
        this.logger.error(`Failed to warm up strategy ${strategy.name}:`, error);
      }
    }
  }

  // 私有方法

  private initializeEventListeners(): void {
    // 注册事件监听器
    Object.values(CACHE_STRATEGIES).forEach(strategy => {
      if (strategy.invalidateOn) {
        strategy.invalidateOn.forEach(event => {
          if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
          }
          this.eventListeners.get(event)!.add(strategy);
        });
      }
    });
  }

  private matchPattern(eventName: string, pattern: string): boolean {
    // 简单的通配符匹配
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(eventName);
  }

  private async getWarmUpData(strategy: CacheStrategyConfig): Promise<{ [key: string]: any }> {
    // 根据策略获取预热数据
    switch (strategy.name) {
      case 'product_data':
        return this.getProductWarmUpData();
      case 'category_data':
        return this.getCategoryWarmUpData();
      default:
        return {};
    }
  }

  private async getProductWarmUpData(): Promise<{ [key: string]: any }> {
    // TODO: 实现产品预热数据获取
    // 例如：热门产品、推荐产品等
    return {
      'featured_products': [], // 从数据库获取
      'bestsellers': [], // 从数据库获取
      'new_arrivals': [], // 从数据库获取
    };
  }

  private async getCategoryWarmUpData(): Promise<{ [key: string]: any }> {
    // TODO: 实现分类预热数据获取
    return {
      'category_tree': [], // 从数据库获取
      'root_categories': [], // 从数据库获取
    };
  }
}

/**
 * 缓存装饰器
 */
export function Cacheable(strategy: CacheStrategyConfig, keyGenerator?: (...args: any[]) => string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheStrategyManager = this.cacheStrategyManager as CacheStrategyManager;
      
      if (!cacheStrategyManager) {
        // 如果没有缓存管理器，直接调用原方法
        return method.apply(this, args);
      }

      // 生成缓存键
      const cacheKey = keyGenerator 
        ? keyGenerator(...args)
        : `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;

      // 尝试从缓存获取
      const cached = await cacheStrategyManager.get(cacheKey, strategy);
      if (cached !== null) {
        return cached;
      }

      // 调用原方法
      const result = await method.apply(this, args);

      // 设置缓存
      await cacheStrategyManager.set(cacheKey, result, strategy);

      return result;
    };

    return descriptor;
  };
}

/**
 * 缓存失效装饰器
 */
export function CacheInvalidate(eventName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const cacheStrategyManager = this.cacheStrategyManager as CacheStrategyManager;
      if (cacheStrategyManager) {
        await cacheStrategyManager.handleEvent(eventName);
      }

      return result;
    };

    return descriptor;
  };
}