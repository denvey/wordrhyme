import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Service } from 'typedi';
import * as os from 'os';
import { performance } from 'perf_hooks';

export interface PerformanceMetrics {
  timestamp: number;
  memory: {
    used: number;
    free: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu: {
    usage: number;
    load: number[];
  };
  requests: {
    total: number;
    rps: number; // requests per second
    averageResponseTime: number;
    slowRequests: number;
  };
  database: {
    connections: number;
    slowQueries: number;
    averageQueryTime: number;
  };
  cache: {
    hitRate: number;
    memoryUsage: number;
    redisConnected: boolean;
  };
}

export interface RequestMetrics {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
}

/**
 * 系统性能监控服务
 */
@Service()
@Injectable()
export class PerformanceMonitor {
  private readonly logger = new Logger(PerformanceMonitor.name);
  private metricsHistory: PerformanceMetrics[] = [];
  private requestMetrics: RequestMetrics[] = [];
  private requestCount = 0;
  private slowRequestThreshold: number;
  private maxHistorySize: number;
  private monitoringInterval?: NodeJS.Timeout;
  
  private lastCpuUsage = process.cpuUsage();
  private lastTime = performance.now();

  constructor(private configService: ConfigService) {
    this.slowRequestThreshold = this.configService.get('PERFORMANCE_SLOW_REQUEST_THRESHOLD', 1000);
    this.maxHistorySize = this.configService.get('PERFORMANCE_HISTORY_SIZE', 1000);
    this.startMonitoring();
  }

  /**
   * 记录请求指标
   */
  recordRequest(metrics: RequestMetrics): void {
    this.requestMetrics.push({
      ...metrics,
      timestamp: Date.now(),
    });

    this.requestCount++;

    // 限制内存中的请求历史大小
    if (this.requestMetrics.length > this.maxHistorySize) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxHistorySize);
    }

