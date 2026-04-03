/**
 * Entitlement Service (Facade)
 *
 * Orchestrates the billing entitlement flow:
 * 1. Load Entitlements (check active quota/subscription)
 * 2. Usage Validation (sufficient quota?)
 * 3. Consume Usage (waterfall deduction)
 *
 * RBAC Permission Check is handled at the tRPC middleware layer
 * (protectedProcedure.meta({ permission })) and is not repeated here.
 *
 * This facade delegates to existing services:
 * - BillingRepository: capability lookup, boolean entitlement check
 * - TenantQuotaRepository: active quota bucket queries
 * - UnifiedUsageService: waterfall quota consumption
 */

import { Injectable, Logger } from '@nestjs/common';
import { BillingRepository } from '../repos/billing.repo';
import { TenantQuotaRepository } from '../repos/tenant-quota.repo';
import {
  UnifiedUsageService,
  type UnifiedConsumeResult,
} from './unified-usage.service';
import { EventBus } from '../../events/event-bus';

/**
 * Error thrown when entitlement check fails
 */
export class EntitlementDeniedError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly subject: string,
    public readonly reason: string
  ) {
    super(`Entitlement denied for ${subject} in org ${organizationId}: ${reason}`);
    this.name = 'EntitlementDeniedError';
  }
}

@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly tenantQuotaRepo: TenantQuotaRepository,
    private readonly unifiedUsage: UnifiedUsageService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Check access for a boolean capability.
   *
   * Verifies the tenant has an active subscription whose plan includes
   * the given subject as a boolean capability.
   *
   * For metered capabilities, this checks that at least one active
   * quota bucket exists (without consuming).
   *
   * @throws EntitlementDeniedError if no active entitlement
   */
  async requireAccess(organizationId: string, subject: string): Promise<void> {
    const capability = await this.billingRepo.getCapabilityBySubject(subject);
    if (!capability || capability.status !== 'approved') {
      throw new EntitlementDeniedError(
        organizationId,
        subject,
        'Capability not registered or not approved'
      );
    }

    if (capability.type === 'boolean') {
      const hasEntitlement = await this.billingRepo.hasBooleanEntitlement(
        organizationId,
        subject
      );
      if (!hasEntitlement) {
        throw new EntitlementDeniedError(
          organizationId,
          subject,
          'No active subscription includes this capability'
        );
      }
    } else {
      // Metered: verify at least one active quota bucket exists
      const balance = await this.tenantQuotaRepo.getTotalBalance(
        organizationId,
        subject
      );
      if (balance <= 0) {
        throw new EntitlementDeniedError(
          organizationId,
          subject,
          'No quota available'
        );
      }
    }

    this.logger.debug(
      `Access granted for ${subject} in org ${organizationId}`
    );
  }

  /**
   * Check quota and consume for a metered capability.
   *
   * For boolean capabilities, performs access check only (no consumption).
   * For metered capabilities, delegates to UnifiedUsageService for
   * waterfall deduction (tenant quotas → user quotas → overage).
   *
   * @throws EntitlementDeniedError if capability not found/approved
   * @throws UnifiedQuotaExceededError if insufficient quota
   */
  async requireAndConsume(
    organizationId: string,
    userId: string,
    subject: string,
    amount = 1
  ): Promise<UnifiedConsumeResult> {
    const capability = await this.billingRepo.getCapabilityBySubject(subject);
    if (!capability || capability.status !== 'approved') {
      throw new EntitlementDeniedError(
        organizationId,
        subject,
        'Capability not registered or not approved'
      );
    }

    if (capability.type === 'boolean') {
      // Boolean: access check only, no consumption
      await this.requireAccess(organizationId, subject);
      return { consumed: 0, deductedFrom: [] };
    }

    // Metered: delegate to UnifiedUsageService for waterfall deduction
    const result = await this.unifiedUsage.consume({
      organizationId,
      userId,
      subject,
      amount,
    });

    this.logger.debug(
      `Consumed ${result.consumed} ${subject} for org ${organizationId}, user ${userId}`
    );

    return result;
  }

  async requireAndConsumeProcedure(
    organizationId: string,
    userId: string,
    procedurePath: string,
    amount = 1
  ): Promise<UnifiedConsumeResult> {
    const item = await this.billingRepo.getActiveProcedureEntitlement(
      organizationId,
      procedurePath
    );

    if (!item) {
      throw new EntitlementDeniedError(
        organizationId,
        procedurePath,
        'No active subscription includes this procedure'
      );
    }

    if (item.type === 'boolean') {
      return { consumed: 0, deductedFrom: [] };
    }

    const result = await this.unifiedUsage.consume({
      organizationId,
      userId,
      subject: item.subject,
      amount,
    });

    this.logger.debug(
      `Consumed ${result.consumed} ${item.subject} via procedure ${procedurePath} for org ${organizationId}, user ${userId}`
    );

    return result;
  }

  /**
   * Check if tenant has access to a capability (non-throwing version).
   *
   * @returns true if the tenant has an active entitlement for the subject
   */
  async hasAccess(organizationId: string, subject: string): Promise<boolean> {
    try {
      await this.requireAccess(organizationId, subject);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if tenant has sufficient metered quota (non-throwing version).
   */
  async hasQuota(
    organizationId: string,
    userId: string,
    subject: string,
    amount = 1
  ): Promise<boolean> {
    const capability = await this.billingRepo.getCapabilityBySubject(subject);
    if (!capability || capability.status !== 'approved') return false;

    if (capability.type === 'boolean') {
      return this.hasAccess(organizationId, subject);
    }

    return this.unifiedUsage.hasQuota(organizationId, userId, subject, amount);
  }

  /**
   * Invalidate entitlement state for an organization.
   *
   * Currently the system queries DB directly (no cache), so this is
   * a notification-only operation. When caching is added, this will
   * trigger cache eviction.
   *
   * Called after: subscription activate/cancel/upgrade/downgrade,
   * quota grant/reset/cleanup.
   */
  async invalidateForOrg(organizationId: string): Promise<void> {
    this.logger.debug(
      `Entitlement invalidation triggered for org ${organizationId}`
    );
    this.eventBus.emit('entitlement.invalidated' as any, {
      organizationId,
      invalidatedAt: new Date(),
    });
  }
}
