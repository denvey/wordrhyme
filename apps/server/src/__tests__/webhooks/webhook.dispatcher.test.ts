/**
 * Webhook Dispatcher Unit Tests
 *
 * Tests for HTTP dispatch with HMAC signing, timeout, and retry logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookDispatcher, type DispatchResult } from '../../webhooks/webhook.dispatcher.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock webhook HMAC
vi.mock('../../webhooks/webhook.hmac.js', () => ({
  webhookHMAC: {
    sign: vi.fn().mockReturnValue('mock-signature-hex'),
  },
}));

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;

  const mockEndpoint = {
    id: 'endpoint-123',
    organizationId: 'org-456',
    url: 'https://example.com/webhook',
    secret: 'test-secret-key',
    events: ['notification.created'],
    enabled: true,
    retryPolicy: { attempts: 5, backoffMs: 1000 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new WebhookDispatcher();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('dispatch()', () => {
    it('should dispatch successfully with 2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'notification.created',
        { id: 'notif-1', message: 'Hello' },
        'delivery-123'
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.responseCode).toBe(200);
      expect(result.error).toBeNull();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        { data: 'test' },
        'delivery-456'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'WordRhyme-Webhooks/1.0',
            'X-Webhook-Id': 'delivery-456',
            'X-Webhook-Event': 'test.event',
            'X-Webhook-Signature': 'v1=mock-signature-hex',
            'X-Webhook-Tenant': 'org-456',
          }),
        })
      );
    });

    it('should return failed status on 4xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: vi.fn().mockResolvedValue('Endpoint not found'),
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-789'
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.responseCode).toBe(404);
      expect(result.error).toContain('HTTP 404');
      expect(result.error).toContain('Endpoint not found');
    });

    it('should return failed status on 5xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: vi.fn().mockResolvedValue('Server overloaded'),
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-aaa'
      );

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(503);
      expect(result.error).toContain('HTTP 503');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-bbb'
      );

      expect(result.success).toBe(false);
      expect(result.responseCode).toBeNull();
      expect(result.error).toContain('Network error');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-ccc'
      );

      expect(result.success).toBe(false);
      expect(result.responseCode).toBeNull();
      expect(result.error).toContain('timeout');
    });

    it('should truncate long error messages', async () => {
      const longError = 'x'.repeat(1000);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue(longError),
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-ddd'
      );

      expect(result.error!.length).toBeLessThan(600);
    });

    it('should handle error body read failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockRejectedValue(new Error('Stream error')),
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-eee'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should track latency', async () => {
      mockFetch.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true, status: 200, statusText: 'OK' };
      });

      const result = await dispatcher.dispatch(
        mockEndpoint,
        'test.event',
        {},
        'delivery-fff'
      );

      expect(result.latencyMs).toBeGreaterThanOrEqual(45);
    });
  });

  describe('isRetryable()', () => {
    it('should return true for timeout (no response code)', () => {
      const result: DispatchResult = {
        success: false,
        status: 'failed',
        responseCode: null,
        error: 'Request timeout',
        latencyMs: 10000,
      };

      expect(dispatcher.isRetryable(result)).toBe(true);
    });

    it('should return true for network error (no response code)', () => {
      const result: DispatchResult = {
        success: false,
        status: 'failed',
        responseCode: null,
        error: 'Network error: ECONNREFUSED',
        latencyMs: 100,
      };

      expect(dispatcher.isRetryable(result)).toBe(true);
    });

    it('should return true for 429 Too Many Requests', () => {
      const result: DispatchResult = {
        success: false,
        status: 'failed',
        responseCode: 429,
        error: 'HTTP 429 Too Many Requests',
        latencyMs: 100,
      };

      expect(dispatcher.isRetryable(result)).toBe(true);
    });

    it('should return true for 5xx errors', () => {
      const codes = [500, 502, 503, 504, 520];

      for (const code of codes) {
        const result: DispatchResult = {
          success: false,
          status: 'failed',
          responseCode: code,
          error: `HTTP ${code}`,
          latencyMs: 100,
        };

        expect(dispatcher.isRetryable(result)).toBe(true);
      }
    });

    it('should return false for 4xx errors (except 429)', () => {
      const codes = [400, 401, 403, 404, 405, 422];

      for (const code of codes) {
        const result: DispatchResult = {
          success: false,
          status: 'failed',
          responseCode: code,
          error: `HTTP ${code}`,
          latencyMs: 100,
        };

        expect(dispatcher.isRetryable(result)).toBe(false);
      }
    });

    it('should return false for 2xx responses', () => {
      const result: DispatchResult = {
        success: true,
        status: 'success',
        responseCode: 200,
        error: null,
        latencyMs: 100,
      };

      expect(dispatcher.isRetryable(result)).toBe(false);
    });
  });
});
