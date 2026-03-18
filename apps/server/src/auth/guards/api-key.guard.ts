/**
 * ApiKeyGuard
 *
 * NestJS guard that validates Better Auth API keys.
 * Extracts API key from headers and validates via Better Auth plugin.
 *
 * Supports:
 * - Authorization: Bearer <key>
 * - X-API-Key: <key>
 * - Tenant validation via metadata.organizationId
 *
 * @example
 * ```ts
 * @Controller('api/v1')
 * @UseGuards(ApiKeyGuard)
 * export class ApiController {
 *   @Get('data')
 *   getData(@CurrentApiKey() apiKey: ApiKeyContext) {
 *     return { organizationId: apiKey.organizationId };
 *   }
 * }
 * ```
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { auth } from '../auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { GuardedRequest } from './types';

/**
 * API Key context attached to request after validation
 */
export interface ApiKeyContext {
  id: string;
  name?: string;
  userId: string;
  organizationId: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

interface VerifiedApiKey {
  id: string;
  userId: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  permissions?: Record<string, string[]> | null;
}

interface ExtendedRequest extends GuardedRequest {
  apiKeyContext?: ApiKeyContext;
  raw?: {
    headers: Record<string, string | string[] | undefined>;
  };
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ExtendedRequest>();

    try {
      // Extract API key from headers
      const apiKey = this.extractApiKey(request);

      if (!apiKey) {
        throw new UnauthorizedException('API key required');
      }

      // Verify API key via Better Auth
      const result = await auth.api.verifyApiKey({
        body: { key: apiKey },
      });

      if (!result.valid || !result.key) {
        const errorMsg = result.error?.message ?? 'Invalid API key';
        throw new UnauthorizedException(errorMsg);
      }

      const keyData = result.key as unknown as VerifiedApiKey;

      // Extract metadata
      const metadata = (keyData.metadata ?? {}) as Record<string, unknown>;
      const organizationId = metadata['organizationId'] as string | undefined;

      // Validate tenant binding
      if (!organizationId) {
        this.logger.warn(`API key ${keyData.id} missing organizationId in metadata`);
        throw new ForbiddenException('API key not bound to a tenant');
      }

      // Validate tenant matches request header
      const requestTenantId = this.extractTenantId(request);
      if (requestTenantId && requestTenantId !== organizationId) {
        this.logger.warn(
          `API key tenant mismatch: key=${organizationId}, request=${requestTenantId}`
        );
        throw new ForbiddenException('API key tenant mismatch');
      }

      // Extract capabilities from permissions
      const permissions = (keyData.permissions ?? {}) as Record<string, string[]>;
      const capabilities = permissions['capabilities'] ?? [];

      // Build API key context
      const apiKeyContext: ApiKeyContext = {
        id: keyData.id,
        name: keyData.name || undefined,
        userId: keyData.userId,
        organizationId,
        capabilities,
        metadata,
      } as ApiKeyContext;

      // Attach to request
      request.apiKeyContext = apiKeyContext;

      // Also populate user-like context for compatibility
      request.user = {
        id: keyData.userId,
        email: '', // API keys don't have email
        role: 'api-key',
      };

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error('ApiKeyGuard error:', error);
      throw new UnauthorizedException('API key validation failed');
    }
  }

  /**
   * Extract API key from request headers
   * Supports: Authorization: Bearer <key> or X-API-Key: <key>
   */
  private extractApiKey(request: ExtendedRequest): string | null {
    const rawHeaders = request.raw?.headers ?? request.headers;

    // Try Authorization header first
    const authHeader = rawHeaders['authorization'];
    if (authHeader) {
      const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (authValue?.startsWith('Bearer ')) {
        return authValue.slice(7);
      }
    }

    // Try X-API-Key header
    const apiKeyHeader = rawHeaders['x-api-key'];
    if (apiKeyHeader) {
      const value = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      return value ?? null;
    }

    return null;
  }

  /**
   * Extract tenant ID from request header
   */
  private extractTenantId(request: ExtendedRequest): string | null {
    const rawHeaders = request.raw?.headers ?? request.headers;
    const tenantHeader = rawHeaders['x-org-id'];
    if (tenantHeader) {
      const value = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
      return value ?? null;
    }
    return null;
  }
}
