import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string;
    timestamp: string;
    path: string;
    requestId?: string;
}

/**
 * Global Exception Filter
 *
 * Catches all exceptions and returns standardized JSON errors.
 */
@Catch()
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
                message = (resp.message as string) || message;
                error = (resp.error as string) || HttpStatus[status] || error;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        const errorResponse: ErrorResponse = {
            statusCode: status,
            error,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
            requestId: request.headers['x-request-id'] as string | undefined,
        };

        // Log error for debugging
        if (status >= 500) {
            console.error('[GlobalExceptionFilter]', exception);
        }

        response.status(status).send(errorResponse);
    }
}
