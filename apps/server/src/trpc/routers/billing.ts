/**
 * Billing tRPC Router
 *
 * Provides API endpoints for billing operations:
 * - Plans management
 * - User quotas and usage
 * - Wallet operations
 */

import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { TRPCError } from '@trpc/server';

// ============================================================================
// Authorization Helpers
// ============================================================================

/**
 * Check if user can access another user's billing data
 * Users can only access their own data unless they have admin role
 */
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

/**
 * Check if user has admin privileges for billing operations
 */
function assertIsAdmin(ctx: { userRole?: string | undefined }): void {
  const isAdmin = ctx.userRole === 'admin' || ctx.userRole === 'owner';

  if (!isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin privileges required for this operation',
    });
  }
}

// ============================================================================
// Input Schemas
// ============================================================================

const createPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  interval: z.enum(['month', 'year', 'one_time']),
  intervalCount: z.number().int().positive().default(1),
  currency: z.string().length(3).default('usd'),
  priceCents: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createPlanItemSchema = z.object({
  planId: z.string(),
  featureKey: z.string().min(1),
  type: z.enum(['boolean', 'metered']),
  amount: z.number().int().positive().optional(),
  resetMode: z.enum(['period', 'never']),
  priority: z.number().int().default(0),
  overagePriceCents: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const grantQuotaSchema = z.object({
  userId: z.string(),
  featureKey: z.string(),
  amount: z.number().int().positive(),
  priority: z.number().int().default(0),
  expiresAt: z.string().datetime().optional(),
  sourceType: z.enum(['membership', 'shop_order', 'plugin', 'admin_grant']),
  sourceId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const consumeQuotaSchema = z.object({
  userId: z.string(),
  featureKey: z.string(),
  amount: z.number().int().positive(),
  allowOverage: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

const createSubscriptionSchema = z.object({
  organizationId: z.string(),
  planId: z.string(),
  gateway: z.string().default('stripe'),
  trialDays: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
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
  featureKey: z.string(),
  amount: z.number().int().positive(),
  priority: z.number().int().default(100),
  expiresAt: z.string().datetime().optional(),
  sourceType: z.enum(['membership', 'shop_order', 'plugin', 'admin_grant']),
  sourceId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const unifiedConsumeSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  featureKey: z.string(),
  amount: z.number().int().positive(),
  allowOverage: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Router Definition
// ============================================================================

export const billingRouter = router({
  // --------------------------------------------------------------------------
  // Plans
  // --------------------------------------------------------------------------

  /**
   * List all plans
   */
  listPlans: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      if (input?.includeInactive) {
        return billingRepo.getAllPlans();
      }
      return billingRepo.getActivePlans();
    }),

  /**
   * Get a plan by ID with its items
   */
  getPlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      const result = await billingRepo.getPlanWithItems(input.id);
      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Plan ${input.id} not found`,
        });
      }
      return result;
    }),

  /**
   * Create a new plan
   */
  createPlan: protectedProcedure
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      return billingRepo.createPlan({
        ...input,
        isActive: input.isActive ? 1 : 0,
      });
    }),

  /**
   * Update a plan
   */
  updatePlan: protectedProcedure
    .input(z.object({ id: z.string(), data: updatePlanSchema }))
    .mutation(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      // Build update object, only including defined values
      const updateData: Record<string, unknown> = {};
      if (input.data.name !== undefined) updateData['name'] = input.data.name;
      if (input.data.description !== undefined) updateData['description'] = input.data.description;
      if (input.data.priceCents !== undefined) updateData['priceCents'] = input.data.priceCents;
      if (input.data.isActive !== undefined) updateData['isActive'] = input.data.isActive ? 1 : 0;
      if (input.data.metadata !== undefined) updateData['metadata'] = input.data.metadata;

      const plan = await billingRepo.updatePlan(input.id, updateData);
      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Plan ${input.id} not found`,
        });
      }
      return plan;
    }),

  /**
   * Toggle plan active status
   */
  togglePlanStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      const existing = await billingRepo.getPlanById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Plan ${input.id} not found`,
        });
      }
      return billingRepo.updatePlan(input.id, {
        isActive: existing.isActive === 1 ? 0 : 1,
      });
    }),

  // --------------------------------------------------------------------------
  // Plan Items
  // --------------------------------------------------------------------------

  /**
   * Add an item to a plan
   */
  addPlanItem: protectedProcedure
    .input(createPlanItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      // Verify plan exists
      const plan = await billingRepo.getPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Plan ${input.planId} not found`,
        });
      }
      return billingRepo.createPlanItem(input);
    }),

  /**
   * Remove an item from a plan
   */
  removePlanItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { billingRepo } = ctx;
      const deleted = await billingRepo.deletePlanItem(input.itemId);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Plan item ${input.itemId} not found`,
        });
      }
      return { success: true };
    }),

  // --------------------------------------------------------------------------
  // User Quotas
  // --------------------------------------------------------------------------

  /**
   * Get user's quota overview
   */
  getUserQuotas: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { quotaService } = ctx;
      return quotaService.getAllUserQuotas(input.userId);
    }),

  /**
   * Get user's quota for a specific feature
   */
  getFeatureQuota: protectedProcedure
    .input(z.object({ userId: z.string(), featureKey: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { quotaService } = ctx;
      return quotaService.getFeatureQuota(input.userId, input.featureKey);
    }),

  /**
   * Grant quota to a user (admin action)
   */
  grantQuota: protectedProcedure
    .input(grantQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx); // Only admins can grant quotas
      const { quotaService } = ctx;
      await quotaService.grant({
        userId: input.userId,
        featureKey: input.featureKey,
        amount: input.amount,
        priority: input.priority,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        ...(input.metadata && { metadata: input.metadata }),
      });
      return { success: true };
    }),

  /**
   * Consume quota (usage)
   */
  consumeQuota: protectedProcedure
    .input(consumeQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { usageService } = ctx;
      return usageService.consume({
        userId: input.userId,
        featureKey: input.featureKey,
        amount: input.amount,
        allowOverage: input.allowOverage,
        ...(input.metadata && { metadata: input.metadata }),
      });
    }),

  // --------------------------------------------------------------------------
  // Wallet
  // --------------------------------------------------------------------------

  /**
   * Get user's wallet balance
   */
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

  /**
   * Get user's transaction history
   */
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

  /**
   * Get user's usage history
   */
  getUsageHistory: protectedProcedure
    .input(z.object({
      userId: z.string(),
      featureKey: z.string().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
      limit: z.number().int().positive().max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(async ({ ctx, input }) => {
      assertCanAccessUser(ctx, input.userId);
      const { usageService } = ctx;
      // Build options object with only defined values
      const options: { featureKey?: string; since?: Date; until?: Date; limit?: number; offset?: number } = {
        limit: input.limit,
        offset: input.offset,
      };
      if (input.featureKey) options.featureKey = input.featureKey;
      if (input.since) options.since = new Date(input.since);
      if (input.until) options.until = new Date(input.until);

      return usageService.getUsageHistory(input.userId, options);
    }),

  // --------------------------------------------------------------------------
  // Payment Gateway Info
  // --------------------------------------------------------------------------

  /**
   * List available payment gateways
   */
  listGateways: protectedProcedure
    .query(async ({ ctx }) => {
      const { paymentAdapterRegistry } = ctx;
      return paymentAdapterRegistry.getAllMetadata();
    }),

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  /**
   * Create a new subscription for a tenant
   */
  createSubscription: protectedProcedure
    .input(createSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx);
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

  /**
   * Get subscription by ID
   */
  getSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      const subscription = await subscriptionService.getById(input.subscriptionId);
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${input.subscriptionId} not found`,
        });
      }
      return subscription;
    }),

  /**
   * Get active subscriptions for a tenant
   */
  getTenantSubscriptions: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.getActiveByTenant(input.organizationId);
    }),

  /**
   * Get all subscriptions for a tenant (including inactive)
   */
  getAllTenantSubscriptions: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { subscriptionService } = ctx;
      return subscriptionService.getAllByTenant(input.organizationId);
    }),

  /**
   * Activate a subscription (after payment)
   */
  activateSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx);
      const { subscriptionService } = ctx;
      return subscriptionService.activate(input.subscriptionId);
    }),

  /**
   * Cancel a subscription
   */
  cancelSubscription: protectedProcedure
    .input(cancelSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx);
      const { subscriptionService } = ctx;
      const cancelInput: {
        subscriptionId: string;
        reason?: string;
        immediate?: boolean;
      } = {
        subscriptionId: input.subscriptionId,
        immediate: input.immediate,
      };
      if (input.reason !== undefined) cancelInput.reason = input.reason;
      return subscriptionService.cancel(cancelInput);
    }),

  /**
   * Schedule a plan change (upgrade/downgrade)
   */
  changePlan: protectedProcedure
    .input(changePlanSchema)
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx);
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

  /**
   * Get tenant's quota summary
   */
  getTenantQuotas: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tenantQuotaRepo } = ctx;
      return tenantQuotaRepo.getQuotaSummary(input.organizationId);
    }),

  /**
   * Get combined quota balance (tenant + user)
   */
  getCombinedBalance: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      featureKey: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      return unifiedUsageService.getCombinedBalance(
        input.organizationId,
        input.userId,
        input.featureKey
      );
    }),

  /**
   * Grant quota to a tenant (admin action)
   */
  grantTenantQuota: protectedProcedure
    .input(grantTenantQuotaSchema)
    .mutation(async ({ ctx, input }) => {
      assertIsAdmin(ctx);
      const { tenantQuotaRepo } = ctx;
      return tenantQuotaRepo.upsertBySource({
        organizationId: input.organizationId,
        featureKey: input.featureKey,
        balance: input.amount,
        priority: input.priority,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata,
      });
    }),

  /**
   * Consume quota using unified dual-dimension deduction
   */
  unifiedConsume: protectedProcedure
    .input(unifiedConsumeSchema)
    .mutation(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      const consumeInput: {
        organizationId: string;
        userId: string;
        featureKey: string;
        amount: number;
        allowOverage?: boolean;
        metadata?: Record<string, unknown>;
      } = {
        organizationId: input.organizationId,
        userId: input.userId,
        featureKey: input.featureKey,
        amount: input.amount,
        allowOverage: input.allowOverage,
      };
      if (input.metadata !== undefined) consumeInput.metadata = input.metadata;
      return unifiedUsageService.consume(consumeInput);
    }),

  /**
   * Check if user has sufficient quota
   */
  hasQuota: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      featureKey: z.string(),
      required: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const { unifiedUsageService } = ctx;
      return unifiedUsageService.hasQuota(
        input.organizationId,
        input.userId,
        input.featureKey,
        input.required
      );
    }),
});
