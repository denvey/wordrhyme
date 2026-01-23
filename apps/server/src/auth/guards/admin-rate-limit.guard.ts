/**
 * AdminRateLimitGuard
 *
 * Rate limiting for sensitive admin operations.
 * Uses in-memory storage (for single-node) or can be extended to use Redis.
 *
 * Configured limits per action:
 * - user.ban: 10 per minute
 * - user.impersonate: 5 per 5 minutes
 * - user.delete: 3 per 5 minutes
 * - user.password_reset: 10 per minute
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUDIT_ACTION_KEY } from './audited.decorator';
import { GuardAuditService } from './guard-audit.service';
import type { GuardedRequest, AdminAuditAction } from './types';

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Default rate limits for admin operations
 */
const DEFAULT_LIMITS: Partial<Record<AdminAuditAction, RateLimitConfig>> = {
  'user.ban': { max: 10, windowMs: 60 * 1000 }, // 10 per minute
  'user.unban': { max: 10, windowMs: 60 * 1000 }, // 10 per minute
  'user.impersonate_start': { max: 5, windowMs: 5 * 60 * 1000 }, // 5 per 5 minutes
  'user.delete': { max: 3, windowMs: 5 * 60 * 1000 }, // 3 per 5 minutes
  'user.password_reset': { max: 10, windowMs: 60 * 1000 }, // 10 per minute
  'user.session_revoke_all': { max: 10, windowMs: 60 * 1000 }, // 10 per minute
};

@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdminRateLimitGuard.name);

  /**
   * In-memory rate limit storage
   * Key: `${userId}:${action}`
   * Value: { count, resetAt }
   *
   * Note: For production multi-node deployments, use Redis instead.
   */
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: GuardAuditService,
  ) {
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<AdminAuditAction>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // If no @Audited decorator or no rate limit configured, allow
    if (!action) return true;

    const limit = DEFAULT_LIMITS[action];
    if (!limit) return true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const userId = request.user?.id;

    if (!userId) return true; // Should be caught by auth guard

    const key = `${userId}:${action}`;
    const now = Date.now();

    // Get or create entry
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // Create new entry
      entry = {
        count: 1,
        resetAt: now + limit.windowMs,
      };
      this.store.set(key, entry);
      return true;
    }

    // Increment count
    entry.count++;
    this.store.set(key, entry);

    // Check if over limit
    if (entry.count > limit.max) {
      // Log rate limit violation
      await this.auditService.log({
        action: 'security.rate_limit_exceeded',
        success: false,
        adminId: userId,
        organizationId: request.tenantContext?.organizationId,
        failureReason: `Rate limit exceeded for ${action}`,
        details: {
          attemptedAction: action,
          count: entry.count,
          limit: limit.max,
          windowMs: limit.windowMs,
          retryAfterMs: entry.resetAt - now,
        },
      });

      this.logger.warn(
        `Rate limit exceeded for user ${userId} on action ${action}: ${entry.count}/${limit.max}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Clean up expired entries from the store
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }
}
