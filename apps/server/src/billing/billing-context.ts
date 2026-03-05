/**
 * Billing Context Factory
 *
 * Creates singleton instances of billing services for use in tRPC context.
 * This bridges the gap between NestJS DI and tRPC's functional context.
 *
 * The services are instantiated lazily on first access to avoid
 * initialization order issues.
 */

import { db } from '../db';
import { EventBus } from '../events/event-bus.js';
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

/**
 * Billing context interface for tRPC
 */
export interface BillingContext {
  billingRepo: BillingRepository;
  quotaRepo: QuotaRepository;
  subscriptionRepo: SubscriptionRepository;
  tenantQuotaRepo: TenantQuotaRepository;
  quotaService: QuotaService;
  walletService: WalletService;
  paymentService: PaymentService;
  subscriptionService: SubscriptionService;
  unifiedUsageService: UnifiedUsageService;
  renewalService: RenewalService;
  paymentAdapterRegistry: PaymentAdapterRegistry;
  entitlementService: EntitlementService;
}

/**
 * Singleton instances (lazily initialized)
 */
let _billingContext: BillingContext | null = null;
let _eventBus: EventBus | null = null;

/**
 * Get or create the shared EventBus instance
 */
function getEventBus(): EventBus {
  if (!_eventBus) {
    _eventBus = new EventBus();
  }
  return _eventBus;
}

/**
 * Get or create the billing context
 *
 * This creates singleton instances of all billing services.
 * The services are wired together with the shared db and eventBus instances.
 */
export function getBillingContext(): BillingContext {
  if (_billingContext) {
    return _billingContext;
  }

  // Create shared dependencies
  const eventBus = getEventBus();

  // Create registry (no dependencies)
  const paymentAdapterRegistry = new PaymentAdapterRegistry();

  // Create repositories (depend on db)
  // Note: We need to create classes without using NestJS DI decorators directly
  // The @Inject decorator won't work here, so we create wrapper instances
  const billingRepo = createBillingRepository(db);
  const quotaRepo = createQuotaRepository(db);
  const subscriptionRepo = createSubscriptionRepository(db);
  const tenantQuotaRepo = createTenantQuotaRepository(db);

  // Create services (depend on repos and eventBus)
  const quotaService = createQuotaService(quotaRepo, eventBus);
  const walletService = createWalletService(db);
  const paymentService = createPaymentService(
    paymentAdapterRegistry,
    billingRepo,
    eventBus
  );

  // Create new subscription-related services
  const subscriptionService = createSubscriptionService(
    db,
    subscriptionRepo,
    tenantQuotaRepo,
    billingRepo,
    paymentService,
    eventBus
  );
  const unifiedUsageService = createUnifiedUsageService(
    db,
    tenantQuotaRepo,
    quotaRepo,
    eventBus
  );
  const renewalService = createRenewalService(
    db,
    subscriptionRepo,
    tenantQuotaRepo,
    billingRepo,
    paymentService,
    eventBus
  );

  // Create entitlement service (depends on billingRepo, tenantQuotaRepo, unifiedUsageService, eventBus)
  const entitlementService = createEntitlementService(
    billingRepo,
    tenantQuotaRepo,
    unifiedUsageService,
    eventBus
  );

  _billingContext = {
    billingRepo,
    quotaRepo,
    subscriptionRepo,
    tenantQuotaRepo,
    quotaService,
    walletService,
    paymentService,
    subscriptionService,
    unifiedUsageService,
    renewalService,
    paymentAdapterRegistry,
    entitlementService,
  };

  return _billingContext;
}

// ============================================================================
// Factory functions to create service instances without NestJS DI
// ============================================================================

/**
 * Create BillingRepository instance
 */
function createBillingRepository(database: typeof db): BillingRepository {
  // Create instance and inject db manually
  const repo = Object.create(BillingRepository.prototype);
  Object.defineProperty(repo, 'db', { value: database, writable: false });
  return repo as BillingRepository;
}

/**
 * Create QuotaRepository instance
 */
function createQuotaRepository(database: typeof db): QuotaRepository {
  const repo = Object.create(QuotaRepository.prototype);
  Object.defineProperty(repo, 'db', { value: database, writable: false });
  return repo as QuotaRepository;
}

/**
 * Create QuotaService instance
 */