    // 记录慢请求
    if (metrics.responseTime > this.slowRequestThreshold) {
      this.logger.warn(
        `Slow request detected: ${metrics.method} ${metrics.url} took ${metrics.responseTime}ms`
      );
    }
  }

  /**
   * 获取当前性能指标
   */
  async getCurrentMetrics(): Promise<PerformanceMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = this.calculateCpuUsage();
    const recentRequests = this.getRecentRequests(60000); // 最近1分钟
    
    return {
      timestamp: Date.now(),
      memory: {
        used: memoryUsage.heapUsed,
        free: os.freemem(),
        total: os.totalmem(),
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
      cpu: {
        usage: cpuUsage,
        load: os.loadavg(),
      },
      requests: {
        total: this.requestCount,
        rps: recentRequests.length / 60, // 每秒请求数
        averageResponseTime: this.calculateAverageResponseTime(recentRequests),
        slowRequests: recentRequests.filter(r => r.responseTime > this.slowRequestThreshold).length,
      },
      database: {
        connections: 0, // TODO: 从数据库连接池获取
        slowQueries: 0, // TODO: 从DatabaseOptimizer获取
        averageQueryTime: 0, // TODO: 从DatabaseOptimizer获取
      },
      cache: {
        hitRate: 0, // TODO: 从CacheManager获取
        memoryUsage: 0, // TODO: 从CacheManager获取
        redisConnected: false, // TODO: 从CacheManager获取
      },
    };
  }

  /**
   * 获取性能历史数据
   */
  getHistoricalMetrics(timeRange: {
    from: number;
    to: number;
  }): PerformanceMetrics[] {
    return this.metricsHistory.filter(
      m => m.timestamp >= timeRange.from && m.timestamp <= timeRange.to
    );
  }

  /**
   * 获取请求统计
   */
  getRequestStatistics(timeRange?: {
    from: number;
    to: number;
  }) {
    const requests = timeRange
      ? this.requestMetrics.filter(
          r => r.timestamp >= timeRange.from && r.timestamp <= timeRange.to
        )
      : this.requestMetrics;

    const statusCodes = new Map<number, number>();
    const endpoints = new Map<string, {
      count: number;
      totalTime: number;
      averageTime: number;
      slowRequests: number;
    }>();

    requests.forEach(request => {
      // 统计状态码
      statusCodes.set(
        request.statusCode,
        (statusCodes.get(request.statusCode) || 0) + 1
      );

      // 统计端点性能
      const endpoint = `${request.method} ${request.url}`;
      const current = endpoints.get(endpoint) || {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        slowRequests: 0,
      };

      current.count += 1;
      current.totalTime += request.responseTime;
      current.averageTime = current.totalTime / current.count;
      
      if (request.responseTime > this.slowRequestThreshold) {
        current.slowRequests += 1;
      }

      endpoints.set(endpoint, current);
    });

    return {
      totalRequests: requests.length,
      statusCodes: Array.from(statusCodes.entries()).map(([code, count]) => ({
        statusCode: code,
        count,
        percentage: (count / requests.length) * 100,
      })),
      endpoints: Array.from(endpoints.entries())
        .map(([endpoint, stats]) => ({
          endpoint,
          ...stats,
        }))
        .sort((a, b) => b.averageTime - a.averageTime),
      averageResponseTime: this.calculateAverageResponseTime(requests),
      slowRequests: requests.filter(r => r.responseTime > this.slowRequestThreshold).length,
    };
  }

  /**
   * 获取系统健康状态
   */
  async getHealthStatus() {
    const metrics = await this.getCurrentMetrics();
    const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
    const cpuUsagePercent = metrics.cpu.usage;

    return {
      status: this.determineHealthStatus(metrics),
      timestamp: Date.now(),
      checks: {
        memory: {
          status: memoryUsagePercent < 80 ? 'healthy' : memoryUsagePercent < 90 ? 'warning' : 'critical',
          usage: memoryUsagePercent,
          used: metrics.memory.used,
          total: metrics.memory.total,
        },
        cpu: {
          status: cpuUsagePercent < 70 ? 'healthy' : cpuUsagePercent < 85 ? 'warning' : 'critical',
          usage: cpuUsagePercent,
          load: metrics.cpu.load,
        },
        requests: {
          status: metrics.requests.averageResponseTime < 500 ? 'healthy' : 
                  metrics.requests.averageResponseTime < 1000 ? 'warning' : 'critical',
          rps: metrics.requests.rps,
          averageResponseTime: metrics.requests.averageResponseTime,
          slowRequests: metrics.requests.slowRequests,
        },
        database: {
          status: 'healthy', // TODO: 实现数据库健康检查
          connections: metrics.database.connections,
          averageQueryTime: metrics.database.averageQueryTime,
        },
        cache: {
          status: metrics.cache.redisConnected ? 'healthy' : 'warning',
          hitRate: metrics.cache.hitRate,
          connected: metrics.cache.redisConnected,
        },
      },
    };
  }

  /**
   * 获取性能报告
   */
  async generatePerformanceReport(timeRange: {
    from: number;
    to: number;
  }) {
    const metrics = this.getHistoricalMetrics(timeRange);
    const requestStats = this.getRequestStatistics(timeRange);

    if (metrics.length === 0) {
      return {
        timeRange,
        summary: 'No data available for the specified time range',
      };
    }

    return {
      timeRange,
      summary: {
        totalRequests: requestStats.totalRequests,
        averageResponseTime: requestStats.averageResponseTime,
        slowRequests: requestStats.slowRequests,
        averageMemoryUsage: Math.round(
          metrics.reduce((sum, m) => sum + m.memory.used, 0) / metrics.length
        ),
        averageCpuUsage: Math.round(
          metrics.reduce((sum, m) => sum + m.cpu.usage, 0) / metrics.length
        ),
        peakMemoryUsage: Math.max(...metrics.map(m => m.memory.used)),
        peakCpuUsage: Math.max(...metrics.map(m => m.cpu.usage)),
      },
      trends: {
        memory: this.calculateTrend(metrics.map(m => m.memory.used)),
        cpu: this.calculateTrend(metrics.map(m => m.cpu.usage)),
        responseTime: this.calculateTrend(
          metrics.map(m => m.requests.averageResponseTime)
        ),
      },
      topEndpoints: requestStats.endpoints.slice(0, 10),
      statusCodeDistribution: requestStats.statusCodes,
      recommendations: this.generateRecommendations(metrics, requestStats),
    };
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.log('Performance monitoring stopped');
    }
  }

  // 私有方法

  private startMonitoring(): void {
    this.logger.log('Starting performance monitoring');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.getCurrentMetrics();
        this.metricsHistory.push(metrics);

        // 限制历史数据大小
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
        }

        // 检查是否需要告警
        this.checkAlerts(metrics);
      } catch (error) {
        this.logger.error('Error collecting performance metrics:', error);
      }
    }, 10000); // 每10秒收集一次指标
  }

  private calculateCpuUsage(): number {
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = performance.now();
    const timeDiff = currentTime - this.lastTime;

    const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / (timeDiff * 1000)) * 100;

    this.lastCpuUsage = process.cpuUsage();
    this.lastTime = currentTime;

    return Math.min(Math.max(cpuPercent, 0), 100);
  }

  private getRecentRequests(timeWindowMs: number): RequestMetrics[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.requestMetrics.filter(r => r.timestamp >= cutoff);
  }

  private calculateAverageResponseTime(requests: RequestMetrics[]): number {
    if (requests.length === 0) return 0;
    const totalTime = requests.reduce((sum, r) => sum + r.responseTime, 0);
    return Math.round(totalTime / requests.length);
  }

  private determineHealthStatus(metrics: PerformanceMetrics): 'healthy' | 'warning' | 'critical' {
    const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
    const cpuUsagePercent = metrics.cpu.usage;
    const avgResponseTime = metrics.requests.averageResponseTime;

    if (memoryUsagePercent > 90 || cpuUsagePercent > 85 || avgResponseTime > 1000) {
      return 'critical';
    }

    if (memoryUsagePercent > 80 || cpuUsagePercent > 70 || avgResponseTime > 500) {
      return 'warning';
    }

    return 'healthy';
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const first = values.slice(0, Math.floor(values.length / 3));
    const last = values.slice(-Math.floor(values.length / 3));

    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const lastAvg = last.reduce((a, b) => a + b, 0) / last.length;

    const change = ((lastAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  private generateRecommendations(
    metrics: PerformanceMetrics[],
    requestStats: any
  ): string[] {
    const recommendations: string[] = [];
    
    if (metrics.length === 0) return recommendations;

    const avgMemory = metrics.reduce((sum, m) => sum + m.memory.used, 0) / metrics.length;
    const avgCpu = metrics.reduce((sum, m) => sum + m.cpu.usage, 0) / metrics.length;
    
    // 内存使用建议
    const memoryPercent = (avgMemory / os.totalmem()) * 100;
    if (memoryPercent > 80) {
      recommendations.push('考虑增加更多内存或优化内存使用');
    }

    // CPU使用建议
    if (avgCpu > 70) {
      recommendations.push('CPU使用率较高，考虑优化算法或增加更多CPU核心');
    }

    // 响应时间建议
    if (requestStats.averageResponseTime > 500) {
      recommendations.push('平均响应时间较长，建议优化数据库查询和启用缓存');
    }

    // 慢请求建议
    if (requestStats.slowRequests > 0) {
      recommendations.push('存在慢请求，建议优化慢查询和实施请求限流');
    }

    return recommendations;
  }

  private checkAlerts(metrics: PerformanceMetrics): void {
    const memoryPercent = (metrics.memory.used / metrics.memory.total) * 100;
    
    if (memoryPercent > 90) {
      this.logger.error(`Critical memory usage: ${memoryPercent.toFixed(1)}%`);
    } else if (memoryPercent > 80) {
      this.logger.warn(`High memory usage: ${memoryPercent.toFixed(1)}%`);
    }

    if (metrics.cpu.usage > 85) {
      this.logger.error(`Critical CPU usage: ${metrics.cpu.usage.toFixed(1)}%`);
    } else if (metrics.cpu.usage > 70) {
      this.logger.warn(`High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`);
    }

    if (metrics.requests.averageResponseTime > 1000) {
      this.logger.error(
        `Critical response time: ${metrics.requests.averageResponseTime}ms`
      );
    } else if (metrics.requests.averageResponseTime > 500) {
      this.logger.warn(
        `High response time: ${metrics.requests.averageResponseTime}ms`
      );
    }
  }
}

/**
 * 性能监控装饰器
 */
export function Monitor(options: { name?: string } = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const operationName = options.name || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const startTime = performance.now();
      
      try {
        const result = await method.apply(this, args);
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 如果有性能监控器实例，记录指标
        const monitor = this.performanceMonitor as PerformanceMonitor;
        if (monitor && duration > 100) { // 只记录超过100ms的操作
          // 这里可以记录方法级别的性能指标
        }

        return result;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // 记录错误和执行时间
        throw error;
      }
    };

    return descriptor;
  };
}