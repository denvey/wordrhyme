/**
 * Kernel Service Tests
 *
 * Contract Compliance Tests:
 * - 9.1.1: System boots following CORE_BOOTSTRAP_FLOW phases
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KernelService } from '../../kernel/kernel.service';
import { KernelState, BootstrapPhase } from '../../kernel/kernel.types';

describe('KernelService (9.1.1)', () => {
    let kernel: KernelService;

    beforeEach(() => {
        // Reset environment
        process.env['WORDRHYME_SAFE_MODE'] = 'false';
        kernel = new KernelService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('should start in BOOTING state', () => {
            expect(kernel.state).toBe(KernelState.BOOTING);
            expect(kernel.isBooting).toBe(true);
            expect(kernel.isRunning).toBe(false);
        });

        it('should start phase 1 by default', () => {
            expect(kernel.currentPhase).toBe(BootstrapPhase.PHASE_1_CONFIG);
        });

        it('should detect SAFE MODE from environment', () => {
            process.env['WORDRHYME_SAFE_MODE'] = 'true';
            const safeKernel = new KernelService();
            expect(safeKernel.isSafeMode).toBe(true);
        });
    });

    describe('state transitions', () => {
        it('should transition through phases correctly', () => {
            kernel.setPhase(BootstrapPhase.PHASE_2_CONTEXT);
            expect(kernel.currentPhase).toBe(BootstrapPhase.PHASE_2_CONTEXT);

            kernel.setPhase(BootstrapPhase.PHASE_3_MANIFEST_SCAN);
            expect(kernel.currentPhase).toBe(BootstrapPhase.PHASE_3_MANIFEST_SCAN);
        });

        it('should transition to RUNNING state', () => {
            kernel.markRunning();
            expect(kernel.state).toBe(KernelState.RUNNING);
            expect(kernel.isBooting).toBe(false);
            expect(kernel.isRunning).toBe(true);
        });

        it('should handle RELOADING state', () => {
            kernel.markRunning();
            kernel.markReloading();

            expect(kernel.state).toBe(KernelState.RELOADING);

            kernel.resumeFromReload();
            expect(kernel.state).toBe(KernelState.RUNNING);
        });
    });

    describe('error handling', () => {
        it('should transition to ERROR state on failure', () => {
            const error = new Error('Critical failure');
            kernel.markError(error);

            expect(kernel.state).toBe(KernelState.ERROR);
            expect(kernel.lastError).toBe(error);
            expect(kernel.getStatus().hasError).toBe(true);
            expect(kernel.getStatus().errorMessage).toBe('Critical failure');
        });
    });
});
