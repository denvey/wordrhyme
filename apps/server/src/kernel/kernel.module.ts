import { Global, Module } from '@nestjs/common';
import { KernelService } from './kernel.service';

/**
 * KernelModule - Core system state management
 * 
 * Provides the KernelService globally to all other modules.
 * This is the foundation for the CORE_BOOTSTRAP_FLOW.md phases.
 */
@Global()
@Module({
    providers: [KernelService],
    exports: [KernelService],
})
export class KernelModule { }
