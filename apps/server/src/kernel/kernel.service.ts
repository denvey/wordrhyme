import { Injectable, Logger } from '@nestjs/common';
import { KernelState, BootstrapPhase, PHASE_NAMES } from './kernel.types';

/**
 * KernelService - Core system state machine
 * 
 * Manages the kernel state transitions as per CORE_BOOTSTRAP_FLOW.md.
 * Provides global readonly access to kernel state for all modules.
 */
@Injectable()
export class KernelService {
    private readonly logger = new Logger(KernelService.name);

    private _state: KernelState = KernelState.BOOTING;
    private _currentPhase: BootstrapPhase = BootstrapPhase.PHASE_1_CONFIG;
    private _safeMode: boolean = false;
    private _bootStartTime: number = Date.now();
    private _lastError: Error | null = null;

    constructor() {
        // Detect safe mode from environment
        this._safeMode = process.env['WORDRHYME_SAFE_MODE'] === 'true';

        if (this._safeMode) {
            this.logger.warn('🔒 SAFE MODE ENABLED - Non-core plugins will be skipped');
        }
    }

    /**
     * Get current kernel state (readonly)
     */
    get state(): KernelState {
        return this._state;
    }

    /**
     * Get current bootstrap phase (readonly)
     */
    get currentPhase(): BootstrapPhase {
        return this._currentPhase;
    }

    /**
     * Check if kernel is in safe mode
     */
    get isSafeMode(): boolean {
        return this._safeMode;
    }

    /**
     * Check if kernel is ready to serve requests
     */
    get isRunning(): boolean {
        return this._state === KernelState.RUNNING;
    }

    /**
     * Check if kernel is currently booting
     */
    get isBooting(): boolean {
        return this._state === KernelState.BOOTING;
    }

    /**
     * Get boot duration in milliseconds
     */
    get bootDuration(): number {
        return Date.now() - this._bootStartTime;
    }

    /**
     * Get last error if any
     */
    get lastError(): Error | null {
        return this._lastError;
    }

    /**
     * Transition to a new bootstrap phase
     */
    setPhase(phase: BootstrapPhase): void {
        const phaseName = PHASE_NAMES[phase];
        this.logger.log(`📍 Phase ${phase}: ${phaseName}`);
        this._currentPhase = phase;
    }

    /**
     * Mark kernel as running (all phases complete)
     */
    markRunning(): void {
        this._state = KernelState.RUNNING;
        this.logger.log(`✅ Kernel is RUNNING (boot time: ${this.bootDuration}ms)`);
    }

    /**
     * Mark kernel as reloading (plugin changes detected)
     */
    markReloading(): void {
        this._state = KernelState.RELOADING;
        this.logger.log('🔄 Kernel is RELOADING');
    }

    /**
     * Mark kernel as having an error
     */
    markError(error: Error): void {
        this._state = KernelState.ERROR;
        this._lastError = error;
        this.logger.error(`❌ Kernel ERROR: ${error.message}`, error.stack);
    }

    /**
     * Resume from reloading state back to running
     */
    resumeFromReload(): void {
        if (this._state === KernelState.RELOADING) {
            this._state = KernelState.RUNNING;
            this.logger.log('✅ Kernel resumed from reload');
        }
    }

    /**
     * Get kernel status for health checks and monitoring
     */
    getStatus(): KernelStatus {
        return {
            state: this._state,
            currentPhase: this._currentPhase,
            phaseName: PHASE_NAMES[this._currentPhase],
            safeMode: this._safeMode,
            bootDuration: this.bootDuration,
            hasError: this._lastError !== null,
            errorMessage: this._lastError?.message,
        };
    }
}

export interface KernelStatus {
    state: KernelState;
    currentPhase: BootstrapPhase;
    phaseName: string;
    safeMode: boolean;
    bootDuration: number;
    hasError: boolean;
    errorMessage?: string | undefined;
}
