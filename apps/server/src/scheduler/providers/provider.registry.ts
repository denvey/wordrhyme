import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { scheduledTasks, schedulerProviders } from '@wordrhyme/db';
import { settings } from '@wordrhyme/db';
import { SchedulerProvider } from './provider.interface.js';
import { BuiltinSchedulerProvider } from './builtin.provider.js';

/**
 * Scheduler Provider Registry
 *
 * 管理所有 Scheduler Provider（内置 + 第三方插件）
 */
@Injectable()
export class SchedulerProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(SchedulerProviderRegistry.name);
  private readonly providers = new Map<string, SchedulerProvider>();

  constructor(
    private readonly builtinProvider: BuiltinSchedulerProvider,
  ) {}

  async onModuleInit() {
    // 注册内置 Provider
    await this.registerProvider(this.builtinProvider);
    this.logger.log('Built-in Scheduler Provider registered');
  }

  /**
   * 注册 Provider（由插件调用）
   */
  async registerProvider(provider: SchedulerProvider): Promise<void> {
    // 验证 Provider 实现
    this.validateProvider(provider);

    // 注册到内存
    this.providers.set(provider.id, provider);

    // 持久化到数据库（仅第三方插件）
    if (provider.id !== 'builtin') {
      await db
        .insert(schedulerProviders)
        .values({
          id: provider.id,
          name: provider.name,
          version: provider.version,
          capabilities: provider.capabilities,
          status: 'registered',
        })
        .onConflictDoUpdate({
          target: schedulerProviders.id,
          set: {
            version: provider.version,
            capabilities: provider.capabilities,
            status: 'registered',
          },
        });
    }

    this.logger.log(`Scheduler Provider registered: ${provider.name} (${provider.id})`);
  }

  /**
   * 注销 Provider（插件卸载时调用）
   */
  async unregisterProvider(providerId: string): Promise<void> {
    // 不能注销内置 Provider
    if (providerId === 'builtin') {
      throw new Error('Cannot unregister built-in provider');
    }

    // 检查是否有任务在使用此 Provider
    const taskCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.providerId, providerId));

    const count = taskCount[0]?.count ?? 0;
    if (count > 0) {
      throw new Error(
        `Cannot unregister provider ${providerId}: ${count} tasks still using it`
      );
    }

    const provider = this.providers.get(providerId);
    if (provider) {
      await provider.shutdown();
      this.providers.delete(providerId);
    }

    await db
      .update(schedulerProviders)
      .set({ status: 'unregistered' })
      .where(eq(schedulerProviders.id, providerId));

    this.logger.log(`Scheduler Provider unregistered: ${providerId}`);
  }

  /**
   * 获取 Provider 实例
   */
  getProvider(providerId?: string): SchedulerProvider {
    const id = providerId || 'builtin';
    const provider = this.providers.get(id);

    if (!provider) {
      throw new Error(`Scheduler Provider not found: ${id}`);
    }

    return provider;
  }

  /**
   * 列出所有已注册的 Provider
   */
  listProviders(): SchedulerProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取租户的活动 Provider
   */
  async getActiveProvider(organizationId: string): Promise<SchedulerProvider> {
    // 查询租户配置
    const [setting] = await db
      .select()
      .from(settings)
      .where(
        sql`${settings.scope} = 'tenant' and ${settings.organizationId} = ${organizationId} and ${settings.key} = 'scheduler.provider'`
      )
      .limit(1);

    let providerId: string;

    if (setting?.value && typeof setting.value === 'object' && 'providerId' in setting.value) {
      providerId = (setting.value as any).providerId;
    } else {
      // 使用默认 Provider（builtin）
      providerId = 'builtin';
    }

    return this.getProvider(providerId);
  }

  /**
   * 设置租户的活动 Provider
   */
  async setActiveProvider(organizationId: string, providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    // 存储到租户配置
    await db
      .insert(settings)
      .values({
        scope: 'tenant',
        organizationId,
        key: 'scheduler.provider',
        value: { providerId },
      })
      .onConflictDoUpdate({
        target: [settings.organizationId, settings.key],
        set: { value: { providerId } },
      });

    this.logger.log(`Tenant ${organizationId} switched to provider: ${providerId}`);
  }

  /**
   * 验证 Provider 实现
   */
  private validateProvider(provider: SchedulerProvider): void {
    if (!provider.id || !provider.name) {
      throw new Error('Provider must have id and name');
    }

    const requiredMethods = [
      'initialize',
      'createTask',
      'deleteTask',
      'updateTask',
      'healthCheck',
      'shutdown',
    ];

    for (const method of requiredMethods) {
      if (typeof ((provider as unknown as Record<string, unknown>)[method]) !== 'function') {
        throw new Error(`Provider ${provider.id} missing method: ${method}`);
      }
    }
  }
}
