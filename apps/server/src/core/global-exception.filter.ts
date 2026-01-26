import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { getContext } from '../context/async-local-storage';
import { ErrorTrackerService } from '../observability/error-tracker.service.js';

interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string;
    timestamp: string;
    path: string;
    requestId: string | undefined;
    traceId: string | undefined;
}

// Singleton error tracker instance
let errorTracker: ErrorTrackerService | null = null;

function getErrorTracker(): ErrorTrackerService {
    if (!errorTracker) {
        errorTracker = new ErrorTrackerService();
    }
    return errorTracker;
}

/**
 * Global Exception Filter
 *
 * Catches all exceptions, logs them via error tracker, and returns standardized JSON errors.
 * Integrates with the observability system for automatic context enrichment.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'Internal Server Error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const resp = exceptionResponse as Record<string, unknown>;
                message = (resp['message'] as string) || message;
                error = (resp['error'] as string) || HttpStatus[status] || error;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        // Get request context for trace info
        let requestId: string | undefined;
        let traceId: string | undefined;
        let organizationId: string | undefined;
        let userId: string | undefined;

        try {
            const requestContext = getContext();
            requestId = requestContext.requestId;
            traceId = requestContext.traceId;
            organizationId = requestContext.organizationId;
            userId = requestContext.userId;
        } catch {
            // Outside of request context, use header fallback
            requestId = request.headers['x-request-id'] as string | undefined;
        }

        const errorResponse: ErrorResponse = {
            statusCode: status,
            error,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
            requestId,
            traceId,
        };

        // Track error via observability system for 5xx errors
        if (status >= 500 && exception instanceof Error) {
            const tracker = getErrorTracker();
            const errorContext: Parameters<typeof tracker.captureException>[1] = {
                tags: {
                    statusCode: String(status),
                    path: request.url,
                },
                extra: {
                    method: request.method,
                    query: request.query,
                    body: request.body,
                },
                level: 'error',
            };

            // Add optional tags
            if (organizationId) errorContext.tags!['organizationId'] = organizationId;
            if (requestId) errorContext.tags!['requestId'] = requestId;
            if (traceId) errorContext.tags!['traceId'] = traceId;
            if (userId) errorContext.user = { id: userId };

            tracker.captureException(exception, errorContext);
        }

        // Log error for debugging (structured log)
        if (status >= 500) {
            console.error(JSON.stringify({
                type: 'error',
                message: 'Unhandled exception',
                error: exception instanceof Error ? exception.message : String(exception),
                stack: exception instanceof Error ? exception.stack : undefined,
                requestId,
                traceId,
                organizationId,
                path: request.url,
                statusCode: status,
            }));
        }

        response.status(status).send(errorResponse);
    }
}
