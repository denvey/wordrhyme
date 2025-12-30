/**
 * Kernel State Enum
 * 
 * Represents the state machine states for the WordRhyme kernel.
 * Per CORE_BOOTSTRAP_FLOW.md, the kernel transitions through these states.
 */
export enum KernelState {
    /** Initial state - kernel is starting up */
    BOOTING = 'booting',
    /** Normal operation state */
    RUNNING = 'running',
    /** Reloading plugins (triggered by Redis signal or API call) */
    RELOADING = 'reloading',
    /** Error state - kernel encountered a fatal error */
    ERROR = 'error',
}

/**
 * Bootstrap phases per CORE_BOOTSTRAP_FLOW.md
 */
export enum BootstrapPhase {
    PHASE_1_CONFIG = 1,
    PHASE_2_CONTEXT = 2,
    PHASE_3_MANIFEST_SCAN = 3,
    PHASE_4_DEPENDENCY_GRAPH = 4,
    PHASE_5_CAPABILITY_INIT = 5,
    PHASE_6_PLUGIN_REGISTRATION = 6,
    PHASE_7_HTTP_START = 7,
}

export const PHASE_NAMES: Record<BootstrapPhase, string> = {
    [BootstrapPhase.PHASE_1_CONFIG]: 'Kernel & Config',
    [BootstrapPhase.PHASE_2_CONTEXT]: 'Context Providers',
    [BootstrapPhase.PHASE_3_MANIFEST_SCAN]: 'Plugin Manifest Scanning',
    [BootstrapPhase.PHASE_4_DEPENDENCY_GRAPH]: 'Plugin Dependency Graph',
    [BootstrapPhase.PHASE_5_CAPABILITY_INIT]: 'Capability Initialization',
    [BootstrapPhase.PHASE_6_PLUGIN_REGISTRATION]: 'Plugin Module Registration',
    [BootstrapPhase.PHASE_7_HTTP_START]: 'HTTP Server Start',
};
