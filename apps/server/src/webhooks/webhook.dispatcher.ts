/**
 * Webhook Dispatcher
 *
 * Executes HTTP POST requests to webhook endpoints with HMAC signing.
 */
import { Injectable } from '@nestjs/common';
import { webhookHMAC } from './webhook.hmac.js';
import type { WebhookEndpoint } from '@wordrhyme/db';

export interface DispatchResult {
  success: boolean;
  status: 'success' | 'failed';
  responseCode: number | null;
  error: string | null;
  latencyMs: number;
}

@Injectable()
export class WebhookDispatcher {
  /**
   * Dispatch webhook to endpoint
   *
   * @param endpoint - Webhook endpoint configuration
   * @param eventType - Event type (e.g., "notification.created")
   * @param payload - Event payload
   * @param deliveryId - Delivery record ID
   * @returns Dispatch result with status and response details
   */
  async dispatch(
    endpoint: WebhookEndpoint,
    eventType: string,
    payload: Record<string, unknown>,
    deliveryId: string
  ): Promise<DispatchResult> {
    const startTime = Date.now();

    try {
      // Generate signature
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify(payload);
      const signature = webhookHMAC.sign(endpoint.secret, timestamp, body);

      // Build headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'WordRhyme-Webhooks/1.0',
        'X-Webhook-Id': deliveryId,
        'X-Webhook-Event': eventType,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-Signature': `v1=${signature}`,
        'X-Webhook-Tenant': endpoint.organizationId,
      };

      // Execute HTTP POST with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      // Check response status
      if (response.ok) {
        return {
          success: true,
          status: 'success',
          responseCode: response.status,
          error: null,
          latencyMs,
        };
      }

      // Non-2xx response
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          errorMessage += `: ${errorBody.substring(0, 500)}`; // Limit error message size
        }
      } catch {
        // Ignore error body read failure
      }

      return {
        success: false,
        status: 'failed',
        responseCode: response.status,
        error: errorMessage,
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          status: 'failed',
          responseCode: null,
          error: 'Request timeout (>10s)',
          latencyMs,
        };
      }

      // Handle network errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        status: 'failed',
        responseCode: null,
        error: `Network error: ${errorMessage}`,
        latencyMs,
      };
    }
  }

  /**
   * Determine if error is retryable
   *
   * Retryable: 429, 5xx, timeouts
   * Not retryable: 4xx (except 429)
   */
  isRetryable(result: DispatchResult): boolean {
    // Timeout or network error - retry
    if (!result.responseCode) {
      return true;
    }

    // 429 Too Many Requests - retry
    if (result.responseCode === 429) {
      return true;
    }

    // 5xx Server Error - retry
    if (result.responseCode >= 500) {
      return true;
    }

    // 4xx Client Error (except 429) - don't retry
    if (result.responseCode >= 400 && result.responseCode < 500) {
      return false;
    }

    // 2xx Success - don't retry (but this shouldn't happen in failed state)
    return false;
  }
}
