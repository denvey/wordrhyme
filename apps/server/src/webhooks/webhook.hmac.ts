/**
 * Webhook HMAC Signing Utility
 *
 * Implements HMAC-SHA256 signing for webhook requests.
 * Signature format: v1={hex_digest}
 */
import crypto from 'crypto';

export class WebhookHMAC {
  /**
   * Sign a webhook payload
   *
   * @param secret - Endpoint secret key
   * @param timestamp - Unix timestamp (seconds)
   * @param body - JSON stringified payload
   * @returns Hex-encoded signature
   */
  sign(secret: string, timestamp: number, body: string): string {
    const message = `${timestamp}.${body}`;
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  /**
   * Verify a webhook signature (for endpoint receivers)
   *
   * @param secret - Endpoint secret key
   * @param timestamp - Unix timestamp from X-Webhook-Timestamp header
   * @param body - Raw request body
   * @param signature - Signature from X-Webhook-Signature header (without "v1=" prefix)
   * @returns True if signature is valid
   */
  verify(
    secret: string,
    timestamp: number,
    body: string,
    signature: string
  ): boolean {
    const expected = this.sign(secret, timestamp, body);

    // Timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      // Buffer length mismatch (invalid signature format)
      return false;
    }
  }

  /**
   * Verify signature with timestamp validation
   *
   * @param secret - Endpoint secret key
   * @param timestamp - Unix timestamp from header
   * @param body - Raw request body
   * @param signature - Signature from header
   * @param toleranceSeconds - Maximum age of timestamp (default: 300s / 5 minutes)
   * @returns True if signature is valid and timestamp is fresh
   */
  verifyWithTolerance(
    secret: string,
    timestamp: number,
    body: string,
    signature: string,
    toleranceSeconds = 300
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;

    // Reject timestamps that are too old or from the future
    if (age < 0 || age > toleranceSeconds) {
      return false;
    }

    return this.verify(secret, timestamp, body, signature);
  }

  /**
   * Generate a random secret key for new endpoints
   *
   * @param length - Byte length of secret (default: 32)
   * @returns Base64-encoded secret
   */
  generateSecret(length = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }
}

/**
 * Singleton instance
 */
export const webhookHMAC = new WebhookHMAC();
