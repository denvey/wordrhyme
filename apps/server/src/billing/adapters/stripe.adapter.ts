/**
 * Stripe Payment Adapter
 *
 * Implements PaymentAdapter interface for Stripe payment gateway.
 *
 * Tasks 6.1–6.5:
 * - 6.1: StripePaymentAdapter implementing PaymentAdapter
 * - 6.2: PaymentIntent / SetupIntent creation based on mode
 * - 6.3: Webhook handler: payment_intent.succeeded
 * - 6.4: Webhook handler: payment_intent.payment_failed
 * - 6.5: Webhook signature verification via constructEvent
 * - 6.6: Idempotency handled by PaymentService.handleWebhook
 */

import Stripe from 'stripe';
import { Logger } from '@nestjs/common';
import type {
  PaymentAdapter,
  CreatePaymentIntentParams,
  CreatePaymentIntentResult,
  WebhookEventResult,
  RefundParams,
  RefundResult,
} from './payment-adapter.interface';

export interface StripeAdapterConfig {
  secretKey: string;
  webhookSecret: string;
  apiVersion?: string;
}

export class StripePaymentAdapter implements PaymentAdapter {
  readonly gateway = 'stripe';
  readonly displayName = 'Stripe';
  readonly supportsSubscription = true;

  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripePaymentAdapter.name);

  constructor(config: StripeAdapterConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: (config.apiVersion as Stripe.LatestApiVersion) ?? '2025-04-30.basil',
    });
    this.webhookSecret = config.webhookSecret;
  }

  // ── 6.2: PaymentIntent / SetupIntent ──

  async createPaymentIntent(
    params: CreatePaymentIntentParams,
  ): Promise<CreatePaymentIntentResult> {
    const metadata: Record<string, string> = {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
    };

    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        metadata[k] = String(v);
      }
    }

    if (params.mode === 'setup') {
      // SetupIntent — for saving payment methods without charging
      const setupIntent = await this.stripe.setupIntents.create({
        metadata,
        usage: 'off_session',
      });

      this.logger.log(`SetupIntent created: ${setupIntent.id}`);

      const setupResult: CreatePaymentIntentResult = {
        externalId: setupIntent.id,
      };
      if (setupIntent.client_secret) setupResult.clientSecret = setupIntent.client_secret;
      return setupResult;
    }

    // PaymentIntent — for one-time or subscription payments
    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      metadata,
      automatic_payment_methods: { enabled: true },
    };

    if (params.customerEmail) {
      intentParams.receipt_email = params.customerEmail;
    }

    const paymentIntent = await this.stripe.paymentIntents.create(intentParams);

    this.logger.log(`PaymentIntent created: ${paymentIntent.id}`);

    const result: CreatePaymentIntentResult = {
      externalId: paymentIntent.id,
    };
    if (paymentIntent.client_secret) result.clientSecret = paymentIntent.client_secret;
    return result;
  }

  // ── 6.3/6.4/6.5: Webhook handling with signature verification ──

  async handleWebhook(
    payload: unknown,
    signature: string | undefined,
  ): Promise<WebhookEventResult> {
    // 6.5: Signature verification
    if (!signature) {
      throw new Error('Missing Stripe webhook signature header');
    }

    let event: Stripe.Event;
    try {
      // payload must be raw body string/Buffer for signature verification
      event = this.stripe.webhooks.constructEvent(
        payload as string | Buffer,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new Error(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    this.logger.log(`Webhook received: ${event.type} (${event.id})`);

    // Route by event type
    switch (event.type) {
      // 6.3: payment_intent.succeeded → PAID
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          externalId: pi.id,
          status: 'PAID',
          amountCents: pi.amount,
          currency: pi.currency,
          raw: event,
        };
      }

      // 6.4: payment_intent.payment_failed → FAILED
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          externalId: pi.id,
          status: 'FAILED',
          amountCents: pi.amount,
          currency: pi.currency,
          raw: event,
        };
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          externalId: pi.id,
          status: 'FAILED',
          amountCents: pi.amount,
          currency: pi.currency,
          raw: event,
        };
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        return {
          externalId: charge.payment_intent as string,
          status: 'REFUNDED',
          amountCents: charge.amount_refunded,
          currency: charge.currency,
          raw: event,
        };
      }

      default:
        // Unhandled event types — return PENDING so PaymentService skips
        this.logger.debug(`Unhandled event type: ${event.type}`);
        return {
          externalId: (event.data.object as { id?: string })?.id ?? event.id,
          status: 'PENDING',
          raw: event,
        };
    }
  }

  // ── Optional: Refund ──

  async refund(params: RefundParams): Promise<RefundResult> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: params.externalId,
    };

    if (params.amountCents) {
      refundParams.amount = params.amountCents;
    }
    if (params.reason) {
      refundParams.reason = params.reason as Stripe.RefundCreateParams.Reason;
    }

    const refund = await this.stripe.refunds.create(refundParams);

    return {
      refundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded'
        : refund.status === 'failed' ? 'failed'
        : 'pending',
      amountCents: refund.amount,
    };
  }

  // ── Optional: Cancel ──

  async cancel(externalId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(externalId);
    this.logger.log(`PaymentIntent cancelled: ${externalId}`);
  }
}
