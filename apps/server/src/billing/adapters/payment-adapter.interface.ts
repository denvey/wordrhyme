/**
 * Payment Adapter Interface
 *
 * Core defines this interface; payment gateways (Stripe, Alipay, etc.)
 * implement it as plugins.
 *
 * This follows the Interface-First principle: Core owns the contract,
 * plugins provide implementations.
 */

/**
 * Parameters for creating a payment intent
 */
export interface CreatePaymentIntentParams {
  /** Amount in smallest currency unit (e.g., cents for USD) */
  amountCents: number;
  /** ISO 4217 currency code (e.g., 'usd', 'cny') */
  currency: string;
  /** User ID initiating the payment */
  userId: string;
  /** Source type for polymorphic tracking */
  sourceType: 'membership' | 'shop_order' | 'plugin' | 'wallet_topup';
  /** Source ID (e.g., plan ID, order ID) */
  sourceId: string;
  /** Payment mode */
  mode: 'payment' | 'setup' | 'subscription';
  /** Optional metadata to attach to the payment */
  metadata?: Record<string, unknown>;
  /** Return URL after payment completion (for redirect-based flows) */
  returnUrl?: string;
  /** Customer email for receipt */
  customerEmail?: string;
}

/**
 * Result of creating a payment intent
 */
export interface CreatePaymentIntentResult {
  /** External ID from the payment gateway */
  externalId: string;
  /** Client secret for frontend SDK (Stripe) */
  clientSecret?: string;
  /** Payment URL for redirect-based flows (Alipay) */
  payUrl?: string;
  /** Additional gateway-specific data */
  raw?: unknown;
}

/**
 * Webhook verification and parsing result
 */
export interface WebhookEventResult {
  /** External payment ID from the gateway */
  externalId: string;
  /** Payment status */
  status: 'PAID' | 'FAILED' | 'REFUNDED' | 'PENDING';
  /** Amount in cents (for verification) */
  amountCents?: number;
  /** Currency code */
  currency?: string;
  /** Raw event data from gateway */
  raw: unknown;
}

/**
 * Refund parameters
 */
export interface RefundParams {
  /** External payment ID to refund */
  externalId: string;
  /** Amount to refund in cents (partial refund if less than original) */
  amountCents?: number;
  /** Reason for refund */
  reason?: string;
}

/**
 * Refund result
 */
export interface RefundResult {
  /** External refund ID from gateway */
  refundId: string;
  /** Refund status */
  status: 'pending' | 'succeeded' | 'failed';
  /** Amount refunded in cents */
  amountCents: number;
}

/**
 * Payment Adapter Interface
 *
 * All payment gateway plugins must implement this interface.
 * The adapter is responsible for:
 * - Creating payment intents
 * - Handling webhooks
 * - Processing refunds (optional)
 */
export interface PaymentAdapter {
  /**
   * Unique identifier for this gateway
   * @example 'stripe', 'alipay', 'paypal'
   */
  readonly gateway: string;

  /**
   * Human-readable name for display
   */
  readonly displayName: string;

  /**
   * Whether this adapter supports subscriptions
   */
  readonly supportsSubscription: boolean;

  /**
   * Create a payment intent with the gateway
   *
   * @param params - Payment parameters
   * @returns Payment intent details for frontend completion
   */
  createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<CreatePaymentIntentResult>;

  /**
   * Verify and parse a webhook event from the gateway
   *
   * @param payload - Raw webhook payload (body)
   * @param signature - Webhook signature header (if applicable)
   * @returns Parsed event with payment status
   * @throws Error if signature verification fails
   */
  handleWebhook(
    payload: unknown,
    signature: string | undefined
  ): Promise<WebhookEventResult>;

  /**
   * Process a refund (optional - not all gateways support this)
   *
   * @param params - Refund parameters
   * @returns Refund result
   */
  refund?(params: RefundParams): Promise<RefundResult>;

  /**
   * Cancel a pending payment intent (optional)
   *
   * @param externalId - External payment ID to cancel
   */
  cancel?(externalId: string): Promise<void>;
}

/**
 * Payment adapter registration metadata
 */
export interface PaymentAdapterMetadata {
  /** Gateway identifier */
  gateway: string;
  /** Display name */
  displayName: string;
  /** Whether it supports subscriptions */
  supportsSubscription: boolean;
  /** Plugin ID that provides this adapter */
  pluginId: string | undefined;
  /** Whether this is a core adapter (not from plugin) */
  isCore: boolean | undefined;
}

/**
 * Symbol for dependency injection
 */
export const PAYMENT_ADAPTER = Symbol('PAYMENT_ADAPTER');
export const PAYMENT_ADAPTER_REGISTRY = Symbol('PAYMENT_ADAPTER_REGISTRY');
