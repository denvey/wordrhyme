import { Injectable, Logger } from '@nestjs/common';
import { eq, and, like, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  settings,
  settingSchemas,
  type Setting,
  type SettingScope,
  type SettingValueType,
  type EncryptedValue,
  type GetSettingOptions,
  type SetSettingOptions,
  type ListSettingsOptions,
} from '../db/schema/definitions.js';
import { EncryptionService, isEncryptedValue } from './encryption.service.js';
import { SettingsCacheService } from './cache.service.js';
import { SchemaRegistryService } from './schema-registry.service.js';
import { AuditService } from '../audit/audit.service.js';
import { requestContextStorage } from '../context/async-local-storage.js';

/**
 * Setting with resolved value (decrypted if necessary)
 */
export interface ResolvedSetting {
  id: string;
  scope: SettingScope;
  key: string;
  value: unknown;
  valueType: SettingValueType | null;
  encrypted: boolean;
  schemaVersion: number;
  description: string | null;
  resolvedFrom: SettingScope; // Which scope the value was resolved from
}

/**
 * Settings Service
 *
 * Core service for managing application settings with:
 * - Four-scope hierarchy (global, tenant, plugin_global, plugin_tenant)
 * - Cascade resolution (tenant → global → default)
 * - Encryption support for sensitive values
 * - Schema validation
 * - Audit logging
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly cacheService: SettingsCacheService,
    private readonly schemaRegistry: SchemaRegistryService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Get a setting value with cascade resolution
   *
   * Resolution order for core settings:
   * 1. Tenant override (if tenantId provided)
   * 2. Global value
   * 3. Schema default (if schema exists)
   * 4. Provided default value
   *
   * Resolution order for plugin settings:
   * 1. Plugin tenant override (if tenantId provided)
   * 2. Plugin global value
   * 3. null (plugins don't fall back to core settings)
   */
  async get(
    scope: SettingScope,
    key: string,
    options: GetSettingOptions = {}
  ): Promise<unknown> {
    const { tenantId, scopeId, defaultValue } = options;

    // Plugin scopes have their own cascade
    if (scope === 'plugin_global' || scope === 'plugin_tenant') {
      return this.resolvePluginSetting(key, scopeId!, tenantId, defaultValue);
    }

    // Core scopes: tenant → global → schema default → provided default
    return this.resolveCoreSetting(key, tenantId, defaultValue);
  }

  /**
   * Get a setting with full metadata
   */
  async getWithMetadata(
    scope: SettingScope,
    key: string,
    options: GetSettingOptions = {}
  ): Promise<ResolvedSetting | null> {
    const { tenantId, scopeId } = options;

    // Try to find the setting at the specified scope
    const setting = await this.findSetting(scope, key, tenantId, scopeId);
    if (setting) {
      return this.toResolvedSetting(setting, scope);
    }

    // For core scopes, try cascade
    if (scope === 'tenant' && tenantId) {
      const globalSetting = await this.findSetting('global', key);
      if (globalSetting) {
        return this.toResolvedSetting(globalSetting, 'global');
      }
    }

    // For plugin_tenant, try plugin_global
    if (scope === 'plugin_tenant' && scopeId) {
      const pluginGlobal = await this.findSetting('plugin_global', key, undefined, scopeId);
      if (pluginGlobal) {
        return this.toResolvedSetting(pluginGlobal, 'plugin_global');
      }
    }

    return null;
  }

  /**
   * Set a setting value
   */
  async set(
    scope: SettingScope,
    key: string,
    value: unknown,
    options: SetSettingOptions = {}
  ): Promise<Setting> {
    const { tenantId, scopeId, encrypted, description, valueType } = options;
    const ctx = requestContextStorage.getStore();

    // Validate scope parameters
    this.validateScopeParams(scope, tenantId, scopeId);

    // Validate against schema if one exists
    const validation = this.schemaRegistry.validate(key, value);
    if (!validation.valid) {
      throw new Error(
        `Invalid value for setting "${key}": ${validation.errors?.join(', ')}`
      );
    }

    // Check for existing setting
    const existing = await this.findSetting(scope, key, tenantId, scopeId);

    // Prepare value (encrypt if needed)
    let storedValue: unknown = value;
    if (encrypted && this.encryptionService.isAvailable()) {
      storedValue = this.encryptionService.encrypt(value);
    }

    // Determine value type
    const resolvedValueType = valueType ?? this.inferValueType(value);

    const settingData = {
      scope,
      scopeId: scopeId ?? null,
      tenantId: tenantId ?? null,
      key,
      value: storedValue,
      valueType: resolvedValueType,
      encrypted: encrypted ?? false,
      schemaVersion: validation.schemaVersion ?? 1,
      description: description ?? null,
      createdBy: ctx?.userId ?? null,
      updatedBy: ctx?.userId ?? null,
    };

    let result: Setting;

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(settings)
        .set({
          ...settingData,
          createdBy: undefined, // Don't update createdBy
        })
        .where(eq(settings.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error('Failed to update setting');
      }
      result = updated;
    } else {
      // Insert new
      const [inserted] = await db
        .insert(settings)
        .values(settingData)
        .returning();
      if (!inserted) {
        throw new Error('Failed to insert setting');
      }
      result = inserted;
    }

    // Audit log
    await this.auditService.log({
      entityType: 'setting',
      entityId: result.id,
      tenantId: tenantId ?? undefined,
      action: existing ? 'update' : 'create',
      changes: {
        old: existing
          ? encrypted
            ? '[REDACTED]'
            : existing.value
          : null,
        new: encrypted ? '[REDACTED]' : value,
      },
      metadata: {
        scope,
        key,
        scopeId: scopeId ?? undefined,
        encrypted: encrypted ?? false,
      },
    });

    // Invalidate cache
    const cacheKey = this.cacheService.buildKey(scope, key, tenantId, scopeId);
    await this.cacheService.invalidate(cacheKey);

    this.logger.debug(`Setting ${existing ? 'updated' : 'created'}: ${scope}/${key}`);

    return result;
  }

  /**
   * Delete a setting
   */
  async delete(
    scope: SettingScope,
    key: string,
    options: { tenantId?: string | undefined; scopeId?: string | undefined } = {}
  ): Promise<boolean> {
    const { tenantId, scopeId } = options;

    const existing = await this.findSetting(scope, key, tenantId, scopeId);
    if (!existing) {
      return false;
    }

    await db.delete(settings).where(eq(settings.id, existing.id));

    // Audit log
    await this.auditService.log({
      entityType: 'setting',
      entityId: existing.id,
      tenantId: tenantId ?? undefined,
      action: 'delete',
      changes: {
        old: existing.encrypted ? '[REDACTED]' : existing.value,
      },
      metadata: {
        scope,
        key,
        scopeId: scopeId ?? undefined,
      },
    });

    // Invalidate cache
    const cacheKey = this.cacheService.buildKey(scope, key, tenantId, scopeId);
    await this.cacheService.invalidate(cacheKey);

    this.logger.debug(`Setting deleted: ${scope}/${key}`);

    return true;
  }

  /**
   * List settings for a scope
   */
  async list(
    scope: SettingScope,
    options: ListSettingsOptions = {}
  ): Promise<ResolvedSetting[]> {
    const { tenantId, scopeId, keyPrefix, includeEncrypted = true } = options;

    const conditions = [eq(settings.scope, scope)];

    if (tenantId) {
      conditions.push(eq(settings.tenantId, tenantId));
    } else if (scope === 'tenant' || scope === 'plugin_tenant') {
      // For tenant scopes without tenantId, match NULL
      conditions.push(sql`${settings.tenantId} IS NULL`);
    }

    if (scopeId) {
      conditions.push(eq(settings.scopeId, scopeId));
    } else if (scope === 'plugin_global' || scope === 'plugin_tenant') {
      // For plugin scopes without scopeId, match NULL
      conditions.push(sql`${settings.scopeId} IS NULL`);
    }

    if (keyPrefix) {
      conditions.push(like(settings.key, `${keyPrefix}%`));
    }

    const results = await db
      .select()
      .from(settings)
      .where(and(...conditions))
      .orderBy(settings.key);

    return results
      .filter((s) => includeEncrypted || !s.encrypted)
      .map((s) => this.toResolvedSetting(s, scope));
  }

  /**
   * Delete all settings for a plugin (used during plugin uninstall)
   */
  async deletePluginSettings(pluginId: string): Promise<number> {
    const result = await db
      .delete(settings)
      .where(eq(settings.scopeId, pluginId))
      .returning({ id: settings.id });

    if (result.length > 0) {
      await this.auditService.log({
        entityType: 'setting',
        action: 'delete_bulk',
        metadata: {
          pluginId,
          count: result.length,
          reason: 'plugin_uninstall',
        },
      });

      // Invalidate all cache entries for this plugin
      await this.cacheService.invalidatePattern(`plugin_global:${pluginId}:*`);
      await this.cacheService.invalidatePattern(`plugin_tenant:${pluginId}:*`);

      this.logger.log(`Deleted ${result.length} settings for plugin: ${pluginId}`);
    }

    return result.length;
  }

  // Private helper methods

  private async resolveCoreSetting(
    key: string,
    tenantId?: string,
    defaultValue?: unknown
  ): Promise<unknown> {
    // 1. Tenant override
    if (tenantId) {
      const tenant = await this.findSetting('tenant', key, tenantId);
      if (tenant) {
        return this.decryptValue(tenant);
      }
    }

    // 2. Global
    const global = await this.findSetting('global', key);
    if (global) {
      return this.decryptValue(global);
    }

    // 3. Schema default
    const schemaDefault = this.schemaRegistry.getDefault(key);
    if (schemaDefault !== null) {
      return schemaDefault;
    }

    // 4. Provided default
    return defaultValue ?? null;
  }

  private async resolvePluginSetting(
    key: string,
    pluginId: string,
    tenantId?: string,
    defaultValue?: unknown
  ): Promise<unknown> {
    // 1. Plugin tenant override
    if (tenantId) {
      const pluginTenant = await this.findSetting(
        'plugin_tenant',
        key,
        tenantId,
        pluginId
      );
      if (pluginTenant) {
        return this.decryptValue(pluginTenant);
      }
    }

    // 2. Plugin global
    const pluginGlobal = await this.findSetting(
      'plugin_global',
      key,
      undefined,
      pluginId
    );
    if (pluginGlobal) {
      return this.decryptValue(pluginGlobal);
    }

    // 3. Return default (plugins don't fall back to core)
    return defaultValue ?? null;
  }

  private async findSetting(
    scope: SettingScope,
    key: string,
    tenantId?: string,
    scopeId?: string
  ): Promise<Setting | undefined> {
    // Check cache first
    const cacheKey = this.cacheService.buildKey(scope, key, tenantId, scopeId);
    const cached = await this.cacheService.get<Setting>(cacheKey);
    if (cached) {
      return cached;
    }

    const conditions = [
      eq(settings.scope, scope),
      eq(settings.key, key),
    ];

    // Handle NULL comparison for optional fields
    if (tenantId) {
      conditions.push(eq(settings.tenantId, tenantId));
    } else {
      conditions.push(sql`${settings.tenantId} IS NULL`);
    }

    if (scopeId) {
      conditions.push(eq(settings.scopeId, scopeId));
    } else {
      conditions.push(sql`${settings.scopeId} IS NULL`);
    }

    const result = await db
      .select()
      .from(settings)
      .where(and(...conditions))
      .limit(1);

    const setting = result[0];

    // Cache the result if found
    if (setting) {
      await this.cacheService.set(cacheKey, setting);
    }

    return setting;
  }

  private decryptValue(setting: Setting): unknown {
    if (!setting.encrypted || !setting.value) {
      return setting.value;
    }

    if (isEncryptedValue(setting.value) && this.encryptionService.isAvailable()) {
      try {
        return this.encryptionService.decrypt(setting.value);
      } catch (error) {
        this.logger.error(`Failed to decrypt setting ${setting.key}: ${error}`);
        throw new Error(`Failed to decrypt setting: ${setting.key}`);
      }
    }

    return setting.value;
  }

  private toResolvedSetting(setting: Setting, resolvedFrom: SettingScope): ResolvedSetting {
    return {
      id: setting.id,
      scope: setting.scope as SettingScope,
      key: setting.key,
      value: this.decryptValue(setting),
      valueType: setting.valueType as SettingValueType | null,
      encrypted: setting.encrypted,
      schemaVersion: setting.schemaVersion,
      description: setting.description,
      resolvedFrom,
    };
  }

  private validateScopeParams(
    scope: SettingScope,
    tenantId?: string,
    scopeId?: string
  ): void {
    switch (scope) {
      case 'global':
        if (tenantId || scopeId) {
          throw new Error('Global scope should not have tenantId or scopeId');
        }
        break;
      case 'tenant':
        if (!tenantId) {
          throw new Error('Tenant scope requires tenantId');
        }
        if (scopeId) {
          throw new Error('Tenant scope should not have scopeId');
        }
        break;
      case 'plugin_global':
        if (!scopeId) {
          throw new Error('Plugin global scope requires scopeId (pluginId)');
        }
        if (tenantId) {
          throw new Error('Plugin global scope should not have tenantId');
        }
        break;
      case 'plugin_tenant':
        if (!scopeId) {
          throw new Error('Plugin tenant scope requires scopeId (pluginId)');
        }
        if (!tenantId) {
          throw new Error('Plugin tenant scope requires tenantId');
        }
        break;
    }
  }

  private inferValueType(value: unknown): SettingValueType {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'json';
  }
}
