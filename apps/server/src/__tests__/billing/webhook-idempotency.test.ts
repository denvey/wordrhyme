/**
 * Payment Service – Webhook Idempotency Tests (Task 9.5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../../billing/services/payment.service';

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn-001',
    userId: 'user-1',
    amountCents: 9900,
    currency: 'USD',
    sourceType: 'membership' as const,
    sourceId: 'plan-basic',
    gateway: 'stripe',
    externalId: 'pi_stripe_123',
    status: 'PENDING' as string,
    metadata: null,
    ...overrides,
  };
}

const mockAdapter = {
  name: 'stripe',
  handleWebhook: vi.fn(),
  createPaymentIntent: vi.fn(),
  createSetupIntent: vi.fn(),
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  getPaymentStatus: vi.fn(),
};

const mockAdapterRegistry = {
  getOrThrow: vi.fn().mockReturnValue(mockAdapter),
  register: vi.fn(),
  getAllMetadata: vi.fn(),
};

const mockBillingRepo = {
  getTransactionByExternalId: vi.fn(),
  updateTransactionStatus: vi.fn(),
  createTransaction: vi.fn(),
};

const mockEventBus = {
  emit: vi.fn().mockResolvedValue(undefined),
  emitAsync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  clear: vi.fn(),
  listenerCount: vi.fn(),
};

describe('PaymentService – Webhook Idempotency', () => {
  let service: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new PaymentService(
      mockAdapterRegistry as any,
      mockBillingRepo as any,
      mockEventBus as any,
    );
  });

  it('should skip processing when transaction already PAID and webhook says PAID', async () => {
    const tx = makeTransaction({ status: 'PAID' });
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_stripe_123',
      status: 'PAID',
      raw: {},
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(tx);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'sig_test',
    });

    // Should NOT update transaction status (idempotent skip)
    expect(mockBillingRepo.updateTransactionStatus).not.toHaveBeenCalled();
    // Should NOT emit any events
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should skip processing when transaction already FAILED and webhook says FAILED', async () => {
    const tx = makeTransaction({ status: 'FAILED' });
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_stripe_123',
      status: 'FAILED',
      raw: {},
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(tx);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'sig_test',
    });

    expect(mockBillingRepo.updateTransactionStatus).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should process PAID webhook for PENDING transaction', async () => {
    const tx = makeTransaction({ status: 'PENDING' });
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_stripe_123',
      status: 'PAID',
      raw: { stripe: true },
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(tx);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'sig_test',
    });

    // Should update to PAID
    expect(mockBillingRepo.updateTransactionStatus).toHaveBeenCalledWith(
      'txn-001',
      'PAID',
      expect.objectContaining({ paidAt: expect.any(Date) }),
    );

    // Should emit payment success event
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.payment.success',
      expect.objectContaining({
        transactionId: 'txn-001',
        externalId: 'pi_stripe_123',
      }),
    );
  });

  it('should process FAILED webhook for PENDING transaction', async () => {
    const tx = makeTransaction({ status: 'PENDING' });
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_stripe_123',
      status: 'FAILED',
      raw: {},
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(tx);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'sig_test',
    });

    // Should update to FAILED
    expect(mockBillingRepo.updateTransactionStatus).toHaveBeenCalledWith(
      'txn-001',
      'FAILED',
      expect.objectContaining({ metadata: { webhookData: {} } }),
    );

    // Should emit payment failed event
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.payment.failed',
      expect.objectContaining({
        transactionId: 'txn-001',
      }),
    );
  });

  it('should silently return when no transaction found for external ID', async () => {
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_unknown_999',
      status: 'PAID',
      raw: {},
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(null);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'sig_test',
    });

    expect(mockBillingRepo.updateTransactionStatus).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should handle duplicate PAID webhooks for same transaction (second one skipped)', async () => {
    const webhookEvent = {
      externalId: 'pi_stripe_123',
      status: 'PAID',
      raw: {},
    };
    mockAdapter.handleWebhook.mockResolvedValue(webhookEvent);

    // First webhook: PENDING → PAID
    const txPending = makeTransaction({ status: 'PENDING' });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(txPending);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
    });
    expect(mockBillingRepo.updateTransactionStatus).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledTimes(1);

    // Reset mocks
    vi.clearAllMocks();
    mockAdapterRegistry.getOrThrow.mockReturnValue(mockAdapter);
    mockAdapter.handleWebhook.mockResolvedValue(webhookEvent);

    // Second webhook: already PAID → skip
    const txPaid = makeTransaction({ status: 'PAID' });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(txPaid);

    await service.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
    });
    expect(mockBillingRepo.updateTransactionStatus).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should call adapter.handleWebhook with correct params', async () => {
    const tx = makeTransaction({ status: 'PENDING' });
    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: 'pi_stripe_123',
      status: 'PAID',
      raw: {},
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(tx);

    const payload = Buffer.from('{"type":"payment_intent.succeeded"}');
    const signature = 'whsec_test_sig';

    await service.handleWebhook({
      gateway: 'stripe',
      payload,
      signature,
    });

    expect(mockAdapterRegistry.getOrThrow).toHaveBeenCalledWith('stripe');
    expect(mockAdapter.handleWebhook).toHaveBeenCalledWith(payload, signature);
  });
});
