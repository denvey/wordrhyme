/**
 * Billing Events
 *
 * Event types for the billing system, integrated with the core EventBus.
 */

import type { TransactionSourceType, TransactionStatus } from '../../db/schema/billing';

// ============================================================================
// Payment Events
// ============================================================================

/**
 * Payment success event payload
 */
export interface PaymentSuccessEvent {
  /** Transaction ID in our system */
  transactionId: string;
  /** User who made the payment */
  userId: string;
  /** Amount in cents */
  amountCents: number;
  /** Currency code */
  currency: string;
  /** Source type (membership, shop_order, plugin) */
  sourceType: TransactionSourceType;
  /** Source ID (plan ID, order ID, etc.) */
  sourceId: string;
  /** Payment gateway used */
  gateway: string;
  /** External payment ID from gateway */
  externalId: string;
  /** Payment metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  paidAt: Date;
}

/**
 * Payment failed event payload
 */
export interface PaymentFailedEvent {
  /** Transaction ID in our system */
  transactionId: string;
  /** User who attempted the payment */
  userId: string;
  /** Amount in cents */
  amountCents: number;
  /** Currency code */
  currency: string;
  /** Source type */
  sourceType: TransactionSourceType;
  /** Source ID */
  sourceId: string;
  /** Payment gateway */
  gateway: string;
  /** Error message */
  error?: string;
  /** Timestamp */
  failedAt: Date;
}

/**
 * Transaction status changed event
 */
export interface TransactionStatusChangedEvent {
  /** Transaction ID */
  transactionId: string;
  /** Previous status */
  previousStatus: TransactionStatus;
  /** New status */
  newStatus: TransactionStatus;
  /** User ID */
  userId: string;
  /** Timestamp */
  changedAt: Date;
}

// ============================================================================
// Quota Events
// ============================================================================

/**
 * Quota granted event payload
 */
export interface QuotaGrantedEvent {
  /** User ID */
  userId: string;
  /** Feature key (e.g., 'ai.tokens') */
  featureKey: string;
  /** Amount granted */
  amount: number;
  /** Priority for deduction */
  priority: number;
  /** Expiration date (null = never) */
  expiresAt: Date | null;
  /** Source type */
  sourceType: 'membership' | 'shop_order' | 'plugin' | 'admin_grant';
  /** Source ID */
  sourceId: string;
  /** Timestamp */
  grantedAt: Date;
}

/**
 * Quota consumed event payload
 */
export interface QuotaConsumedEvent {
  /** User ID */
  userId: string;
  /** Feature key */
  featureKey: string;
  /** Amount consumed */
  amount: number;
  /** Quota buckets that were deducted */
  deductedFrom: Array<{
    quotaId: string;
    amount: number;
  }>;
  /** Overage charged (if any) */
  overageChargedCents?: number;
  /** Timestamp */
  consumedAt: Date;
}

/**
 * Quota exhausted event (user ran out of quota)
 */
export interface QuotaExhaustedEvent {
  /** User ID */
  userId: string;
  /** Feature key */
  featureKey: string;
  /** Remaining amount requested but not fulfilled */
  remainingAmount: number;
  /** Whether overage was attempted */
  overageAttempted: boolean;
  /** Timestamp */
  exhaustedAt: Date;
}

// ============================================================================
// Billing Event Map Extension
// ============================================================================

/**
 * Billing events to be merged with the main EventMap
 */
export interface BillingEventMap {
  'billing.payment.success': PaymentSuccessEvent;
  'billing.payment.failed': PaymentFailedEvent;
  'billing.transaction.status_changed': TransactionStatusChangedEvent;
  'billing.quota.granted': QuotaGrantedEvent;
  'billing.quota.consumed': QuotaConsumedEvent;
  'billing.quota.exhausted': QuotaExhaustedEvent;
}

/**
 * Billing event names
 */
export type BillingEventName = keyof BillingEventMap;
