/**
 * Metrics Controller
 *
 * Exposes Prometheus-compatible metrics endpoint.
 */
import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { MetricsServiceImpl } from './metrics.service.js';

/**
 * Simple metrics auth guard
 * In production, this should check METRICS_AUTH_TOKEN
 */
function validateMetricsAuth(authorization?: string): boolean {
    const authToken = process.env['METRICS_AUTH_TOKEN'];

    // No auth required if token not configured
    if (!authToken) {
        return true;
    }

    // Check bearer token
    if (authorization?.startsWith('Bearer ')) {
        return authorization.slice(7) === authToken;
    }

    return false;
}

@Controller()
export class MetricsController {
    constructor(private readonly metricsService: MetricsServiceImpl) { }

    /**
     * Prometheus metrics endpoint
     *
     * GET /metrics
     *
     * Protected by optional METRICS_AUTH_TOKEN
     */
    @Get('metrics')
    async getMetrics(
        @Res() reply: FastifyReply
    ): Promise<void> {
        // Get auth header from request
        const authorization = reply.request.headers.authorization;

        if (!validateMetricsAuth(authorization)) {
            reply.status(401).send({ error: 'Unauthorized' });
            return;
        }

        const metrics = await this.metricsService.getMetrics();
        reply
            .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
            .send(metrics);
    }
}
