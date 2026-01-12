import { Injectable, Logger } from '@nestjs/common';
import { SchedulerProviderRegistry } from './providers/provider.registry';
import { SchedulerProvider } from './providers/provider.interface';

/**
 * Plugin Scheduler Adapter
 *
 * 为插件提供注册第三方 Scheduler Provider 的能力
 */
@Injectable()
export class PluginSchedulerAdapter {
  private readonly logger = new Logger(PluginSchedulerAdapter.name);

  constructor(
    private readonly providerRegistry: SchedulerProviderRegistry,
  ) {}

  /**
   * 插件注册 Provider 的入口
   */
  async registerProvider(
    pluginId: string,
    provider: SchedulerProvider
  ): Promise<void> {
    // 验证插件权限（这里简化处理，实际应该检查 plugin manifest）
    if (!pluginId) {
      throw new Error('Plugin ID is required');
    }

    // 确保 Provider ID 与插件 ID 一致
    if (provider.id !== pluginId) {
      throw new Error(
        `Provider ID (${provider.id}) must match plugin ID (${pluginId})`
      );
    }

    // 注册到 Registry
    await this.providerRegistry.registerProvider(provider);

    this.logger.log(`Plugin ${pluginId} registered scheduler provider`);
  }

  /**
   * 插件注销 Provider
   */
  async unregisterProvider(pluginId: string): Promise<void> {
    await this.providerRegistry.unregisterProvider(pluginId);

    this.logger.log(`Plugin ${pluginId} unregistered scheduler provider`);
  }

  /**
   * 列出所有可用的 Provider
   */
  listProviders() {
    return this.providerRegistry.listProviders().map(provider => ({
      id: provider.id,
      name: provider.name,
      version: provider.version,
      capabilities: provider.capabilities,
    }));
  }
}
