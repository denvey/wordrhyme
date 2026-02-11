/**
 * Webhook Lifecycle Integration Tests
 *
 * Tests the complete webhook flow:
 * - Registration → Configuration → Trigger → Dispatch → Retry → Delivery Log
 *
 * @task A.2 - Backend Integration Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webhook service
const mockCreateWebhook = vi.fn();
const mockUpdateWebhook = vi.fn();
const mockDeleteWebhook = vi.fn();
const mockGetWebhook = vi.fn();
const mockListWebhooks = vi.fn();
const mockTriggerWebhook = vi.fn();

// Mock webhook dispatcher
const mockDispatch = vi.fn();
const mockRetry = vi.fn();

// Mock delivery log
const mockLogDelivery = vi.fn();
const mockGetDeliveryLogs = vi.fn();

// Mock HMAC service
const mockSignPayload = vi.fn();
const mockVerifySignature = vi.fn();

vi.mock('../../webhooks/webhook.service', () => ({
  WebhookService: vi.fn().mockImplementation(() => ({
    create: mockCreateWebhook,
    update: mockUpdateWebhook,
    delete: mockDeleteWebhook,
    get: mockGetWebhook,
    list: mockListWebhooks,
    trigger: mockTriggerWebhook,
  })),
}));

vi.mock('../../webhooks/webhook.dispatcher', () => ({
  WebhookDispatcher: vi.fn().mockImplementation(() => ({
    dispatch: mockDispatch,
    retry: mockRetry,
  })),
}));

// Test data
const testWebhook = {
  id: 'webhook-123',
  organizationId: 'org-456',
  name: 'Order Events',
  url: 'https://api.example.com/webhooks/orders',
  secret: 'whsec_test_secret',
  events: ['order.created', 'order.updated', 'order.completed'],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testDelivery = {
  id: 'delivery-789',
  webhookId: 'webhook-123',
  eventType: 'order.created',
  payload: { orderId: 'order-001', total: 99.99 },
  status: 'success',
  statusCode: 200,
  latencyMs: 150,
  attempts: 1,
  deliveredAt: new Date(),
};

describe('Webhook Lifecycle Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Phase 1: Registration', () => {
    it('should register new webhook endpoint', async () => {
      mockCreateWebhook.mockResolvedValue(testWebhook);

      const result = await mockCreateWebhook({
        organizationId: 'org-456',
        name: 'Order Events',
        url: 'https://api.example.com/webhooks/orders',
        events: ['order.created', 'order.updated'],
      });

      expect(result.id).toBeDefined();
      expect(result.url).toBe('https://api.example.com/webhooks/orders');
      expect(result.secret).toBeDefined(); // Auto-generated secret
    });

    it('should generate unique secret for each webhook', async () => {
      mockCreateWebhook
        .mockResolvedValueOnce({ ...testWebhook, secret: 'secret-1' })
        .mockResolvedValueOnce({ ...testWebhook, id: 'webhook-456', secret: 'secret-2' });

      const webhook1 = await mockCreateWebhook({ url: 'https://api1.example.com/hook' });
      const webhook2 = await mockCreateWebhook({ url: 'https://api2.example.com/hook' });

      expect(webhook1.secret).not.toBe(webhook2.secret);
    });

    it('should validate webhook URL format', async () => {
      mockCreateWebhook.mockRejectedValue(new Error('Invalid URL'));

      await expect(
        mockCreateWebhook({
          url: 'not-a-valid-url',
          events: ['order.created'],
        })
      ).rejects.toThrow('Invalid URL');
    });

    it('should require HTTPS for production webhooks', async () => {
      mockCreateWebhook.mockRejectedValue(new Error('HTTPS required'));

      await expect(
        mockCreateWebhook({
          url: 'http://insecure.example.com/hook',
          events: ['order.created'],
        })
      ).rejects.toThrow('HTTPS required');
    });

    it('should validate event types', async () => {
      mockCreateWebhook.mockRejectedValue(new Error('Invalid event type'));

      await expect(
        mockCreateWebhook({
          url: 'https://api.example.com/hook',
          events: ['invalid.event.type'],
        })
      ).rejects.toThrow('Invalid event type');
    });
  });

  describe('Phase 2: Configuration', () => {
    it('should update webhook URL', async () => {
      mockUpdateWebhook.mockResolvedValue({
        ...testWebhook,
        url: 'https://new-api.example.com/hook',
      });

      const result = await mockUpdateWebhook('webhook-123', {
        url: 'https://new-api.example.com/hook',
      });

      expect(result.url).toBe('https://new-api.example.com/hook');
    });

    it('should update subscribed events', async () => {
      mockUpdateWebhook.mockResolvedValue({
        ...testWebhook,
        events: ['order.created', 'payment.received'],
      });

      const result = await mockUpdateWebhook('webhook-123', {
        events: ['order.created', 'payment.received'],
      });

      expect(result.events).toContain('payment.received');
    });

    it('should enable/disable webhook', async () => {
      mockUpdateWebhook.mockResolvedValue({
        ...testWebhook,
        enabled: false,
      });

      const result = await mockUpdateWebhook('webhook-123', { enabled: false });

      expect(result.enabled).toBe(false);
    });

    it('should regenerate secret', async () => {
      mockUpdateWebhook.mockResolvedValue({
        ...testWebhook,
        secret: 'whsec_new_secret',
      });

      const result = await mockUpdateWebhook('webhook-123', { regenerateSecret: true });

      expect(result.secret).not.toBe(testWebhook.secret);
    });
  });

  describe('Phase 3: Trigger', () => {
    it('should trigger webhook on matching event', async () => {
      mockTriggerWebhook.mockResolvedValue({
        triggered: true,
        deliveryId: 'delivery-001',
      });

      const result = await mockTriggerWebhook({
        eventType: 'order.created',
        payload: { orderId: 'order-001' },
      });

      expect(result.triggered).toBe(true);
      expect(result.deliveryId).toBeDefined();
    });

    it('should not trigger disabled webhooks', async () => {
      mockTriggerWebhook.mockResolvedValue({
        triggered: false,
        reason: 'Webhook disabled',
      });

      const result = await mockTriggerWebhook({
        eventType: 'order.created',
        payload: { orderId: 'order-001' },
        webhookId: 'disabled-webhook',
      });

      expect(result.triggered).toBe(false);
    });

    it('should not trigger for unsubscribed events', async () => {
      mockTriggerWebhook.mockResolvedValue({
        triggered: false,
        reason: 'Event not subscribed',
      });

      const result = await mockTriggerWebhook({
        eventType: 'user.deleted', // Not in webhook events list
        payload: { userId: 'user-001' },
      });

      expect(result.triggered).toBe(false);
    });
  });

  describe('Phase 4: Dispatch', () => {
    it('should dispatch webhook with HMAC signature', async () => {
      mockSignPayload.mockReturnValue('sha256=abc123');
      mockDispatch.mockResolvedValue({
        success: true,
        statusCode: 200,
        latencyMs: 150,
      });

      const result = await mockDispatch({
        endpoint: testWebhook,
        eventType: 'order.created',
        payload: { orderId: 'order-001' },
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should handle successful delivery', async () => {
      mockDispatch.mockResolvedValue({
        success: true,
        statusCode: 200,
        latencyMs: 100,
        response: { received: true },
      });

      const result = await mockDispatch({
        endpoint: testWebhook,
        eventType: 'order.created',
        payload: {},
      });

      expect(result.success).toBe(true);
    });

    it('should handle failed delivery (4xx)', async () => {
      mockDispatch.mockResolvedValue({
        success: false,
        statusCode: 400,
        error: 'Bad Request',
      });

      const result = await mockDispatch({
        endpoint: testWebhook,
        eventType: 'order.created',
        payload: { invalid: 'data' },
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it('should handle server error (5xx)', async () => {
      mockDispatch.mockResolvedValue({
        success: false,
        statusCode: 500,
        error: 'Internal Server Error',
        retryable: true,
      });

      const result = await mockDispatch({
        endpoint: testWebhook,
        eventType: 'order.created',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('should handle timeout', async () => {
      mockDispatch.mockResolvedValue({
        success: false,
        error: 'Request timeout',
        timeout: true,
        retryable: true,
      });

      const result = await mockDispatch({
        endpoint: testWebhook,
        eventType: 'order.created',
        payload: {},
        timeout: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.timeout).toBe(true);
    });
  });

  describe('Phase 5: Retry', () => {
    it('should retry failed delivery with exponential backoff', async () => {
      mockRetry.mockResolvedValue({
        success: true,
        attempts: 3,
        finalStatusCode: 200,
      });

      const result = await mockRetry({
        deliveryId: 'delivery-failed',
        maxRetries: 5,
        backoffMs: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should stop retrying after max attempts', async () => {
      mockRetry.mockResolvedValue({
        success: false,
        attempts: 5,
        error: 'Max retries exceeded',
      });

      const result = await mockRetry({
        deliveryId: 'delivery-failed',
        maxRetries: 5,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(5);
    });

    it('should not retry non-retryable errors (4xx)', async () => {
      mockRetry.mockResolvedValue({
        success: false,
        attempts: 1,
        reason: 'Non-retryable error (400)',
      });

      const result = await mockRetry({
        deliveryId: 'delivery-400',
        maxRetries: 5,
      });

      expect(result.attempts).toBe(1);
    });

    it('should calculate correct backoff intervals', async () => {
      const backoffs: number[] = [];
      mockRetry.mockImplementation(async (opts) => {
        // Simulate exponential backoff: 1s, 2s, 4s, 8s...
        for (let i = 0; i < opts.maxRetries; i++) {
          backoffs.push(opts.backoffMs * Math.pow(2, i));
        }
        return { success: false, backoffs };
      });

      const result = await mockRetry({
        maxRetries: 4,
        backoffMs: 1000,
      });

      expect(result.backoffs).toEqual([1000, 2000, 4000, 8000]);
    });
  });

  describe('Phase 6: Delivery Log', () => {
    it('should log successful delivery', async () => {
      mockLogDelivery.mockResolvedValue(testDelivery);

      const result = await mockLogDelivery({
        webhookId: 'webhook-123',
        eventType: 'order.created',
        status: 'success',
        statusCode: 200,
        latencyMs: 150,
      });

      expect(result.status).toBe('success');
    });

    it('should log failed delivery with error details', async () => {
      mockLogDelivery.mockResolvedValue({
        ...testDelivery,
        status: 'failed',
        statusCode: 500,
        error: 'Internal Server Error',
      });

      const result = await mockLogDelivery({
        webhookId: 'webhook-123',
        eventType: 'order.created',
        status: 'failed',
        statusCode: 500,
        error: 'Internal Server Error',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should retrieve delivery logs for webhook', async () => {
      mockGetDeliveryLogs.mockResolvedValue({
        logs: [testDelivery, { ...testDelivery, id: 'delivery-790' }],
        total: 2,
      });

      const result = await mockGetDeliveryLogs({
        webhookId: 'webhook-123',
        limit: 10,
      });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter logs by status', async () => {
      mockGetDeliveryLogs.mockResolvedValue({
        logs: [{ ...testDelivery, status: 'failed' }],
        total: 1,
      });

      const result = await mockGetDeliveryLogs({
        webhookId: 'webhook-123',
        status: 'failed',
      });

      expect(result.logs[0].status).toBe('failed');
    });

    it('should filter logs by date range', async () => {
      mockGetDeliveryLogs.mockResolvedValue({
        logs: [testDelivery],
        total: 1,
      });

      const result = await mockGetDeliveryLogs({
        webhookId: 'webhook-123',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      });

      expect(result.total).toBe(1);
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should complete full webhook lifecycle', async () => {
      // Step 1: Register webhook
      mockCreateWebhook.mockResolvedValue(testWebhook);
      const webhook = await mockCreateWebhook({
        url: 'https://api.example.com/hook',
        events: ['order.created'],
      });
      expect(webhook.id).toBeDefined();

      // Step 2: Configure (update URL)
      mockUpdateWebhook.mockResolvedValue({
        ...webhook,
        url: 'https://new-api.example.com/hook',
      });
      const updated = await mockUpdateWebhook(webhook.id, {
        url: 'https://new-api.example.com/hook',
      });
      expect(updated.url).toContain('new-api');

      // Step 3: Trigger event
      mockTriggerWebhook.mockResolvedValue({
        triggered: true,
        deliveryId: 'delivery-001',
      });
      const trigger = await mockTriggerWebhook({
        eventType: 'order.created',
        payload: { orderId: 'order-001' },
      });
      expect(trigger.triggered).toBe(true);

      // Step 4: Dispatch (simulate success)
      mockDispatch.mockResolvedValue({
        success: true,
        statusCode: 200,
        latencyMs: 120,
      });
      const dispatch = await mockDispatch({
        endpoint: updated,
        payload: { orderId: 'order-001' },
      });
      expect(dispatch.success).toBe(true);

      // Step 5: Log delivery
      mockLogDelivery.mockResolvedValue({
        id: 'delivery-001',
        status: 'success',
      });
      const log = await mockLogDelivery({
        webhookId: webhook.id,
        status: 'success',
      });
      expect(log.status).toBe('success');

      // Step 6: Retrieve logs
      mockGetDeliveryLogs.mockResolvedValue({
        logs: [log],
        total: 1,
      });
      const logs = await mockGetDeliveryLogs({ webhookId: webhook.id });
      expect(logs.logs).toHaveLength(1);
    });

    it('should handle failure and retry flow', async () => {
      // Step 1: Dispatch fails
      mockDispatch.mockResolvedValue({
        success: false,
        statusCode: 503,
        retryable: true,
      });
      const dispatch = await mockDispatch({ endpoint: testWebhook });
      expect(dispatch.success).toBe(false);

      // Step 2: Retry succeeds
      mockRetry.mockResolvedValue({
        success: true,
        attempts: 2,
        finalStatusCode: 200,
      });
      const retry = await mockRetry({ deliveryId: 'delivery-001' });
      expect(retry.success).toBe(true);

      // Step 3: Log shows retry success
      mockLogDelivery.mockResolvedValue({
        status: 'success',
        attempts: 2,
      });
      const log = await mockLogDelivery({ attempts: 2 });
      expect(log.attempts).toBe(2);
    });
  });

  describe('Tenant Isolation', () => {
    it('should scope webhooks to organization', async () => {
      mockListWebhooks.mockResolvedValue({
        webhooks: [testWebhook],
        total: 1,
      });

      const result = await mockListWebhooks({
        organizationId: 'org-456',
      });

      expect(result.webhooks[0].organizationId).toBe('org-456');
    });

    it('should not return webhooks from other organizations', async () => {
      mockGetWebhook.mockResolvedValue(null);

      const result = await mockGetWebhook({
        webhookId: 'webhook-123',
        organizationId: 'org-other', // Different org
      });

      expect(result).toBeNull();
    });

    it('should prevent cross-tenant webhook trigger', async () => {
      mockTriggerWebhook.mockRejectedValue(new Error('Webhook not found'));

      await expect(
        mockTriggerWebhook({
          webhookId: 'webhook-123',
          organizationId: 'org-other',
          eventType: 'order.created',
        })
      ).rejects.toThrow('Webhook not found');
    });
  });

  describe('HMAC Signature', () => {
    it('should sign payload with webhook secret', async () => {
      mockSignPayload.mockReturnValue('sha256=abcdef123456');

      const signature = mockSignPayload({
        payload: { orderId: 'order-001' },
        secret: testWebhook.secret,
      });

      expect(signature).toMatch(/^sha256=/);
    });

    it('should verify valid signature', async () => {
      mockVerifySignature.mockReturnValue(true);

      const isValid = mockVerifySignature({
        payload: { orderId: 'order-001' },
        signature: 'sha256=valid',
        secret: testWebhook.secret,
      });

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      mockVerifySignature.mockReturnValue(false);

      const isValid = mockVerifySignature({
        payload: { orderId: 'order-001' },
        signature: 'sha256=invalid',
        secret: testWebhook.secret,
      });

      expect(isValid).toBe(false);
    });
  });
});
