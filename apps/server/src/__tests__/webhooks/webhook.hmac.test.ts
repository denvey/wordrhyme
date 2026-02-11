/**
 * Webhook HMAC Unit Tests
 *
 * Tests for HMAC-SHA256 signing and verification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookHMAC, webhookHMAC } from '../../webhooks/webhook.hmac.js';

describe('WebhookHMAC', () => {
  let hmac: WebhookHMAC;

  beforeEach(() => {
    hmac = new WebhookHMAC();
  });

  describe('sign()', () => {
    it('should generate consistent signature for same inputs', () => {
      const secret = 'test-secret-key';
      const timestamp = 1704067200; // 2024-01-01 00:00:00 UTC
      const body = '{"event":"test","data":{}}';

      const sig1 = hmac.sign(secret, timestamp, body);
      const sig2 = hmac.sign(secret, timestamp, body);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex = 64 chars
    });

    it('should generate different signatures for different secrets', () => {
      const timestamp = 1704067200;
      const body = '{"event":"test"}';

      const sig1 = hmac.sign('secret-1', timestamp, body);
      const sig2 = hmac.sign('secret-2', timestamp, body);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different timestamps', () => {
      const secret = 'test-secret';
      const body = '{"event":"test"}';

      const sig1 = hmac.sign(secret, 1704067200, body);
      const sig2 = hmac.sign(secret, 1704067201, body);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const timestamp = 1704067200;

      const sig1 = hmac.sign(secret, timestamp, '{"event":"a"}');
      const sig2 = hmac.sign(secret, timestamp, '{"event":"b"}');

      expect(sig1).not.toBe(sig2);
    });

    it('should handle empty body', () => {
      const sig = hmac.sign('secret', 1704067200, '');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle unicode in body', () => {
      const sig = hmac.sign('secret', 1704067200, '{"message":"你好世界"}');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verify()', () => {
    it('should return true for valid signature', () => {
      const secret = 'test-secret';
      const timestamp = 1704067200;
      const body = '{"event":"test"}';

      const signature = hmac.sign(secret, timestamp, body);
      const isValid = hmac.verify(secret, timestamp, body, signature);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const secret = 'test-secret';
      const timestamp = 1704067200;
      const body = '{"event":"test"}';

      const isValid = hmac.verify(secret, timestamp, body, 'invalid-signature');

      expect(isValid).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const timestamp = 1704067200;
      const body = '{"event":"test"}';

      const signature = hmac.sign('correct-secret', timestamp, body);
      const isValid = hmac.verify('wrong-secret', timestamp, body, signature);

      expect(isValid).toBe(false);
    });

    it('should return false for tampered body', () => {
      const secret = 'test-secret';
      const timestamp = 1704067200;

      const signature = hmac.sign(secret, timestamp, '{"event":"original"}');
      const isValid = hmac.verify(secret, timestamp, '{"event":"tampered"}', signature);

      expect(isValid).toBe(false);
    });

    it('should return false for malformed signature (wrong length)', () => {
      const isValid = hmac.verify('secret', 1704067200, '{}', 'abc123');
      expect(isValid).toBe(false);
    });

    it('should return false for non-hex signature', () => {
      const isValid = hmac.verify('secret', 1704067200, '{}', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
      expect(isValid).toBe(false);
    });
  });

  describe('verifyWithTolerance()', () => {
    let realDateNow: () => number;

    beforeEach(() => {
      realDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = realDateNow;
    });

    it('should accept signature within tolerance window', () => {
      const secret = 'test-secret';
      const body = '{"event":"test"}';
      const now = 1704067500;

      Date.now = vi.fn(() => now * 1000);

      const timestamp = now - 60; // 1 minute ago
      const signature = hmac.sign(secret, timestamp, body);

      const isValid = hmac.verifyWithTolerance(secret, timestamp, body, signature, 300);

      expect(isValid).toBe(true);
    });

    it('should reject signature outside tolerance window', () => {
      const secret = 'test-secret';
      const body = '{"event":"test"}';
      const now = 1704067500;

      Date.now = vi.fn(() => now * 1000);

      const timestamp = now - 600; // 10 minutes ago
      const signature = hmac.sign(secret, timestamp, body);

      const isValid = hmac.verifyWithTolerance(secret, timestamp, body, signature, 300);

      expect(isValid).toBe(false);
    });

    it('should reject future timestamps', () => {
      const secret = 'test-secret';
      const body = '{"event":"test"}';
      const now = 1704067500;

      Date.now = vi.fn(() => now * 1000);

      const timestamp = now + 60; // 1 minute in the future
      const signature = hmac.sign(secret, timestamp, body);

      const isValid = hmac.verifyWithTolerance(secret, timestamp, body, signature, 300);

      expect(isValid).toBe(false);
    });

    it('should use default 5 minute tolerance', () => {
      const secret = 'test-secret';
      const body = '{"event":"test"}';
      const now = 1704067500;

      Date.now = vi.fn(() => now * 1000);

      // 4 minutes ago - should pass
      const timestamp1 = now - 240;
      const sig1 = hmac.sign(secret, timestamp1, body);
      expect(hmac.verifyWithTolerance(secret, timestamp1, body, sig1)).toBe(true);

      // 6 minutes ago - should fail
      const timestamp2 = now - 360;
      const sig2 = hmac.sign(secret, timestamp2, body);
      expect(hmac.verifyWithTolerance(secret, timestamp2, body, sig2)).toBe(false);
    });

    it('should reject invalid signature even within tolerance', () => {
      const now = 1704067500;
      Date.now = vi.fn(() => now * 1000);

      const isValid = hmac.verifyWithTolerance(
        'secret',
        now - 60,
        '{}',
        'invalid-signature',
        300
      );

      expect(isValid).toBe(false);
    });
  });

  describe('generateSecret()', () => {
    it('should generate base64 encoded secret', () => {
      const secret = hmac.generateSecret();

      // Base64 pattern
      expect(secret).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();

      for (let i = 0; i < 100; i++) {
        secrets.add(hmac.generateSecret());
      }

      expect(secrets.size).toBe(100);
    });

    it('should generate correct length for 32 bytes (default)', () => {
      const secret = hmac.generateSecret();
      // 32 bytes = 44 chars in base64 (ceil(32/3)*4 = 44)
      expect(secret.length).toBe(44);
    });

    it('should generate correct length for custom byte size', () => {
      const secret16 = hmac.generateSecret(16);
      const secret64 = hmac.generateSecret(64);

      // 16 bytes = 24 chars, 64 bytes = 88 chars
      expect(secret16.length).toBe(24);
      expect(secret64.length).toBe(88);
    });
  });

  describe('Singleton instance', () => {
    it('should export singleton instance', () => {
      expect(webhookHMAC).toBeInstanceOf(WebhookHMAC);
    });

    it('should work correctly as singleton', () => {
      const secret = 'test';
      const timestamp = 1704067200;
      const body = '{}';

      const sig = webhookHMAC.sign(secret, timestamp, body);
      const isValid = webhookHMAC.verify(secret, timestamp, body, sig);

      expect(isValid).toBe(true);
    });
  });
});
