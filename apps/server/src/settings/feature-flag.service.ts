import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  featureFlags,
  featureFlagOverrides,
  type FeatureFlag,
  type FeatureFlagOverride,
  type FlagCondition,
  type FlagEvaluationContext,
  type FlagCheckResult,
} from '../db/schema/definitions.js';
import { AuditService } from '../audit/audit.service.js';
import { requestContextStorage } from '../context/async-local-storage';

/**
 * MurmurHash3 implementation for consistent rollout
 * Provides stable hash for userId to ensure same user gets same result
 */
function murmurhash3(str: string): number {
  let h1 = 0xdeadbeef;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  for (let i = 0; i < str.length; i++) {
    let k1 = str.charCodeAt(i);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  h1 ^= str.length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Feature Flags Service
 *
 * Manages feature flags with:
 * - Global flag definitions
 * - Tenant-level overrides
 * - Condition-based evaluation
 * - Rollout percentage (consistent hash-based)
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Check if a feature flag is enabled for a given context
   */
  async check(key: string, context: FlagEvaluationContext): Promise<boolean> {
    const result = await this.checkWithDetails(key, context);
    return result.enabled;
  }

  /**
   * Check feature flag with detailed result
   */
  async checkWithDetails(
    key: string,
    context: FlagEvaluationContext
  ): Promise<FlagCheckResult> {
    const flag = await this.getByKey(key);
    if (!flag) {
      return { enabled: false, source: 'global' };
    }

    // Check for tenant override
    const override = await this.getOverride(flag.id, context.organizationId);
    if (override) {
      const config = {
        enabled: override.enabled,
        rolloutPercentage: override.rolloutPercentage ?? flag.rolloutPercentage,
        conditions: (override.conditions ?? flag.conditions) as FlagCondition[],
        key: flag.key,
      };
      return this.evaluateFlag(config, context, 'override');
    }

    // Use global config
    const config = {
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      conditions: flag.conditions as FlagCondition[],
      key: flag.key,
    };
    return this.evaluateFlag(config, context, 'global');
  }

  /**
   * Get all feature flags
   */
  async list(): Promise<FeatureFlag[]> {
    return db.select().from(featureFlags).orderBy(featureFlags.key);
  }

  /**
   * Get a feature flag by key
   */
  async getByKey(key: string): Promise<FeatureFlag | undefined> {
    const result = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);
    return result[0];
  }

  /**
   * Create a new feature flag
   */
  async create(data: {
    key: string;
    name: string;
    description?: string | undefined;
    enabled?: boolean | undefined;
    rolloutPercentage?: number | undefined;
    conditions?: FlagCondition[] | undefined;
  }): Promise<FeatureFlag> {
    const ctx = requestContextStorage.getStore();

    const [flag] = await db
      .insert(featureFlags)
      .values({
        key: data.key,
        name: data.name,
        description: data.description ?? null,
        enabled: data.enabled ?? false,
        rolloutPercentage: data.rolloutPercentage ?? 100,
        conditions: data.conditions ?? [],
        createdBy: ctx?.userId ?? null,
      })
      .returning();

    if (!flag) {
      throw new Error('Failed to create feature flag');
    }

    await this.auditService.log({
      entityType: 'feature_flag',
      entityId: flag.id,
      action: 'create',
      changes: { new: data },
      metadata: { key: data.key },
    });

    this.logger.log(`Feature flag created: ${data.key}`);
    return flag;
  }

  /**
   * Update a feature flag
   */
  async update(
    id: string,
    data: Partial<{
      name: string | undefined;
      description: string | undefined;
      enabled: boolean | undefined;
      rolloutPercentage: number | undefined;
      conditions: FlagCondition[] | undefined;
    }>
  ): Promise<FeatureFlag | undefined> {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id))
      .limit(1);

    if (!existing[0]) {
      return undefined;
    }

    const [updated] = await db
      .update(featureFlags)
      .set(data)
      .where(eq(featureFlags.id, id))
      .returning();

    await this.auditService.log({
      entityType: 'feature_flag',
      entityId: id,
      action: 'update',
      changes: { old: existing[0], new: data },
      metadata: { key: existing[0].key },
    });

    this.logger.log(`Feature flag updated: ${existing[0].key}`);
    return updated;
  }

  /**
   * Delete a feature flag
   */
  async delete(id: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id))
      .limit(1);

    if (!existing[0]) {
      return false;
    }

    await db.delete(featureFlags).where(eq(featureFlags.id, id));

    await this.auditService.log({
      entityType: 'feature_flag',
      entityId: id,
      action: 'delete',
      changes: { old: existing[0] },
      metadata: { key: existing[0].key },
    });

    this.logger.log(`Feature flag deleted: ${existing[0].key}`);
    return true;
  }

  /**
   * Get tenant override for a flag
   */
  async getOverride(
    flagId: string,
    organizationId: string
  ): Promise<FeatureFlagOverride | undefined> {
    const result = await db
      .select()
      .from(featureFlagOverrides)
      .where(
        and(
          eq(featureFlagOverrides.flagId, flagId),
          eq(featureFlagOverrides.organizationId, organizationId)
        )
      )
      .limit(1);
    return result[0];
  }

  /**
   * Set tenant override for a flag
   */
  async setOverride(
    flagKey: string,
    organizationId: string,
    config: {
      enabled: boolean;
      rolloutPercentage?: number | undefined;
      conditions?: FlagCondition[] | undefined;
    }
  ): Promise<FeatureFlagOverride> {
    const flag = await this.getByKey(flagKey);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagKey}`);
    }

    const ctx = requestContextStorage.getStore();
    const existing = await this.getOverride(flag.id, organizationId);

    if (existing) {
      // Update existing override
      const [updated] = await db
        .update(featureFlagOverrides)
        .set({
          enabled: config.enabled,
          rolloutPercentage: config.rolloutPercentage ?? null,
          conditions: config.conditions ?? null,
        })
        .where(eq(featureFlagOverrides.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error('Failed to update override');
      }

      await this.auditService.log({
        entityType: 'feature_flag_override',
        entityId: existing.id,
        organizationId,
        action: 'update',
        changes: { old: existing, new: config },
        metadata: { flagKey, flagId: flag.id },
      });

      return updated;
    } else {
      // Create new override
      const [created] = await db
        .insert(featureFlagOverrides)
        .values({
          flagId: flag.id,
          organizationId,
          enabled: config.enabled,
          rolloutPercentage: config.rolloutPercentage ?? null,
          conditions: config.conditions ?? null,
          createdBy: ctx?.userId ?? null,
        })
        .returning();

      if (!created) {
        throw new Error('Failed to create override');
      }

      await this.auditService.log({
        entityType: 'feature_flag_override',
        entityId: created.id,
        organizationId,
        action: 'create',
        changes: { new: config },
        metadata: { flagKey, flagId: flag.id },
      });

      return created;
    }
  }

  /**
   * Remove tenant override for a flag
   */
  async removeOverride(flagKey: string, organizationId: string): Promise<boolean> {
    const flag = await this.getByKey(flagKey);
    if (!flag) {
      return false;
    }

    const existing = await this.getOverride(flag.id, organizationId);
    if (!existing) {
      return false;
    }

    await db
      .delete(featureFlagOverrides)
      .where(eq(featureFlagOverrides.id, existing.id));

    await this.auditService.log({
      entityType: 'feature_flag_override',
      entityId: existing.id,
      organizationId,
      action: 'delete',
      changes: { old: existing },
      metadata: { flagKey, flagId: flag.id },
    });

    return true;
  }

  /**
   * Get all overrides for a tenant
   */
  async listOverrides(organizationId: string): Promise<FeatureFlagOverride[]> {
    return db
      .select()
      .from(featureFlagOverrides)
      .where(eq(featureFlagOverrides.organizationId, organizationId));
  }

  // Private helper methods

  private evaluateFlag(
    config: {
      enabled: boolean;
      rolloutPercentage: number;
      conditions: FlagCondition[];
      key: string;
    },
    context: FlagEvaluationContext,
    source: 'global' | 'override'
  ): FlagCheckResult {
    // Flag is disabled
    if (!config.enabled) {
      return { enabled: false, source };
    }

    // Check conditions
    const conditionsPassed = this.evaluateConditions(config.conditions, context);
    if (!conditionsPassed) {
      return {
        enabled: false,
        source,
        evaluatedConditions: false,
      };
    }

    // Check rollout percentage
    const rolloutIncluded = this.checkRollout(
      config.key,
      context.userId,
      config.rolloutPercentage
    );

    return {
      enabled: rolloutIncluded,
      source,
      evaluatedConditions: true,
      rolloutIncluded,
    };
  }

  private evaluateConditions(
    conditions: FlagCondition[],
    context: FlagEvaluationContext
  ): boolean {
    // All conditions must pass
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(
    condition: FlagCondition,
    context: FlagEvaluationContext
  ): boolean {
    let contextValue: unknown;

    switch (condition.type) {
      case 'user_role':
        contextValue = context.userRole;
        break;
      case 'tenant_plan':
        contextValue = context.tenantPlan;
        break;
      case 'user_id':
        contextValue = context.userId;
        break;
      case 'percentage':
        // Percentage is handled by rollout, always pass here
        return true;
      default:
        contextValue = context[condition.type];
    }

    return this.compareValues(contextValue, condition.operator, condition.value);
  }

  private compareValues(
    contextValue: unknown,
    operator: string,
    conditionValue: unknown
  ): boolean {
    switch (operator) {
      case 'eq':
        return contextValue === conditionValue;
      case 'neq':
        return contextValue !== conditionValue;
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(contextValue);
      case 'nin':
        return Array.isArray(conditionValue) && !conditionValue.includes(contextValue);
      case 'gt':
        return typeof contextValue === 'number' &&
          typeof conditionValue === 'number' &&
          contextValue > conditionValue;
      case 'lt':
        return typeof contextValue === 'number' &&
          typeof conditionValue === 'number' &&
          contextValue < conditionValue;
      case 'gte':
        return typeof contextValue === 'number' &&
          typeof conditionValue === 'number' &&
          contextValue >= conditionValue;
      case 'lte':
        return typeof contextValue === 'number' &&
          typeof conditionValue === 'number' &&
          contextValue <= conditionValue;
      default:
        return false;
    }
  }

  private checkRollout(key: string, userId: string, percentage: number): boolean {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;

    // Consistent hash based on userId + flagKey
    const hash = murmurhash3(userId + key) % 100;
    return hash < percentage;
  }
}
