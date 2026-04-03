/**
 * Plugin Dependency Resolver
 *
 * Handles plugin version compatibility, dependency resolution,
 * circular dependency detection, and conflict management.
 */
import { Logger } from '@nestjs/common';
import type { PluginManifest } from '@wordrhyme/plugin';

const logger = new Logger('DependencyResolver');

/**
 * Core version from package.json
 * In production, this would be dynamically loaded
 */
const CORE_VERSION = '0.1.0';

/**
 * Dependency resolution result
 */
export interface DependencyResolutionResult {
    /** Plugins that passed all checks */
    valid: PluginManifest[];
    /** Plugins that failed checks with reasons */
    invalid: Array<{
        manifest: PluginManifest;
        reasons: string[];
    }>;
    /** Dependency graph (pluginId -> dependencies) */
    graph: Map<string, string[]>;
    /** Load order (topologically sorted) */
    loadOrder: string[];
}

/**
 * Parse semver version string
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    const parts = version.split('.');
    if (parts.length < 3) return null;
    const majorStr = parts[0];
    const minorStr = parts[1];
    const patchStr = parts[2];
    if (!majorStr || !minorStr || !patchStr) return null;
    const major = Number.parseInt(majorStr, 10);
    const minor = Number.parseInt(minorStr, 10);
    const patch = Number.parseInt(patchStr, 10);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
    return { major, minor, patch };
}

/**
 * Check if a version satisfies a semver range
 * Simplified implementation: supports ^, ~, >=, >, exact match
 */
export function satisfiesVersion(version: string, range: string): boolean {
    const v = parseVersion(version);
    if (!v) return false;

    // Handle different range formats
    if (range.startsWith('^')) {
        // ^1.2.3 means >=1.2.3 <2.0.0 (for major >= 1) or >=0.2.3 <0.3.0 (for 0.x)
        const r = parseVersion(range.slice(1));
        if (!r) return false;
        if (v.major !== r.major) return false;
        if (r.major === 0) {
            // 0.x versions are more strict
            if (v.minor !== r.minor) return false;
            return v.patch >= r.patch;
        }
        if (v.minor < r.minor) return false;
        if (v.minor === r.minor && v.patch < r.patch) return false;
        return true;
    }

    if (range.startsWith('~')) {
        // ~1.2.3 means >=1.2.3 <1.3.0
        const r = parseVersion(range.slice(1));
        if (!r) return false;
        if (v.major !== r.major || v.minor !== r.minor) return false;
        return v.patch >= r.patch;
    }

    if (range.startsWith('>=')) {
        const r = parseVersion(range.slice(2));
        if (!r) return false;
        if (v.major > r.major) return true;
        if (v.major < r.major) return false;
        if (v.minor > r.minor) return true;
        if (v.minor < r.minor) return false;
        return v.patch >= r.patch;
    }

    if (range.startsWith('>')) {
        const r = parseVersion(range.slice(1));
        if (!r) return false;
        if (v.major > r.major) return true;
        if (v.major < r.major) return false;
        if (v.minor > r.minor) return true;
        if (v.minor < r.minor) return false;
        return v.patch > r.patch;
    }

    // Exact match
    const r = parseVersion(range);
    if (!r) return false;
    return v.major === r.major && v.minor === r.minor && v.patch === r.patch;
}

/**
 * Check if a plugin is compatible with the Core version
 */
export function isCompatibleWithCore(manifest: PluginManifest): boolean {
    const requiredRange = manifest.engines.wordrhyme;
    return satisfiesVersion(CORE_VERSION, requiredRange);
}

/**
 * Detect circular dependencies using DFS
 */
