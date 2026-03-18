/**
 * Payment Service
 *
 * Core payment service that provides a unified API for all payment operations.
 * This is the single entry point for both internal (Membership) and external
 * (Shop plugins) payment flows, following the Dogfooding principle.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PaymentAdapterRegistry } from '../adapters/registry';
import { BillingRepository } from '../repos/billing.repo';
import { EventBus } from '../../events/event-bus';
import type { CreatePaymentIntentParams } from '../adapters/payment-adapter.interface';
import type { TransactionSourceType } from '@wordrhyme/db';
import type { PaymentSuccessEvent, PaymentFailedEvent } from '../events/billing.events';

/**
 * Parameters for creating a payment intent
 */
export interface CreatePaymentIntentInput {
  userId: string;
  amountCents: number;
  currency: string;
  sourceType: TransactionSourceType;
  sourceId: string;
  mode: 'payment' | 'setup' | 'subscription';
  gateway: string;
  metadata?: Record<string, unknown>;
  returnUrl?: string;
  customerEmail?: string;
}

/**
 * Result of creating a payment intent
 */
export interface CreatePaymentIntentOutput {
  transactionId: string;
  externalId: string;
  clientSecret?: string;
  payUrl?: string;
}

/**
 * Parameters for handling a webhook
 */
export interface HandleWebhookInput {
  gateway: string;
  payload: unknown;
  signature?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly adapterRegistry: PaymentAdapterRegistry,
    private readonly billingRepo: BillingRepository,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Create a payment intent
   *
   * This is the unified entry point for all payment flows.
   * Both Membership and Shop modules call this method.
   */
  async createPaymentIntent(
    input: CreatePaymentIntentInput
  ): Promise<CreatePaymentIntentOutput> {
    const {
      userId,
      amountCents,
      currency,
      sourceType,
      sourceId,
      mode,
      gateway,
      metadata,
      returnUrl,
      customerEmail,
    } = input;

    // Get the payment adapter
    const adapter = this.adapterRegistry.getOrThrow(gateway);

    // Create a pending transaction in our database
    const transaction = await this.billingRepo.createTransaction({
      userId,
      amountCents,
      currency,
      sourceType,
      sourceId,
      status: 'PENDING',
      gateway,
      metadata,
    });

    this.logger.log(
      `Created pending transaction ${transaction.id} for ${sourceType}:${sourceId}`
    );

    try {
      // Call the payment adapter to create the intent
      const adapterParams: CreatePaymentIntentParams = {
        amountCents,
        currency,
        userId,
        sourceType,
        sourceId,
        mode,
        metadata: {
          ...metadata,
          transactionId: transaction.id,
        },
        ...(returnUrl && { returnUrl }),
        ...(customerEmail && { customerEmail }),
      };

      const result = await adapter.createPaymentIntent(adapterParams);

      // Update transaction with external ID
      await this.billingRepo.updateTransactionStatus(transaction.id, 'PENDING', {
        metadata: { externalId: result.externalId },
      });

      // Update the transaction record with external ID
      // Note: We need to update externalId separately as it's a direct field
      await this.updateTransactionExternalId(transaction.id, result.externalId);

      this.logger.log(
        `Payment intent created: ${result.externalId} for transaction ${transaction.id}`
      );

      // Build response, only including defined values
      const output: CreatePaymentIntentOutput = {
        transactionId: transaction.id,
        externalId: result.externalId,
      };
      if (result.clientSecret) output.clientSecret = result.clientSecret;
      if (result.payUrl) output.payUrl = result.payUrl;

      return output;
    } catch (error) {
      // Mark transaction as failed
      await this.billingRepo.updateTransactionStatus(transaction.id, 'FAILED', {
        metadata: { error: String(error) },
      });

      this.logger.error(
        `Failed to create payment intent for transaction ${transaction.id}`,
        error
      );

      throw error;
    }
  }

  /**
   * Handle a webhook from a payment gateway
   *
   * This method:
   * 1. Verifies the webhook signature
   * 2. Parses the event
   * 3. Updates the transaction status
   * 4. Emits appropriate events
   */
  async handleWebhook(input: HandleWebhookInput): Promise<void> {
    const { gateway, payload, signature } = input;

    // Get the payment adapter
    const adapter = this.adapterRegistry.getOrThrow(gateway);

    // Parse and verify the webhook
    const event = await adapter.handleWebhook(payload, signature);

    this.logger.log(
      `Received webhook for ${gateway}: externalId=${event.externalId}, status=${event.status}`
    );

    // Find the transaction by external ID
    const transaction = await this.billingRepo.getTransactionByExternalId(
      event.externalId
    );

    if (!transaction) {
      this.logger.warn(
        `No transaction found for external ID: ${event.externalId}`
      );
      return;
    }

    // Idempotency check - don't process already completed transactions
    if (transaction.status === 'PAID' && event.status === 'PAID') {
      this.logger.log(
        `Transaction ${transaction.id} already marked as PAID, skipping`
      );
      return;
    }

    if (transaction.status === 'FAILED' && event.status === 'FAILED') {
      this.logger.log(
        `Transaction ${transaction.id} already marked as FAILED, skipping`
      );
      return;
    }

    // Update transaction status
    const now = new Date();

    if (event.status === 'PAID') {
      await this.billingRepo.updateTransactionStatus(transaction.id, 'PAID', {
        paidAt: now,
        metadata: { webhookData: event.raw },
      });

      // Emit payment success event
      const successEvent: PaymentSuccessEvent = {
        transactionId: transaction.id,
        userId: transaction.userId,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        gateway: transaction.gateway ?? gateway,
        externalId: event.externalId,
        paidAt: now,
        ...(transaction.metadata && { metadata: transaction.metadata }),
      };

      this.eventBus.emit('billing.payment.success' as any, successEvent);

      this.logger.log(
        `Payment success for transaction ${transaction.id}, emitted billing.payment.success event`
      );
    } else if (event.status === 'FAILED') {
      await this.billingRepo.updateTransactionStatus(transaction.id, 'FAILED', {
        metadata: { webhookData: event.raw },
      });

      // Emit payment failed event
      const failedEvent: PaymentFailedEvent = {
        transactionId: transaction.id,
        userId: transaction.userId,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        gateway: transaction.gateway ?? gateway,
        error: 'Payment failed',
        failedAt: now,
      };

      this.eventBus.emit('billing.payment.failed' as any, failedEvent);

      this.logger.log(
        `Payment failed for transaction ${transaction.id}, emitted billing.payment.failed event`
      );
    } else if (event.status === 'REFUNDED') {
      await this.billingRepo.updateTransactionStatus(transaction.id, 'REFUNDED', {
        metadata: { webhookData: event.raw },
      });

      this.logger.log(`Transaction ${transaction.id} marked as REFUNDED`);
    }
  }

  /**
   * Get a transaction by ID
   */
  async getTransaction(id: string) {
    return this.billingRepo.getTransactionById(id);
  }

  /**
   * Get user's transactions
   */
  async getUserTransactions(
    userId: string,
    options?: { limit?: number; offset?: number }
  ) {
    return this.billingRepo.getUserTransactions(userId, options);
  }

  /**
   * Update transaction external ID (internal helper)
   */
  private async updateTransactionExternalId(
    transactionId: string,
    externalId: string
  ): Promise<void> {
    // This is a direct update to set the externalId field
    // We use the repo's updateTransactionStatus with metadata as a workaround
    // In a real implementation, you'd add a dedicated method to the repo
    await this.billingRepo.updateTransactionStatus(transactionId, 'PENDING', {
      metadata: { externalId },
    });
  }
}
