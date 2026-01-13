/**
 * Payment Adapter Registry
 *
 * Manages registration and discovery of payment adapters.
 * Core adapters and plugin adapters are registered here.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentAdapter,
  PaymentAdapterMetadata,
} from './payment-adapter.interface';

@Injectable()
export class PaymentAdapterRegistry {
  private readonly logger = new Logger(PaymentAdapterRegistry.name);
  private readonly adapters = new Map<string, PaymentAdapter>();
  private readonly metadata = new Map<string, PaymentAdapterMetadata>();

  /**
   * Register a payment adapter
   *
   * @param adapter - The payment adapter instance
   * @param meta - Optional metadata (pluginId, etc.)
   */
  register(
    adapter: PaymentAdapter,
    meta?: Partial<PaymentAdapterMetadata>
  ): void {
    const gateway = adapter.gateway;

    if (this.adapters.has(gateway)) {
      this.logger.warn(
        `Payment adapter "${gateway}" is already registered. Overwriting.`
      );
    }

    this.adapters.set(gateway, adapter);
    this.metadata.set(gateway, {
      gateway,
      displayName: adapter.displayName,
      supportsSubscription: adapter.supportsSubscription,
      pluginId: meta?.pluginId,
      isCore: meta?.isCore ?? false,
    });

    this.logger.log(
      `Registered payment adapter: ${gateway} (${adapter.displayName})`
    );
  }

  /**
   * Unregister a payment adapter
   *
   * @param gateway - Gateway identifier to unregister
   */
  unregister(gateway: string): void {
    if (this.adapters.delete(gateway)) {
      this.metadata.delete(gateway);
      this.logger.log(`Unregistered payment adapter: ${gateway}`);
    }
  }

  /**
   * Get a payment adapter by gateway identifier
   *
   * @param gateway - Gateway identifier
   * @returns The payment adapter or undefined
   */
  get(gateway: string): PaymentAdapter | undefined {
    return this.adapters.get(gateway);
  }

  /**
   * Get a payment adapter, throwing if not found
   *
   * @param gateway - Gateway identifier
   * @returns The payment adapter
   * @throws Error if adapter not found
   */
  getOrThrow(gateway: string): PaymentAdapter {
    const adapter = this.adapters.get(gateway);
    if (!adapter) {
      throw new Error(`Payment adapter "${gateway}" not found`);
    }
    return adapter;
  }

  /**
   * Check if a gateway is registered
   *
   * @param gateway - Gateway identifier
   */
  has(gateway: string): boolean {
    return this.adapters.has(gateway);
  }

  /**
   * Get all registered adapters
   */
  getAll(): PaymentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get metadata for all registered adapters
   */
  getAllMetadata(): PaymentAdapterMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get the default (first registered) adapter
   */
  getDefault(): PaymentAdapter | undefined {
    const first = this.adapters.values().next();
    return first.done ? undefined : first.value;
  }

  /**
   * Get adapters that support subscriptions
   */
  getSubscriptionAdapters(): PaymentAdapter[] {
    return this.getAll().filter((a) => a.supportsSubscription);
  }
}
