import { Controller, Get } from '@nestjs/common';
import { KernelService, KernelState } from '../kernel';

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

    constructor(private readonly kernelService: KernelService) { }

    @Get()
    check(): HealthCheckResponse {
        const kernelStatus = this.kernelService.getStatus();

        return {
            status: kernelStatus.hasError ? 'error' :
                kernelStatus.state === KernelState.RUNNING ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            kernel: {
                state: kernelStatus.state,
                phase: kernelStatus.currentPhase,
                phaseName: kernelStatus.phaseName,
                safeMode: kernelStatus.safeMode,
            },
            services: {
                database: 'connected', // TODO: actual check
                redis: 'connected',    // TODO: actual check
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
}