function createQuotaService(
  quotaRepo: QuotaRepository,
  eventBus: EventBus
): QuotaService {
  const service = Object.create(QuotaService.prototype);
  Object.defineProperty(service, 'quotaRepo', { value: quotaRepo, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  return service as QuotaService;
}

/**
 * Create WalletService instance
 */
function createWalletService(database: typeof db): WalletService {
  const service = Object.create(WalletService.prototype);
  Object.defineProperty(service, 'db', { value: database, writable: false });
  return service as WalletService;
}

/**
 * Create PaymentService instance
 */
function createPaymentService(
  adapterRegistry: PaymentAdapterRegistry,
  billingRepo: BillingRepository,
  eventBus: EventBus
): PaymentService {
  const service = Object.create(PaymentService.prototype);
  Object.defineProperty(service, 'adapterRegistry', { value: adapterRegistry, writable: false });
  Object.defineProperty(service, 'billingRepo', { value: billingRepo, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  // Initialize logger
  Object.defineProperty(service, 'logger', {
    value: {
      log: (msg: string, ...args: unknown[]) => console.log(`[PaymentService] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[PaymentService] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[PaymentService] ${msg}`, ...args),
    },
    writable: false,
  });
  return service as PaymentService;
}

/**
 * Create SubscriptionRepository instance
 */
function createSubscriptionRepository(database: typeof db): SubscriptionRepository {
  const repo = Object.create(SubscriptionRepository.prototype);
  Object.defineProperty(repo, 'db', { value: database, writable: false });
  return repo as SubscriptionRepository;
}

/**
 * Create TenantQuotaRepository instance
 */
function createTenantQuotaRepository(database: typeof db): TenantQuotaRepository {
  const repo = Object.create(TenantQuotaRepository.prototype);
  Object.defineProperty(repo, 'db', { value: database, writable: false });
  return repo as TenantQuotaRepository;
}

/**
 * Create SubscriptionService instance
 */
function createSubscriptionService(
  database: typeof db,
  subscriptionRepo: SubscriptionRepository,
  tenantQuotaRepo: TenantQuotaRepository,
  billingRepo: BillingRepository,
  paymentService: PaymentService,
  eventBus: EventBus
): SubscriptionService {
  const service = Object.create(SubscriptionService.prototype);
  Object.defineProperty(service, 'db', { value: database, writable: false });
  Object.defineProperty(service, 'subscriptionRepo', { value: subscriptionRepo, writable: false });
  Object.defineProperty(service, 'tenantQuotaRepo', { value: tenantQuotaRepo, writable: false });
  Object.defineProperty(service, 'billingRepo', { value: billingRepo, writable: false });
  Object.defineProperty(service, 'paymentService', { value: paymentService, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  Object.defineProperty(service, 'logger', {
    value: {
      log: (msg: string, ...args: unknown[]) => console.log(`[SubscriptionService] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[SubscriptionService] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[SubscriptionService] ${msg}`, ...args),
      debug: (msg: string, ...args: unknown[]) => console.debug(`[SubscriptionService] ${msg}`, ...args),
    },
    writable: false,
  });
  return service as SubscriptionService;
}

/**
 * Create UnifiedUsageService instance
 */
function createUnifiedUsageService(
  database: typeof db,
  tenantQuotaRepo: TenantQuotaRepository,
  quotaRepo: QuotaRepository,
  eventBus: EventBus
): UnifiedUsageService {
  const service = Object.create(UnifiedUsageService.prototype);
  Object.defineProperty(service, 'db', { value: database, writable: false });
  Object.defineProperty(service, 'tenantQuotaRepo', { value: tenantQuotaRepo, writable: false });
  Object.defineProperty(service, 'quotaRepo', { value: quotaRepo, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  Object.defineProperty(service, 'logger', {
    value: {
      log: (msg: string, ...args: unknown[]) => console.log(`[UnifiedUsageService] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[UnifiedUsageService] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[UnifiedUsageService] ${msg}`, ...args),
      debug: (msg: string, ...args: unknown[]) => console.debug(`[UnifiedUsageService] ${msg}`, ...args),
    },
    writable: false,
  });
  return service as UnifiedUsageService;
}

/**
 * Create RenewalService instance
 */
function createRenewalService(
  database: typeof db,
  subscriptionRepo: SubscriptionRepository,
  tenantQuotaRepo: TenantQuotaRepository,
  billingRepo: BillingRepository,
  paymentService: PaymentService,
  eventBus: EventBus
): RenewalService {
  const service = Object.create(RenewalService.prototype);
  Object.defineProperty(service, '_db', { value: database, writable: false });
  Object.defineProperty(service, 'subscriptionRepo', { value: subscriptionRepo, writable: false });
  Object.defineProperty(service, 'tenantQuotaRepo', { value: tenantQuotaRepo, writable: false });
  Object.defineProperty(service, 'billingRepo', { value: billingRepo, writable: false });
  Object.defineProperty(service, 'paymentService', { value: paymentService, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  Object.defineProperty(service, 'logger', {
    value: {
      log: (msg: string, ...args: unknown[]) => console.log(`[RenewalService] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[RenewalService] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[RenewalService] ${msg}`, ...args),
      debug: (msg: string, ...args: unknown[]) => console.debug(`[RenewalService] ${msg}`, ...args),
    },
    writable: false,
  });
  return service as RenewalService;
}

/**
 * Reset billing context (for testing)
 */
export function resetBillingContext(): void {
  _billingContext = null;
  _eventBus = null;
}

/**
 * Create EntitlementService instance
 */
function createEntitlementService(
  billingRepo: BillingRepository,
  tenantQuotaRepo: TenantQuotaRepository,
  unifiedUsage: UnifiedUsageService,
  eventBus: EventBus,
): EntitlementService {
  const service = Object.create(EntitlementService.prototype);
  Object.defineProperty(service, 'billingRepo', { value: billingRepo, writable: false });
  Object.defineProperty(service, 'tenantQuotaRepo', { value: tenantQuotaRepo, writable: false });
  Object.defineProperty(service, 'unifiedUsage', { value: unifiedUsage, writable: false });
  Object.defineProperty(service, 'eventBus', { value: eventBus, writable: false });
  Object.defineProperty(service, 'logger', {
    value: {
      log: (msg: string, ...args: unknown[]) => console.log(`[EntitlementService] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[EntitlementService] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[EntitlementService] ${msg}`, ...args),
      debug: (msg: string, ...args: unknown[]) => console.debug(`[EntitlementService] ${msg}`, ...args),
    },
    writable: false,
  });
  return service as EntitlementService;
}