export function detectCircularDependencies(
    pluginId: string,
    manifests: Map<string, PluginManifest>,
    visited: Set<string> = new Set(),
    recursionStack: Set<string> = new Set()
): string[] | null {
    visited.add(pluginId);
    recursionStack.add(pluginId);

    const manifest = manifests.get(pluginId);
    if (!manifest?.dependencies) {
        recursionStack.delete(pluginId);
        return null;
    }

    for (const dep of manifest.dependencies) {
        if (!visited.has(dep)) {
            const cycle = detectCircularDependencies(dep, manifests, visited, recursionStack);
            if (cycle) {
                return [pluginId, ...cycle];
            }
        } else if (recursionStack.has(dep)) {
            return [pluginId, dep];
        }
    }

    recursionStack.delete(pluginId);
    return null;
}

/**
 * Topological sort of plugins based on dependencies
 */
export function topologicalSort(manifests: Map<string, PluginManifest>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    function visit(pluginId: string) {
        if (visited.has(pluginId)) return;
        visited.add(pluginId);

        const manifest = manifests.get(pluginId);
        if (manifest?.dependencies) {
            for (const dep of manifest.dependencies) {
                if (manifests.has(dep)) {
                    visit(dep);
                }
            }
        }
        result.push(pluginId);
    }

    for (const pluginId of manifests.keys()) {
        visit(pluginId);
    }

    return result;
}

/**
 * Resolve plugin dependencies
 *
 * Performs:
 * 1. Core version compatibility check
 * 2. Circular dependency detection
 * 3. Conflict detection
 * 4. Missing dependency detection
 * 5. Topological sort for load order
 */
export function resolveDependencies(manifests: PluginManifest[]): DependencyResolutionResult {
    const manifestMap = new Map<string, PluginManifest>();
    for (const m of manifests) {
        manifestMap.set(m.pluginId, m);
    }

    const valid: PluginManifest[] = [];
    const invalid: Array<{ manifest: PluginManifest; reasons: string[] }> = [];
    const graph = new Map<string, string[]>();

    // Check each plugin
    for (const manifest of manifests) {
        const reasons: string[] = [];

        // 1. Core version compatibility
        if (!isCompatibleWithCore(manifest)) {
            reasons.push(
                `Incompatible with Core v${CORE_VERSION}. ` +
                `Plugin requires: ${manifest.engines.wordrhyme}`
            );
        }

        // 2. Circular dependency detection
        const cycle = detectCircularDependencies(manifest.pluginId, manifestMap);
        if (cycle) {
            reasons.push(`Circular dependency detected: ${cycle.join(' → ')}`);
        }

        // 3. Conflict detection
        if (manifest.conflicts) {
            for (const conflictId of manifest.conflicts) {
                if (manifestMap.has(conflictId)) {
                    reasons.push(`Conflicts with installed plugin: ${conflictId}`);
                }
            }
        }

        // 4. Missing dependency detection
        if (manifest.dependencies) {
            for (const depId of manifest.dependencies) {
                if (!manifestMap.has(depId)) {
                    reasons.push(`Missing dependency: ${depId}`);
                }
            }
            graph.set(manifest.pluginId, manifest.dependencies);
        } else {
            graph.set(manifest.pluginId, []);
        }

        // Categorize plugin
        if (reasons.length > 0) {
            invalid.push({ manifest, reasons });
            logger.warn(`Plugin ${manifest.pluginId} failed dependency check:`, reasons);
        } else {
            valid.push(manifest);
        }
    }

    // Build load order from valid plugins only
    const validMap = new Map<string, PluginManifest>();
    for (const m of valid) {
        validMap.set(m.pluginId, m);
    }
    const loadOrder = topologicalSort(validMap);

    // Log dependency graph
    if (manifests.length > 0) {
        logger.log('📊 Plugin Dependency Graph:');
        for (const [plugin, deps] of graph) {
            const isValid = validMap.has(plugin);
            const status = isValid ? '✅' : '❌';
            const depStr = deps.length > 0 ? ` → [${deps.join(', ')}]` : '';
            logger.log(`  ${status} ${plugin}${depStr}`);
        }
        logger.log(`📋 Load Order: ${loadOrder.join(' → ')}`);
    }

    return { valid, invalid, graph, loadOrder };
}

/**
 * Get the Core version
 */
export function getCoreVersion(): string {
    return CORE_VERSION;
}
