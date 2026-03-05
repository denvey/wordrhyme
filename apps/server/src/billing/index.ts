/**
 * Billing Module Exports
 *
 * Re-exports all public APIs from the billing module.
 */

// Module
export { BillingModule } from './billing.module';

// Adapters
export {
  PaymentAdapter,
  PaymentAdapterMetadata,
  CreatePaymentIntentParams,
  CreatePaymentIntentResult,
  WebhookEventResult,
  RefundParams,
  RefundResult,
  PAYMENT_ADAPTER,
  PAYMENT_ADAPTER_REGISTRY,
} from './adapters/payment-adapter.interface';
export { PaymentAdapterRegistry } from './adapters/registry';

// Services
export {
  PaymentService,
  CreatePaymentIntentInput,
  CreatePaymentIntentOutput,
  HandleWebhookInput,
} from './services/payment.service';
export {
  QuotaService,
  GrantQuotaInput,
  QuotaBucketSummary,
  UserQuotaOverview,
} from './services/quota.service';
/**
 * @deprecated Use {@link UnifiedUsageService} instead.
 */
export {
  UsageService,
  ConsumeQuotaInput,
  ConsumeQuotaResult,
  QuotaExceededError,
  InsufficientFundsError,
} from './services/usage.service';
export { WalletService, WalletInfo } from './services/wallet.service';

// Subscription & Entitlement
export { SubscriptionService } from './services/subscription.service';
export {
  UnifiedUsageService,
  UnifiedQuotaExceededError,
} from './services/unified-usage.service';
export { RenewalService } from './services/renewal.service';
export {
  EntitlementService,
  EntitlementDeniedError,
} from './services/entitlement.service';

// Repositories (for advanced use cases)
export { BillingRepository } from './repos/billing.repo';
export { QuotaRepository } from './repos/quota.repo';

// Events
export {
  PaymentSuccessEvent,
  PaymentFailedEvent,
  TransactionStatusChangedEvent,
  QuotaGrantedEvent,
  QuotaConsumedEvent,
  QuotaExhaustedEvent,
  BillingEventMap,
  BillingEventName,
} from './events/billing.events';
