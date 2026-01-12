import { Injectable } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  notificationTemplates,
  type NotificationTemplate,
  type InsertNotificationTemplate,
  type I18nText,
  type NotificationPriority,
  type TemplateCategory,
} from '../db/schema/definitions.js';

/**
 * Default locale for fallback
 */
const DEFAULT_LOCALE = 'en-US';

/**
 * HTML escape for XSS prevention
 */
function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

/**
 * Interpolate variables into template string
 */
function interpolate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return `{${key}}`;
    }
    // Escape HTML to prevent XSS
    return escapeHtml(String(value));
  });
}

/**
 * Template Service
 *
 * Manages notification templates with i18n and variable interpolation.
 */
@Injectable()
export class TemplateService {
  /**
   * Register a new template
   */
  async registerTemplate(
    template: Omit<InsertNotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationTemplate> {
    const [result] = await db
      .insert(notificationTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: notificationTemplates.key,
        set: {
          name: template.name,
          description: template.description,
          title: template.title,
          message: template.message,
          variables: template.variables,
          defaultChannels: template.defaultChannels,
          priority: template.priority,
          version: template.version,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!result) {
      throw new Error('Failed to register template');
    }

    return result;
  }

  /**
   * Get template by key
   */
  async getTemplate(key: string): Promise<NotificationTemplate | null> {
    const [result] = await db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.key, key),
          eq(notificationTemplates.deprecated, false)
        )
      )
      .limit(1);

    return result || null;
  }

  /**
   * Get template by key (including deprecated)
   */
  async getTemplateIncludingDeprecated(
    key: string
  ): Promise<NotificationTemplate | null> {
    const [result] = await db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.key, key))
      .limit(1);

    return result || null;
  }

  /**
   * Render template with variables and i18n
   */
  async renderTemplate(
    key: string,
    variables: Record<string, unknown>,
    locale: string = DEFAULT_LOCALE
  ): Promise<{ title: string; message: string } | null> {
    const template = await this.getTemplate(key);
    if (!template) {
      return null;
    }

    const titleI18n = template.title as I18nText;
    const messageI18n = template.message as I18nText;

    // Get localized text with fallback
    const titleTemplate =
      titleI18n[locale] || titleI18n[DEFAULT_LOCALE] || Object.values(titleI18n)[0] || '';
    const messageTemplate =
      messageI18n[locale] ||
      messageI18n[DEFAULT_LOCALE] ||
      Object.values(messageI18n)[0] || '';

    return {
      title: interpolate(titleTemplate, variables),
      message: interpolate(messageTemplate, variables),
    };
  }

  /**
   * List available templates
   */
  async listTemplates(options?: {
    category?: TemplateCategory;
    pluginId?: string;
    includeDeprecated?: boolean;
  }): Promise<NotificationTemplate[]> {
    let query = db.select().from(notificationTemplates);

    const conditions = [];

    if (options?.category) {
      conditions.push(eq(notificationTemplates.category, options.category));
    }

    if (options?.pluginId) {
      conditions.push(eq(notificationTemplates.pluginId, options.pluginId));
    } else if (options?.pluginId === null) {
      conditions.push(isNull(notificationTemplates.pluginId));
    }

    if (!options?.includeDeprecated) {
      conditions.push(eq(notificationTemplates.deprecated, false));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query;
  }

  /**
   * Deprecate a template (cannot delete)
   */
  async deprecateTemplate(key: string): Promise<void> {
    await db
      .update(notificationTemplates)
      .set({ deprecated: true, updatedAt: new Date() })
      .where(eq(notificationTemplates.key, key));
  }

  /**
   * Get default channels for a template
   */
  async getDefaultChannels(key: string): Promise<string[]> {
    const template = await this.getTemplate(key);
    return (template?.defaultChannels as string[]) || ['in-app'];
  }

  /**
   * Get template priority
   */
  async getTemplatePriority(key: string): Promise<NotificationPriority> {
    const template = await this.getTemplate(key);
    return (template?.priority as NotificationPriority) || 'normal';
  }
}
