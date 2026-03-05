import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PaymentAdapterRegistry } from './adapters/registry';
import { BillingRepository } from './repos/billing.repo';
import { QuotaRepository } from './repos/quota.repo';
import { SubscriptionRepository } from './repos/subscription.repo';
import { TenantQuotaRepository } from './repos/tenant-quota.repo';
import { PaymentService } from './services/payment.service';
import { QuotaService } from './services/quota.service';
import { WalletService } from './services/wallet.service';
import { SubscriptionService } from './services/subscription.service';
import { UnifiedUsageService } from './services/unified-usage.service';
import { RenewalService } from './services/renewal.service';
import { EntitlementService } from './services/entitlement.service';
import { SubscriptionRenewalTask } from './tasks/subscription-renewal.task';
import { StripePaymentAdapter } from './adapters/stripe.adapter';
import { env } from '../config/env';

const CORE_CAPABILITIES = [
  { subject: 'core.teamMembers', type: 'metered' as const, unit: 'member', description: 'Team member seats' },
  { subject: 'core.storage', type: 'metered' as const, unit: 'MB', description: 'Storage quota in megabytes' },
  { subject: 'core.projects', type: 'metered' as const, unit: 'project', description: 'Project count' },
  { subject: 'core.apiCalls', type: 'metered' as const, unit: 'request', description: 'API calls per period' },
  { subject: 'core.media', type: 'metered' as const, unit: 'file', description: 'Media files count' },
];

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
    WalletService,
    SubscriptionService,
    UnifiedUsageService,
    RenewalService,
    EntitlementService,

    // Scheduled Tasks
    SubscriptionRenewalTask,
  ],
  exports: [
    // Export registry for plugins to register adapters
    PaymentAdapterRegistry,

    // Export services for other modules
    PaymentService,
    QuotaService,
    WalletService,
    SubscriptionService,
    UnifiedUsageService,
    RenewalService,
    EntitlementService,

    // Export repositories for advanced use cases
    BillingRepository,
    QuotaRepository,
    SubscriptionRepository,
    TenantQuotaRepository,
  ],
})
export class BillingModule implements OnModuleInit {
  private readonly logger = new Logger(BillingModule.name);

  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly adapterRegistry: PaymentAdapterRegistry,
  ) {}

  async onModuleInit() {
    try {
      await this.billingRepo.seedCoreCapabilities(CORE_CAPABILITIES);
      this.logger.log(`Seeded ${CORE_CAPABILITIES.length} core capabilities`);
    } catch (error) {
      this.logger.warn('Failed to seed core capabilities:', error);
    }

    // Register Stripe adapter if env vars are configured
    if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
      const stripeAdapter = new StripePaymentAdapter({
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      });
      this.adapterRegistry.register(stripeAdapter, { isCore: true });
      this.logger.log('Stripe payment adapter registered');
    }
  }
}
