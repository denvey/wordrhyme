import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  notificationChannels,
  type NotificationChannel,
  type InsertNotificationChannel,
  type I18nText,
} from '../db/schema/definitions.js';

/**
 * Channel Service
 *
 * Manages notification channels (plugin-registered).
 */
@Injectable()
export class ChannelService {
  /**
   * Register a new channel (plugin registration)
   */
  async registerChannel(
    channel: Omit<InsertNotificationChannel, 'id' | 'createdAt'>
  ): Promise<NotificationChannel> {
    const [result] = await db
      .insert(notificationChannels)
      .values(channel)
      .onConflictDoUpdate({
        target: notificationChannels.key,
        set: {
          name: channel.name,
          description: channel.description,
          icon: channel.icon,
          enabled: channel.enabled,
          configSchema: channel.configSchema,
        },
      })
      .returning();

    if (!result) {
      throw new Error('Failed to register channel');
    }

    return result;
  }

  /**
   * Get channel by key
   */
  async getChannel(key: string): Promise<NotificationChannel | null> {
    const [result] = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.key, key))
      .limit(1);

    return result || null;
  }

  /**
   * Get enabled channels
   */
  async getEnabledChannels(): Promise<NotificationChannel[]> {
    return db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.enabled, true));
  }

  /**
   * Get channels by plugin
   */
  async getChannelsByPlugin(pluginId: string): Promise<NotificationChannel[]> {
    return db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.pluginId, pluginId));
  }

  /**
   * Enable/disable channel
   */
  async setChannelEnabled(key: string, enabled: boolean): Promise<void> {
    await db
      .update(notificationChannels)
      .set({ enabled })
      .where(eq(notificationChannels.key, key));
  }

  /**
   * Unregister plugin channels (on plugin uninstall)
   */
  async unregisterPluginChannels(pluginId: string): Promise<void> {
    await db
      .delete(notificationChannels)
      .where(eq(notificationChannels.pluginId, pluginId));
  }

  /**
   * List all channels
   */
  async listChannels(options?: {
    pluginId?: string;
    enabledOnly?: boolean;
  }): Promise<NotificationChannel[]> {
    const conditions = [];

    if (options?.pluginId) {
      conditions.push(eq(notificationChannels.pluginId, options.pluginId));
    }

    if (options?.enabledOnly) {
      conditions.push(eq(notificationChannels.enabled, true));
    }

    if (conditions.length > 0) {
      return db
        .select()
        .from(notificationChannels)
        .where(and(...conditions));
    }

    return db.select().from(notificationChannels);
  }

  /**
   * Get channel display name (i18n)
   */
  getChannelDisplayName(
    channel: NotificationChannel,
    locale: string = 'en-US'
  ): string {
    const nameI18n = channel.name as I18nText;
    return nameI18n[locale] || nameI18n['en-US'] || Object.values(nameI18n)[0] || channel.key;
  }
}
