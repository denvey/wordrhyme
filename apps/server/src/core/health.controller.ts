import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CacheManager } from '../cache/cache-manager';
import { KernelService, KernelState } from '../kernel';
import { db } from '../db';

interface HealthCheckResponse {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    uptime: number;
    kernel: {
        state: KernelState;
        phase: number;
        phaseName: string;
        safeMode: boolean;
    };
    services: {
        database: 'connected' | 'disconnected';
        redis: 'connected' | 'disconnected';
    };
}

@Controller('health')
export class HealthController {
    private readonly startTime = Date.now();

    constructor(
        private readonly kernelService: KernelService,
        private readonly cacheManager: CacheManager,
    ) { }

    @Get()
    async check(): Promise<HealthCheckResponse> {
        const kernelStatus = this.kernelService.getStatus();
        const [database, redis] = await Promise.all([
            this.checkDatabase(),
            this.cacheManager.getL2Health(),
        ]);
        const status = kernelStatus.hasError
            ? 'error'
            : kernelStatus.state === KernelState.RUNNING && database === 'connected'
                ? 'ok'
                : 'degraded';

        return {
            status,
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            kernel: {
                state: kernelStatus.state,
                phase: kernelStatus.currentPhase,
                phaseName: kernelStatus.phaseName,
                safeMode: kernelStatus.safeMode,
            },
            services: {
                database,
                redis,
            },
        };
    }

    @Get('ready')
    readiness() {
        return {
            ready: this.kernelService.isRunning,
            state: this.kernelService.state,
        };
    }

    @Get('live')
    liveness() {
        return {
            live: this.kernelService.state !== KernelState.ERROR,
        };
    }

    private async checkDatabase(): Promise<'connected' | 'disconnected'> {
        try {
            await db.execute(sql`select 1`);
            return 'connected';
        } catch {
            return 'disconnected';
        }
    }
}
