/**
 * Billing Module
 *
 * Core billing module that provides payment, quota, and usage services.
 * This module follows the Interface-First and Dogfooding principles.
 */

import { Module } from '@nestjs/common';
import { PaymentAdapterRegistry } from './adapters/registry';
import { BillingRepository } from './repos/billing.repo';
import { QuotaRepository } from './repos/quota.repo';
import { SubscriptionRepository } from './repos/subscription.repo';
import { TenantQuotaRepository } from './repos/tenant-quota.repo';
import { PaymentService } from './services/payment.service';
import { QuotaService } from './services/quota.service';
import { UsageService } from './services/usage.service';
import { WalletService } from './services/wallet.service';
import { SubscriptionService } from './services/subscription.service';
import { UnifiedUsageService } from './services/unified-usage.service';
import { RenewalService } from './services/renewal.service';
import { SubscriptionRenewalTask } from './tasks/subscription-renewal.task';

@Module({
  providers: [
    // Registry
    PaymentAdapterRegistry,

    // Repositories
    BillingRepository,
    QuotaRepository,
    SubscriptionRepository,
    TenantQuotaRepository,

    // Services
    PaymentService,
    QuotaService,
    UsageService,
    WalletService,
    SubscriptionService,
    UnifiedUsageService,
    RenewalService,

    // Scheduled Tasks
    SubscriptionRenewalTask,
  ],
  exports: [
    // Export registry for plugins to register adapters
    PaymentAdapterRegistry,

    // Export services for other modules
    PaymentService,
    QuotaService,
    UsageService,
    WalletService,
    SubscriptionService,
    UnifiedUsageService,
    RenewalService,

    // Export repositories for advanced use cases
    BillingRepository,
    QuotaRepository,
    SubscriptionRepository,
    TenantQuotaRepository,
  ],
})
export class BillingModule {}
