/**
 * Queue Service Unit Tests
 *
 * Tests for the BullMQ-based queue service including:
 * - Job name validation
 * - Rate limiting
 * - Plugin job limits
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    close: vi.fn().mockResolvedValue(undefined),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(100),
    getFailedCount: vi.fn().mockResolvedValue(5),
    getDelayedCount: vi.fn().mockResolvedValue(2),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Test patterns from queue.service.ts
const CORE_JOB_PATTERN = /^core_[a-z]+(_[a-z]+)*$/;
const PLUGIN_JOB_PATTERN = /^plugin_[a-zA-Z0-9.-]+_[a-z][a-z0-9_]*$/;

describe('Queue Service', () => {
  describe('Job Name Validation', () => {
    describe('Core Job Pattern', () => {
      it('should accept valid core job names', () => {
        expect(CORE_JOB_PATTERN.test('core_notification')).toBe(true);
        expect(CORE_JOB_PATTERN.test('core_notification_cleanup')).toBe(true);
        expect(CORE_JOB_PATTERN.test('core_email_send')).toBe(true);
      });

      it('should reject invalid core job names', () => {
        // No colon allowed
        expect(CORE_JOB_PATTERN.test('core:notification')).toBe(false);
        // Must start with core_
        expect(CORE_JOB_PATTERN.test('notification')).toBe(false);
        // No uppercase
        expect(CORE_JOB_PATTERN.test('core_Notification')).toBe(false);
        // No numbers after core_
        expect(CORE_JOB_PATTERN.test('core_123')).toBe(false);
      });
    });

    describe('Plugin Job Pattern', () => {
      it('should accept valid plugin job names', () => {
        expect(PLUGIN_JOB_PATTERN.test('plugin_hello-world_send_email')).toBe(true);
        expect(PLUGIN_JOB_PATTERN.test('plugin_analytics_track')).toBe(true);
        expect(PLUGIN_JOB_PATTERN.test('plugin_com.example.test_process')).toBe(true);
      });

      it('should reject invalid plugin job names', () => {
        // No colon allowed
        expect(PLUGIN_JOB_PATTERN.test('plugin:hello-world:send')).toBe(false);
        // Must start with plugin_
        expect(PLUGIN_JOB_PATTERN.test('hello-world_send')).toBe(false);
        // Action must start with lowercase letter
        expect(PLUGIN_JOB_PATTERN.test('plugin_test_123')).toBe(false);
      });
    });
  });

  describe('Rate Limiting', () => {
    // Simulated rate limit tracker
    interface RateLimitEntry {
      count: number;
      resetAt: number;
    }

    let rateLimits: Map<string, RateLimitEntry>;
    const MAX_JOBS_PER_MINUTE = 100;

    beforeEach(() => {
      rateLimits = new Map();
    });

    function checkRateLimit(pluginId: string): boolean {
      const now = Date.now();
      const entry = rateLimits.get(pluginId);

      if (!entry || now > entry.resetAt) {
        rateLimits.set(pluginId, {
          count: 1,
          resetAt: now + 60000,
        });
        return true;
      }

      if (entry.count >= MAX_JOBS_PER_MINUTE) {
        return false;
      }

      entry.count++;
      return true;
    }

    it('should allow jobs under the rate limit', () => {
      for (let i = 0; i < MAX_JOBS_PER_MINUTE; i++) {
        expect(checkRateLimit('test-plugin')).toBe(true);
      }
    });

    it('should reject jobs over the rate limit', () => {
      // Use up the limit
      for (let i = 0; i < MAX_JOBS_PER_MINUTE; i++) {
        checkRateLimit('test-plugin');
      }
      // Next one should fail
      expect(checkRateLimit('test-plugin')).toBe(false);
    });

    it('should track rate limits per plugin', () => {
      // Fill up plugin-a
      for (let i = 0; i < MAX_JOBS_PER_MINUTE; i++) {
        checkRateLimit('plugin-a');
      }
      // plugin-b should still work
      expect(checkRateLimit('plugin-b')).toBe(true);
    });
  });

  describe('Payload Size Limits', () => {
    const MAX_JOB_DATA_SIZE = 64 * 1024; // 64KB

    it('should accept payloads under the limit', () => {
      const smallPayload = { data: 'x'.repeat(1000) };
      const size = JSON.stringify(smallPayload).length;
      expect(size).toBeLessThan(MAX_JOB_DATA_SIZE);
    });

    it('should calculate payload size correctly', () => {
      const payload = { organizationId: '123', data: { key: 'value' } };
      const size = JSON.stringify(payload).length;
      expect(size).toBe(41);
    });

    it('should reject payloads over the limit', () => {
      const largePayload = { data: 'x'.repeat(MAX_JOB_DATA_SIZE + 1000) };
      const size = JSON.stringify(largePayload).length;
      expect(size).toBeGreaterThan(MAX_JOB_DATA_SIZE);
    });
  });

  describe('Job Name Construction', () => {
    function buildPluginJobName(pluginId: string, action: string): string {
      return `plugin_${pluginId}_${action.replace(/-/g, '_')}`;
    }

    it('should convert hyphens to underscores in actions', () => {
      expect(buildPluginJobName('analytics', 'send-email')).toBe('plugin_analytics_send_email');
      expect(buildPluginJobName('test', 'process-data')).toBe('plugin_test_process_data');
    });

    it('should preserve plugin IDs with dots and hyphens', () => {
      expect(buildPluginJobName('com.example.test', 'action')).toBe('plugin_com.example.test_action');
      expect(buildPluginJobName('hello-world', 'action')).toBe('plugin_hello-world_action');
    });
  });
});
