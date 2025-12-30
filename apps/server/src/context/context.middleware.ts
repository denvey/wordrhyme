import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { runWithContext, createDefaultContext, type RequestContext } from './async-local-storage';
import { env } from '../config/env.js';

/**
 * Context Middleware
 *
 * Extracts tenant, user, locale from request and stores in AsyncLocalStorage.
 */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
    use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
        const context = this.extractContext(req as unknown as FastifyRequest);

        runWithContext(context, () => {
            next();
        });
    }

    private extractContext(req: FastifyRequest): RequestContext {
        // In development, use stub auth mode
        if (env.NODE_ENV === 'development') {
            return createDefaultContext({
                tenantId: req.headers['x-tenant-id'] as string || 'dev-tenant',
                organizationId: req.headers['x-tenant-id'] as string || 'dev-tenant',
                userId: req.headers['x-user-id'] as string || 'dev-admin',
                userRole: 'admin',
            });
        }

        // Production: Extract from authenticated session
        // TODO: Integrate with better-auth
        return createDefaultContext({
            tenantId: req.headers['x-tenant-id'] as string,
            organizationId: req.headers['x-tenant-id'] as string,
            userId: req.headers['x-user-id'] as string,
        });
    }
}
