/**
 * Billing tRPC Router
 *
 * Provides the complete billing API for plan management, subscriptions,
 * quotas, capabilities, payments, and billing configuration.
 *
 * ## API Groups
 *
 * ### plans (auto-crud)
 * Standard CRUD via createCrudRouter + soft-delete (archive) + getWithItems.
 * Delete middleware guards against deleting plans with active subscriptions.
 *
 * ### planItems (hand-written)
 * CRUD for plan capability items. Hand-written because it requires capability
 * selector interaction (only approved capabilities) and conditional validation
 * (overagePriceCents required when overagePolicy='charge').
 *
 * ### capabilities
 * Capability registry: list/register/review(approve|reject)/delete.
 * Namespace enforcement: core.* for core, plugin.{id}.* for plugins.
 *
 * ### Subscriptions
 * Full lifecycle: create → activate → cancel → changePlan.
 * Queries: getSubscription, getTenantSubscriptions, getAllTenantSubscriptions,
 * getSubscriptionHistory.
 *
 * ### Quotas
 * User quotas (getUserQuotas, getFeatureQuota, grantQuota, consumeQuota).
 * Tenant quotas (getTenantQuotas, getCombinedBalance, grantTenantQuota).
 * Unified consume (unifiedConsume) with waterfall deduction.
 * hasQuota check for pre-flight validation.
 *
 * ### Wallet & Transactions
 * getWallet, getUserTransactions, getUsageHistory.
 *
 * ### Payment Gateways
 * listGateways - returns registered payment adapter metadata.
 *
 * ### billingConfig (platform admin)
 * L2 Module Default: per-plugin default subject (setModuleDefault/deleteModuleDefault).
 * Default Policy: undeclared procedure policy (allow/deny/audit).
 *
 * ## Authorization
 * - Plan/PlanItem/Capability: permission-based (protectedProcedure.meta)
 * - User quotas/wallet/transactions: owner-or-admin check (assertCanAccessUser)
 * - Billing config: platform org only (requirePlatformOrg)
 *
 * ## Audit
 * All mutations include audit metadata for audit log recording.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { createCrudRouter, type CrudOperation } from '@wordrhyme/auto-crud-server';
import { plans, planSubscriptions, capabilities } from '@wordrhyme/db';
import { db } from '../../db';
import { eq, and, ilike, or, inArray, sql } from 'drizzle-orm';
import type { SettingsService } from '../../settings/settings.service';
import { 
  refreshBillingSettings, 
  resolveBillingSubject,
  type BillingDefaultPolicy 
} from '../../billing/billing-guard';
import { parsePluginProcedurePath } from '../../billing/plugin-procedure-path';
import { getPermissionRegistry } from '../permission-registry';
import { getAllDriftReports, clearDriftReport, type BillingDriftReport } from '../../billing/billing-drift';
import { resolvePluginId } from '../router';

// ─── DI: SettingsService for billing config APIs ───

let _billingSettings: SettingsService | null = null;

export function setBillingSettingsService(settings: SettingsService): void {
  _billingSettings = settings;
}

function requireBillingSettings(): SettingsService {
  if (!_billingSettings) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Billing SettingsService not initialized',
    });
  }
  return _billingSettings;
}

// ============================================================================
// Authorization Helpers
// ============================================================================

function requirePlatformOrg(organizationId: string | undefined): void {
  if (organizationId !== 'platform') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only platform administrators can manage billing configuration',
    });
  }
}

function assertCanAccessUser(
  ctx: { userId?: string | undefined; userRole?: string | undefined },
  targetUserId: string
): void {
  const isOwn = ctx.userId === targetUserId;
  const isAdmin = ctx.userRole === 'admin' || ctx.userRole === 'owner';
  if (!isOwn && !isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You can only access your own billing data',
    });
  }
}

// ============================================================================
// Shared Input Schemas
// ============================================================================

const consumeQuotaSchema = z.object({
  userId: z.string(),
  subject: z.string(),
  amount: z.number().int().positive(),
  allowOverage: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const grantQuotaSchema = z.object({
  userId: z.string(),
  subject: z.string(),
  amount: z.number().int().positive(),
  priority: z.number().int().default(0),
  expiresAt: z.string().datetime().optional(),
  sourceType: z.enum(['membership', 'shop_order', 'plugin', 'admin_grant']),
  sourceId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createSubscriptionSchema = z.object({
  organizationId: z.string(),
  planId: z.string(),
  gateway: z.string().default('stripe'),
  trialDays: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string(),
  reason: z.string().optional(),
  immediate: z.boolean().default(false),
});

const changePlanSchema = z.object({
  subscriptionId: z.string(),
  newPlanId: z.string(),
  immediate: z.boolean().default(false),
});

const grantTenantQuotaSchema = z.object({
  organizationId: z.string(),
  subject: z.string(),
  amount: z.number().int().positive(),
  priority: z.number().int().default(100),
  expiresAt: z.string().datetime().optional(),
  sourceType: z.enum(['membership', 'shop_order', 'plugin', 'admin_grant']),
  sourceId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const unifiedConsumeSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  subject: z.string(),
  amount: z.number().int().positive(),
  allowOverage: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// PlanItem Input Schema (hand-written: needs capability selector)
// ============================================================================

const createPlanItemSchema = z.object({
  planId: z.string(),
  subject: z.string().min(1),
  type: z.enum(['boolean', 'metered']),
  amount: z.number().int().positive().optional(),
  resetMode: z.enum(['period', 'never']),
  priority: z.number().int().default(0),
  overagePolicy: z.enum(['deny', 'charge', 'throttle', 'downgrade']).default('deny'),
  overagePriceCents: z.number().int().positive().optional(),
  resetStrategy: z.enum(['hard', 'soft', 'capped']).default('hard'),
  resetCap: z.number().int().positive().optional(),
  quotaScope: z.enum(['tenant', 'user']).default('tenant'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updatePlanItemSchema = createPlanItemSchema.omit({ planId: true }).partial();

// ============================================================================
// Plan CRUD (auto-crud-server)
// 任务 2.1-2.2: createCrudRouter + protectedProcedure.meta 权限集成
// ============================================================================

const plansCrud = createCrudRouter({
  table: plans,
  // 零配置：Schema 自动从 table 派生，默认排除 id/createdAt/updatedAt
  procedure: ((op: CrudOperation) => {
    const action = op === 'list' || op === 'get' ? 'read' :
      op === 'deleteMany' ? 'delete' :
      op === 'updateMany' ? 'update' :
      op as 'create' | 'update' | 'delete';
    return protectedProcedure.meta({
      permission: { action, subject: 'BillingPlan' },
    });
  }),
  middleware: {
    // 软删除校验：有活跃订阅时阻止删除（任务 2.6）
    delete: async ({ id, next }) => {
      const billingDb = db;
      const [row] = await billingDb
        .select()
        .from(plans)
        .where(eq(plans.id, id as string))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Plan ${id} not found` });
      }

      // Check for active subscriptions before allowing delete
      const { planSubscriptions } = await import('../../db/schema/billing');
      const { inArray } = await import('drizzle-orm');
      const [subRow] = await billingDb
        .select({ count: (await import('drizzle-orm')).sql<number>`COUNT(*)` })
        .from(planSubscriptions)
        .where(
          and(
            eq(planSubscriptions.planId, id as string),
            inArray(planSubscriptions.status, ['active', 'trialing', 'past_due'])
          )
        );

      if ((subRow?.count ?? 0) > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete plan with active subscriptions. Cancel all subscriptions first.',
        });
      }

      return next();
    },
  },
} as const);

// ============================================================================
// Router Definition
// ============================================================================

export const billingRouter = router({
  // --------------------------------------------------------------------------
  // Plans (auto-crud) - 任务 2.1-2.2
  // --------------------------------------------------------------------------

  plans: router({
    ...plansCrud.procedures,

    /**
     * Soft-delete plan (set isActive=0) instead of hard delete
     * Provides a safer alternative to the hard-delete in plans.delete
     */
    archive: protectedProcedure
      .meta({ permission: { action: 'delete', subject: 'BillingPlan' } })
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;
        const plan = await billingRepo.getPlanById(input.id);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan ${input.id} not found` });
        }

        const hasActive = await billingRepo.hasActiveSubscriptions(input.id);
        if (hasActive) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot archive plan with active subscriptions.',
          });
        }

        return billingRepo.softDeletePlan(input.id);
      }),

    /**
     * Get plan with its items
     */
    getWithItems: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingPlan' } })
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const { billingRepo } = ctx;
        const result = await billingRepo.getPlanWithItems(input.id);
        if (!result) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan ${input.id} not found` });
        }
        return result;
      }),
  }),

  // --------------------------------------------------------------------------
  // Plan Items - 任务 2.3-2.5
  // 手写原因：PlanItem 需要 capability 选择器（仅显示 approved 状态的 capability，
  // 支持搜索），以及 overagePolicy/overagePriceCents 的条件校验（charge 时必填
  // overagePriceCents），这些约束无法通过 createCrudRouter 的通用接口表达。
  // --------------------------------------------------------------------------

  planItems: router({
    /**
     * List items for a plan
     */
    list: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingPlan' } })
      .input(z.object({ planId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { billingRepo } = ctx;
        return billingRepo.getPlanItems(input.planId);
      }),

    /**
     * Create a plan item
     * - subject must reference an approved capability
     * - overagePriceCents required when overagePolicy='charge'
     */
    create: protectedProcedure
      .meta({ permission: { action: 'create', subject: 'BillingPlan' } })
      .input(createPlanItemSchema)
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        // Verify plan exists
        const plan = await billingRepo.getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan ${input.planId} not found` });
        }

        // Verify capability is approved
        const cap = await billingRepo.getCapabilityBySubject(input.subject);
        if (!cap) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Capability '${input.subject}' is not registered.`,
          });
        }
        if (cap.status !== 'approved') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Capability '${input.subject}' is not approved (status: ${cap.status}).`,
          });
        }

        // overagePriceCents required when overagePolicy='charge'
        if (input.overagePolicy === 'charge' && !input.overagePriceCents) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'overagePriceCents is required when overagePolicy is "charge".',
          });
        }

        return billingRepo.createPlanItem(input);
      }),

    /**
     * Update a plan item
     */
    update: protectedProcedure
      .meta({ permission: { action: 'update', subject: 'BillingPlan' } })
      .input(z.object({ id: z.string(), data: updatePlanItemSchema }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        if (input.data.subject) {
          const cap = await billingRepo.getCapabilityBySubject(input.data.subject);
          if (!cap || cap.status !== 'approved') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Capability '${input.data.subject}' is not registered or not approved.`,
            });
          }
        }

        if (input.data.overagePolicy === 'charge' && !input.data.overagePriceCents) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'overagePriceCents is required when overagePolicy is "charge".',
          });
        }

        // Strip undefined values to satisfy exactOptionalPropertyTypes
        const updateData = Object.fromEntries(
          Object.entries(input.data).filter(([, v]) => v !== undefined)
        ) as Parameters<typeof billingRepo.updatePlanItem>[1];
        const item = await billingRepo.updatePlanItem(input.id, updateData);
        if (!item) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan item ${input.id} not found` });
        }
        return item;
      }),

    /**
     * Delete a plan item
     */
    delete: protectedProcedure
      .meta({ permission: { action: 'delete', subject: 'BillingPlan' } })
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;
        const deleted = await billingRepo.deletePlanItem(input.id);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan item ${input.id} not found` });
        }
        return { success: true };
      }),

    /**
     * Batch save plan items (matrix UI).
     * Creates new items, updates existing, and removes unchecked ones.
     */
    saveBatch: protectedProcedure
      .meta({ permission: { action: 'update', subject: 'BillingPlan' }, audit: { action: 'PLAN_ITEMS_BATCH_SAVE' } })
      .input(z.object({
        planId: z.string(),
        items: z.array(z.object({
          procedurePath: z.string().min(1).optional(),
          groupKey: z.string().min(1).nullable().optional(),
          subject: z.string().min(1),
          type: z.enum(['boolean', 'metered']),
          amount: z.number().int().positive().optional(),
          resetMode: z.enum(['period', 'never']).default('period'),
          overagePolicy: z.enum(['deny', 'charge', 'throttle', 'downgrade']).default('deny'),
          overagePriceCents: z.number().int().positive().optional(),
          resetStrategy: z.enum(['hard', 'soft', 'capped']).default('hard'),
          resetCap: z.number().int().positive().optional(),
          quotaScope: z.enum(['tenant', 'user']).default('tenant'),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        // Verify plan exists
        const plan = await billingRepo.getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Plan ${input.planId} not found` });
        }

        // Get existing items for this plan
        const existingItems = await billingRepo.getPlanItems(input.planId);
        const keyOf = (item: { procedurePath?: string | null; subject: string }) => item.procedurePath ?? item.subject;
        const existingByKey = new Map(existingItems.map((item: any) => [keyOf(item), item]));
        const newKeys = new Set(input.items.map(i => keyOf(i as any)));
        const registry = getPermissionRegistry();

        for (const item of input.items) {
          // 优先检查 procedurePath 是否在 permission registry 中
          const inRegistry = item.procedurePath && registry.has(item.procedurePath);

          if (!inRegistry) {
            // procedurePath 不在 registry 中（或没有 procedurePath），走 capability 校验
            const cap = await billingRepo.getCapabilityBySubject(item.subject);
            if (!cap || cap.status !== 'approved') {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Capability '${item.subject}' is not registered or not approved.`,
              });
            }
          }

          if (item.overagePolicy === 'charge' && !item.overagePriceCents) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'overagePriceCents is required when overagePolicy is "charge".',
            });
          }
        }

        let created = 0, updated = 0, removed = 0;

        // Delete items no longer in the list
        for (const existing of existingItems) {
          if (!newKeys.has(keyOf(existing as any))) {
            await billingRepo.deletePlanItem(existing.id);
            removed++;
          }
        }

        // Create or update items
        for (const item of input.items) {
          const existing = existingByKey.get(keyOf(item as any));
          if (existing) {
            // Update if changed
            await billingRepo.updatePlanItem(existing.id, {
              procedurePath: item.procedurePath,
              groupKey: item.groupKey ?? null,
              type: item.type,
              amount: item.type === 'metered' ? item.amount : undefined,
              resetMode: item.resetMode,
              overagePolicy: item.overagePolicy,
              overagePriceCents: item.overagePolicy === 'charge' ? item.overagePriceCents : undefined,
              resetStrategy: item.resetStrategy,
              resetCap: item.resetStrategy === 'capped' ? item.resetCap : undefined,
              quotaScope: item.quotaScope,
            });
            updated++;
          } else {
            // Create new
            await billingRepo.createPlanItem({
              planId: input.planId,
              subject: item.subject,
              procedurePath: item.procedurePath,
              groupKey: item.groupKey ?? null,
              type: item.type,
              amount: item.type === 'metered' ? item.amount : undefined,
              resetMode: item.resetMode,
              overagePolicy: item.overagePolicy,
              overagePriceCents: item.overagePolicy === 'charge' ? item.overagePriceCents : undefined,
              resetStrategy: item.resetStrategy,
              resetCap: item.resetStrategy === 'capped' ? item.resetCap : undefined,
              quotaScope: item.quotaScope,
            });
            created++;
          }
        }

        return { success: true, created, updated, removed };
      }),
  }),

  // --------------------------------------------------------------------------
  // Capabilities - 任务 2.7
  // --------------------------------------------------------------------------

  capabilities: router({
    /**
     * List capabilities (for PlanItem selector)
     * - returns approved only by default (for plan config UI)
     * - supports source filter and search
     */
    list: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingPlan' } })
      .input(z.object({
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        source: z.enum(['core', 'plugin']).optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const conditions = [];
        if (input?.status) {
          conditions.push(eq(capabilities.status, input.status));
        } else {
          conditions.push(eq(capabilities.status, 'approved'));
        }
        if (input?.source) {
          conditions.push(eq(capabilities.source, input.source));
        }
        if (input?.search) {
          conditions.push(
            or(
              ilike(capabilities.subject, `%${input.search}%`),
              ilike(capabilities.description, `%${input.search}%`)
            )
          );
        }

        return db
          .select()
          .from(capabilities)
          .where(and(...conditions))
          .orderBy(capabilities.source, capabilities.subject);
      }),

    /**
     * List pending capabilities for approval (platform admin)
     */
    listPending: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingCapability' } })
      .query(async () => {
        return db
          .select()
          .from(capabilities)
          .where(eq(capabilities.status, 'pending'))
          .orderBy(capabilities.createdAt);
      }),

    /**
     * Register a core capability (system use / seed)
     */
    register: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingCapability' } })
      .input(z.object({
        subject: z.string().min(1),
        type: z.enum(['boolean', 'metered']),
        unit: z.string().optional(),
        description: z.string().optional(),
        source: z.enum(['core', 'plugin']),
        pluginId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        // Namespace validation: core.* only for source='core', plugin.{id}.* for plugins
        if (input.source === 'core' && !input.subject.startsWith('core.')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Core capabilities must have subject prefixed with "core."',
          });
        }
        if (input.source === 'plugin') {
          if (!input.pluginId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'pluginId required for plugin capabilities' });
          }
          const expectedPrefix = `plugin.${input.pluginId}.`;
          if (!input.subject.startsWith(expectedPrefix)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Plugin capabilities must be prefixed with "${expectedPrefix}"`,
            });
          }
        }

        return billingRepo.upsertCapability({
          ...input,
          status: input.source === 'core' ? 'approved' : 'pending',
        });
      }),

    /**
     * Approve or reject a pending capability (任务 2.7.6)
     */
    review: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingCapability' }, audit: { action: 'CAPABILITY_REVIEW' } })
      .input(z.object({
        subject: z.string(),
        action: z.enum(['approve', 'reject']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        const cap = await billingRepo.getCapabilityBySubject(input.subject);
        if (!cap) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Capability '${input.subject}' not found` });
        }

        // Cannot reject a capability referenced by active plan items (任务 2.7.7)
        if (input.action === 'reject') {
          const isReferenced = await billingRepo.isCapabilityReferencedByPlanItem(input.subject);
          if (isReferenced) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Cannot reject capability that is referenced by plan items.',
            });
          }
        }

        const status = input.action === 'approve' ? 'approved' : 'rejected';
        return billingRepo.updateCapabilityStatus(input.subject, status);
      }),

    /**
     * Delete a capability (only if not referenced by plan items)
     * Used when uninstalling a plugin (任务 2.7.8)
     */
    delete: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingCapability' } })
      .input(z.object({ subject: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { billingRepo } = ctx;

        const isReferenced = await billingRepo.isCapabilityReferencedByPlanItem(input.subject);
        if (isReferenced) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot delete capability referenced by plan items.',
          });
        }

        const deleted = await billingRepo.deleteCapability(input.subject);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Capability '${input.subject}' not found` });
        }
        return { success: true };
      }),
  }),

  // --------------------------------------------------------------------------
  // User Quotas
  // --------------------------------------------------------------------------

  getUserQuotas: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { quotaService } = ctx;
      return quotaService.getAllUserQuotas(input.userId);
    }),

  getFeatureQuota: protectedProcedure
    .input(z.object({ userId: z.string(), subject: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { quotaService } = ctx;
      return quotaService.getFeatureQuota(input.userId, input.subject);
    }),

  grantQuota: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingQuota' } })
    .input(grantQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      const { quotaService } = ctx;
      await quotaService.grant({
        userId: input.userId,
        subject: input.subject,
        amount: input.amount,
        priority: input.priority,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        ...(input.metadata && { metadata: input.metadata }),
      });
      return { success: true };
    }),

  consumeQuota: protectedProcedure
    .input(consumeQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      if (!ctx.organizationId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Organization context required' });
      }
      const { unifiedUsageService } = ctx;
      return unifiedUsageService.consume({
        organizationId: ctx.organizationId,
        userId: input.userId,
        subject: input.subject,
        amount: input.amount,
        allowOverage: input.allowOverage,
        ...(input.metadata && { metadata: input.metadata }),
      });
    }),

  // --------------------------------------------------------------------------
  // Wallet
  // --------------------------------------------------------------------------

  getWallet: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { walletService } = ctx;
      return walletService.getBalance(input.userId);
    }),

  // --------------------------------------------------------------------------
  // Transactions
  // --------------------------------------------------------------------------

  getUserTransactions: protectedProcedure
    .input(z.object({
      userId: z.string(),
      limit: z.number().int().positive().max(100).default(20),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { paymentService } = ctx;
      return paymentService.getUserTransactions(input.userId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // --------------------------------------------------------------------------
  // Usage History
  // --------------------------------------------------------------------------

  getUsageHistory: protectedProcedure
    .input(z.object({
      userId: z.string(),
      subject: z.string().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
      limit: z.number().int().positive().max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { quotaRepo } = ctx;
      const options: { subject?: string; since?: Date; until?: Date; limit?: number; offset?: number } = {
        limit: input.limit,
        offset: input.offset,
      };
      if (input.subject) options.subject = input.subject;
      if (input.since) options.since = new Date(input.since);
      if (input.until) options.until = new Date(input.until);
      return quotaRepo.getUserUsageRecords(input.userId, options);
    }),

  // --------------------------------------------------------------------------
  // Payment Gateways
  // --------------------------------------------------------------------------

  listGateways: protectedProcedure
    .query(async ({ ctx }) => {
      const { paymentAdapterRegistry } = ctx;
      return paymentAdapterRegistry.getAllMetadata();
    }),

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  createSubscription: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingSubscription' }, audit: { action: 'SUBSCRIPTION_CREATE' } })
    .input(createSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      const createInput: {
        organizationId: string;
        planId: string;
        gateway: string;
        trialDays?: number;
        metadata?: Record<string, unknown>;
      } = {
        organizationId: input.organizationId,
        planId: input.planId,
        gateway: input.gateway,
      };
      if (input.trialDays !== undefined) createInput.trialDays = input.trialDays;
      if (input.metadata !== undefined) createInput.metadata = input.metadata;
      return subscriptionService.create(createInput);
    }),

  getSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      const subscription = await subscriptionService.getById(input.subscriptionId);
      if (!subscription) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Subscription ${input.subscriptionId} not found` });
      }
      return subscription;
    }),

  getTenantSubscriptions: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.getActiveByTenant(input.organizationId);
    }),

  getAllTenantSubscriptions: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.getAllByTenant(input.organizationId);
    }),

  /**
   * Get subscription history with renewal and plan change events
   * Uses the existing subscription records (renewalCount, lastRenewalAt, canceledAt, scheduledPlanId)
   * to construct a timeline. A dedicated events table would be needed for full audit trail.
   */
  getSubscriptionHistory: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      const subscriptions = await subscriptionService.getAllByTenant(input.organizationId);
      return subscriptions.map((sub) => ({
        subscription: sub,
        events: [
          { type: 'created', at: sub.createdAt },
          ...(sub.lastRenewalAt
            ? [{ type: 'renewed', at: sub.lastRenewalAt, renewalCount: sub.renewalCount }]
            : []),
          ...(sub.scheduledPlanId
            ? [{ type: 'plan_change_scheduled', at: sub.scheduledChangeAt, toPlanId: sub.scheduledPlanId }]
            : []),
          ...(sub.canceledAt
            ? [{ type: 'canceled', at: sub.canceledAt, reason: sub.cancelReason }]
            : []),
        ].sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime()),
      }));
    }),

  activateSubscription: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingSubscription' }, audit: { action: 'SUBSCRIPTION_ACTIVATE' } })
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.activate(input.subscriptionId);
    }),

  cancelSubscription: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingSubscription' }, audit: { action: 'SUBSCRIPTION_CANCEL' } })
    .input(cancelSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      const cancelInput: { subscriptionId: string; reason?: string; immediate?: boolean } = {
        subscriptionId: input.subscriptionId,
        immediate: input.immediate,
      };
      if (input.reason !== undefined) cancelInput.reason = input.reason;
      return subscriptionService.cancel(cancelInput);
    }),

  changePlan: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingSubscription' }, audit: { action: 'SUBSCRIPTION_CHANGE_PLAN' } })
    .input(changePlanSchema)
    .mutation(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.schedulePlanChange(
        input.subscriptionId,
        input.newPlanId,
        input.immediate
      );
    }),

  // --------------------------------------------------------------------------
  // Tenant Quotas
  // --------------------------------------------------------------------------

  getTenantQuotas: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tenantQuotaRepo } = ctx;
      return tenantQuotaRepo.getQuotaSummary(input.organizationId);
    }),

  getCombinedBalance: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      subject: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      return unifiedUsageService.getCombinedBalance(
        input.organizationId,
        input.userId,
        input.subject
      );
    }),

  grantTenantQuota: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'BillingQuota' }, audit: { action: 'QUOTA_GRANT' } })
    .input(grantTenantQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      const { tenantQuotaRepo } = ctx;
      return tenantQuotaRepo.upsertBySource({
        organizationId: input.organizationId,
        subject: input.subject,
        balance: input.amount,
        priority: input.priority,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata,
      });
    }),

  unifiedConsume: protectedProcedure
    .input(unifiedConsumeSchema)
    .mutation(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      const consumeInput: {
        organizationId: string;
        userId: string;
        subject: string;
        amount: number;
        allowOverage?: boolean;
        metadata?: Record<string, unknown>;
      } = {
        organizationId: input.organizationId,
        userId: input.userId,
        subject: input.subject,
        amount: input.amount,
        allowOverage: input.allowOverage,
      };
      if (input.metadata !== undefined) consumeInput.metadata = input.metadata;
      return unifiedUsageService.consume(consumeInput);
    }),

  hasQuota: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      subject: z.string(),
      required: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      return unifiedUsageService.hasQuota(
        input.organizationId,
        input.userId,
        input.subject,
        input.required
      );
    }),

  // --------------------------------------------------------------------------
  // Billing Config (L2 Module Default / Default Policy)
  // Tasks 5.6.6, 5.6.7
  // --------------------------------------------------------------------------

  billingConfig: router({
    // ── 5.6.6: L2 Module Default CRUD ──
    // Key format: billing.module.{pluginId}.subject

    listModuleDefaults: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' } })
      .query(async ({ ctx }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        const items = await settings.list('global', { keyPrefix: 'billing.module.' });
        return items
          .filter((s) => s.key.endsWith('.subject'))
          .map((s) => {
            const match = s.key.match(/^billing\.module\.(.+)\.subject$/);
            return {
              pluginId: match?.[1] ?? s.key,
              subject: s.value as string,
              key: s.key,
            };
          });
      }),

    getModuleDefault: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingSettings' } })
      .input(z.object({ pluginId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/) }))
      .query(async ({ ctx, input }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        const key = `billing.module.${input.pluginId}.subject`;
        const value = await settings.get('global', key, { defaultValue: null });
        return { pluginId: input.pluginId, subject: value };
      }),

    setModuleDefault: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' }, audit: { action: 'BILLING_MODULE_DEFAULT_SET' } })
      .input(z.object({
        pluginId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
        subject: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        const key = `billing.module.${input.pluginId}.subject`;
        await settings.set('global', key, input.subject);
        await refreshBillingSettings();
        return { success: true };
      }),

    deleteModuleDefault: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' }, audit: { action: 'BILLING_MODULE_DEFAULT_DELETE' } })
      .input(z.object({ pluginId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/) }))
      .mutation(async ({ ctx, input }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        const key = `billing.module.${input.pluginId}.subject`;
        await settings.delete('global', key);
        await refreshBillingSettings();
        return { success: true };
      }),

    // ── 5.6.7: Default Policy ──
    // Key: billing.defaultUndeclaredPolicy (allow/deny/audit)

    getDefaultPolicy: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingSettings' } })
      .query(async ({ ctx }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        const value = await settings.get('global', 'billing.defaultUndeclaredPolicy', {
          defaultValue: 'deny',
        });
        return { policy: value as BillingDefaultPolicy };
      }),

    setDefaultPolicy: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' }, audit: { action: 'BILLING_DEFAULT_POLICY_SET' } })
      .input(z.object({
        policy: z.enum(['allow', 'deny', 'audit']),
      }))
      .mutation(async ({ ctx, input }) => {
        requirePlatformOrg(ctx.organizationId);
        const settings = requireBillingSettings();
        await settings.set('global', 'billing.defaultUndeclaredPolicy', input.policy);
        await refreshBillingSettings();
        return { success: true };
      }),

    // ── Admin UI API: Procedures & Drift Reports ──

    // ── Stats API (for Plans list page) ──

    getStats: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'BillingSettings' } })
      .query(async ({ ctx }) => {
        // Plan count
        const [planRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(plans);
        const planCount = planRow?.count ?? 0;

        // Active subscription count
        const [subRow] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(planSubscriptions)
          .where(inArray(planSubscriptions.status, ['active', 'trialing']));
        const activeSubscriptionCount = subRow?.count ?? 0;

        // Unconfigured procedure count
        const registry = getPermissionRegistry();
        let totalProcedures = 0;
        let configuredProcedures = 0;
        for (const [path] of registry.entries()) {
          const parsed = parsePluginProcedurePath(path);
          if (!parsed) continue;
          totalProcedures++;
          const { normalizedPluginId, procedureName } = parsed;
          const originalPluginId = resolvePluginId(normalizedPluginId) ?? normalizedPluginId;
          const resolution = resolveBillingSubject(normalizedPluginId, originalPluginId, procedureName);
          if (resolution.subject !== null || resolution.free) {
            configuredProcedures++;
          }
        }

        return {
          planCount,
          activeSubscriptionCount,
          unconfiguredProcedureCount: totalProcedures - configuredProcedures,
          totalProcedureCount: totalProcedures,
        };
      }),

    listPluginProcedures: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' } })
      .query(async ({ ctx }) => {
        requirePlatformOrg(ctx.organizationId);
        const registry = getPermissionRegistry();

        // Group procedures by plugin
        const pluginMap = new Map<string, Array<{
          procedureName: string;
          path: string;
          subject: string | null;
          source: string;
          free: boolean;
          declaredSubject: string | null;
        }>>();

        for (const [path, entry] of registry.entries()) {
          const parsed = parsePluginProcedurePath(path);
          if (!parsed) continue;

          const { normalizedPluginId, procedureName } = parsed;
          const originalPluginId = resolvePluginId(normalizedPluginId) ?? normalizedPluginId;

          const resolution = resolveBillingSubject(normalizedPluginId, originalPluginId, procedureName);
          
          if (!pluginMap.has(normalizedPluginId)) {
            pluginMap.set(normalizedPluginId, []);
          }

          pluginMap.get(normalizedPluginId)!.push({
            procedureName,
            path,
            subject: resolution.subject,
            source: resolution.source,
            free: resolution.free,
            declaredSubject: entry.billingSubject,
          });
        }

        // Build grouped response
        const settings = requireBillingSettings();
        const groups: Array<{
          pluginId: string;
          procedures: typeof pluginMap extends Map<string, infer V> ? V : never;
          declaredSubjects: string[];
          moduleDefault: string | null;
          configuredCount: number;
          totalCount: number;
        }> = [];

        for (const [pluginId, procedures] of pluginMap) {
          procedures.sort((a, b) => a.procedureName.localeCompare(b.procedureName));

          // Collect unique declared subjects (for quick-select groups)
          const declaredSubjects = [...new Set(
            procedures
              .map(p => p.declaredSubject)
              .filter((s): s is string => s !== null)
          )];

          // Get L2 module default
          const moduleDefaultKey = `billing.module.${pluginId}.subject`;
          const moduleDefault = await settings.get('global', moduleDefaultKey, { defaultValue: null }) as string | null;

          // Count configured (has subject or free)
          const configuredCount = procedures.filter(p => p.subject !== null || p.free).length;

          groups.push({
            pluginId,
            procedures,
            declaredSubjects,
            moduleDefault,
            configuredCount,
            totalCount: procedures.length,
          });
        }

        return groups.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
      }),

    getDriftReports: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' } })
      .query(async ({ ctx }) => {
        requirePlatformOrg(ctx.organizationId);
        return getAllDriftReports();
      }),

    clearDriftReport: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'BillingSettings' }, audit: { action: 'BILLING_DRIFT_REPORT_CLEAR' } })
      .input(z.object({ pluginId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        requirePlatformOrg(ctx.organizationId);
        clearDriftReport(input.pluginId);
        return { success: true };
      }),
  }),
});
