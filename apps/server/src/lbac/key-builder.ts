/**
 * Key Builder - Kernel component for building user keys
 *
 * ⚠️ KERNEL BOUNDARY:
 * - This module MUST NOT import plugin logic
 * - Plugins extend via registerProvider()
 * - Default keys: user:{id}, org:{id}
 *
 * @see Frozen Spec: KeyBuilder abstraction
 */
import { TagPrefix } from '@wordrhyme/db';

/**
 * LBAC Context for key building
 */
export interface KeyBuilderContext {
    userId: string;
    organizationId: string;
}

/**
 * Key Provider interface (for plugins to implement)
 */
export interface KeyProvider {
    /**
     * Unique identifier for this provider
     */
    id: string;

    /**
     * Get additional keys for the user
     */
    getKeys(ctx: KeyBuilderContext): Promise<string[]>;
}

/**
 * Key Builder - Builds user keys for LBAC filtering
 *
 * Usage:
 * ```typescript
 * // Kernel default
 * const keys = await keyBuilder.build({ userId: 'u1', organizationId: 'o1' });
 * // ['user:u1', 'org:o1', 'public:all']
 *
 * // After plugin registration
 * keyBuilder.registerProvider({
 *   id: 'teams',
 *   async getKeys(ctx) {
 *     const teams = await getUserTeams(ctx.userId);
 *     return teams.map(t => `team:${t.id}`);
 *   }
 * });
 *
 * const keys = await keyBuilder.build({ userId: 'u1', organizationId: 'o1' });
 * // ['user:u1', 'org:o1', 'team:t1', 'team:t2', 'public:all']
 * ```
 */
export class KeyBuilder {
    private providers: KeyProvider[] = [];

    /**
     * Register a key provider (plugin extension point)
     *
     * ⚠️ Called by plugins during initialization
     */
    registerProvider(provider: KeyProvider): void {
        // Prevent duplicate registration
        if (this.providers.some((p) => p.id === provider.id)) {
            console.warn(`[KeyBuilder] Provider already registered: ${provider.id}`);
            return;
        }
        this.providers.push(provider);
    }

    /**
     * Unregister a key provider
     */
    unregisterProvider(providerId: string): void {
        this.providers = this.providers.filter((p) => p.id !== providerId);
    }

    /**
     * Build user keys for LBAC filtering
     */
    async build(ctx: KeyBuilderContext): Promise<string[]> {
        const keys: string[] = [];

        // 1. Core keys (always present)
        if (ctx.userId) {
            keys.push(`${TagPrefix.USER}:${ctx.userId}`);
        }

        if (ctx.organizationId) {
            keys.push(`${TagPrefix.ORG}:${ctx.organizationId}`);
        }

        // 2. Plugin-provided keys
        for (const provider of this.providers) {
            try {
                const providerKeys = await provider.getKeys(ctx);
                keys.push(...providerKeys);
            } catch (error) {
                console.error(`[KeyBuilder] Provider ${provider.id} failed:`, error);
                // Continue with other providers
            }
        }

        // 3. Public key (everyone can see public content)
        keys.push(`${TagPrefix.PUBLIC}:all`);

        return keys;
    }

    /**
     * Build keys synchronously (for simple cases without async providers)
     */
    buildSync(ctx: KeyBuilderContext): string[] {
        const keys: string[] = [];

        if (ctx.userId) {
            keys.push(`${TagPrefix.USER}:${ctx.userId}`);
        }

        if (ctx.organizationId) {
            keys.push(`${TagPrefix.ORG}:${ctx.organizationId}`);
        }

        keys.push(`${TagPrefix.PUBLIC}:all`);

        return keys;
    }

    /**
     * Get registered provider IDs (for debugging)
     */
    getProviderIds(): string[] {
        return this.providers.map((p) => p.id);
    }
}

// Singleton instance
export const keyBuilder = new KeyBuilder();
