/**
 * FieldGuard - Field-level permission control
 *
 * Handles output sanitization by removing restricted fields from results.
 * Works with CASL's field-level permissions for fine-grained access control.
 *
 * Use cases:
 * - Hide sensitive fields (salary, SSN) from non-admin users
 * - Show different fields based on role (owner sees all, viewer sees subset)
 * - Plugin-specific field restrictions
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Field rule function type
 * Returns true if field should be visible
 */
export type FieldRuleFunction = (keys: string[], entity: Record<string, unknown>) => boolean;

/**
 * Field rule configuration
 */
export interface FieldRule {
    /** Field name */
    field: string;
    /** Visibility rule */
    rule: FieldRuleFunction;
}

/**
 * Entity field configuration
 */
export interface EntityFieldConfig {
    /** Entity/table name */
    entity: string;
    /** Field rules */
    rules: FieldRule[];
    /** Default: show all unlisted fields (true) or hide all unlisted fields (false) */
    defaultVisible?: boolean;
}

/**
 * Built-in rule helpers
 */
export const FieldRules = {
    /**
     * Always visible
     */
    always: (): FieldRuleFunction => () => true,

    /**
     * Never visible
     */
    never: (): FieldRuleFunction => () => false,

    /**
     * Visible only to owner
     */
    ownerOnly: (ownerField = 'ownerId'): FieldRuleFunction =>
        (keys, entity) => {
            const ownerId = entity[ownerField] as string;
            return keys.includes(`user:${ownerId}`);
        },

    /**
     * Visible to specific roles
     */
    roles: (...allowedRoles: string[]): FieldRuleFunction =>
        (keys) => allowedRoles.some(role => keys.includes(`role:${role}`)),

    /**
     * Visible to admins only
     */
    adminOnly: (): FieldRuleFunction =>
        (keys) => keys.includes('role:admin') || keys.includes('role:owner'),

    /**
     * Visible to team members
     */
    teamMember: (teamField = 'teamId'): FieldRuleFunction =>
        (keys, entity) => {
            const teamId = entity[teamField] as string;
            return teamId ? keys.includes(`team:${teamId}`) : true;
        },

    /**
     * Visible to space members
     */
    spaceMember: (spaceField = 'spaceId'): FieldRuleFunction =>
        (keys, entity) => {
            const spaceId = entity[spaceField] as string;
            return spaceId ? keys.includes(`space:${spaceId}`) : true;
        },

    /**
     * Combine multiple rules with AND logic
     */
    all: (...rules: FieldRuleFunction[]): FieldRuleFunction =>
        (keys, entity) => rules.every(rule => rule(keys, entity)),

    /**
     * Combine multiple rules with OR logic
     */
    any: (...rules: FieldRuleFunction[]): FieldRuleFunction =>
        (keys, entity) => rules.some(rule => rule(keys, entity)),

    /**
     * Custom condition
     */
    custom: (fn: FieldRuleFunction): FieldRuleFunction => fn,
};

/**
 * FieldGuard Service
 *
 * Registry and executor for field-level permissions
 */
@Injectable()
export class FieldGuard {
    private readonly logger = new Logger(FieldGuard.name);

    /** Entity -> Field -> Rule */
    private registry = new Map<string, Map<string, FieldRuleFunction>>();

    /** Entity -> Default visibility */
    private defaults = new Map<string, boolean>();

    /**
     * Register field rules for an entity
     */
    register(config: EntityFieldConfig): void {
        const entityRules = this.registry.get(config.entity) ?? new Map();

        for (const rule of config.rules) {
            entityRules.set(rule.field, rule.rule);
        }

        this.registry.set(config.entity, entityRules);
        this.defaults.set(config.entity, config.defaultVisible ?? true);

        this.logger.debug(
            `Registered ${config.rules.length} field rules for ${config.entity}`
        );
    }

    /**
     * Unregister all rules for an entity
     */
    unregister(entity: string): void {
        this.registry.delete(entity);
        this.defaults.delete(entity);
    }

    /**
     * Scrub restricted fields from a single entity
     *
     * @param entity - Entity name
     * @param data - Entity data
     * @param keys - User access keys
     * @returns Scrubbed entity data
     */
    scrub<T extends Record<string, unknown>>(
        entity: string,
        data: T,
        keys: string[]
    ): Partial<T> {
        const rules = this.registry.get(entity);

        if (!rules || rules.size === 0) {
            // No rules registered, return as-is
            return data;
        }

        const defaultVisible = this.defaults.get(entity) ?? true;
        const result: Partial<T> = {};

        for (const [field, value] of Object.entries(data)) {
            const rule = rules.get(field);

            if (rule) {
                // Has explicit rule
                if (rule(keys, data)) {
                    result[field as keyof T] = value as T[keyof T];
                }
                // else: field is hidden
            } else {
                // No explicit rule, use default
                if (defaultVisible) {
                    result[field as keyof T] = value as T[keyof T];
                }
            }
        }

        return result;
    }

    /**
     * Scrub restricted fields from an array of entities
     *
     * @param entity - Entity name
     * @param dataArray - Array of entity data
     * @param keys - User access keys
     * @returns Array of scrubbed entity data
     */
    scrubMany<T extends Record<string, unknown>>(
        entity: string,
        dataArray: T[],
        keys: string[]
    ): Partial<T>[] {
        return dataArray.map(data => this.scrub(entity, data, keys));
    }

    /**
     * Check if a specific field is visible
     *
     * @param entity - Entity name
     * @param field - Field name
     * @param keys - User access keys
     * @param data - Entity data (for context-aware rules)
     */
    isFieldVisible(
        entity: string,
        field: string,
        keys: string[],
        data: Record<string, unknown> = {}
    ): boolean {
        const rules = this.registry.get(entity);

        if (!rules) {
            return this.defaults.get(entity) ?? true;
        }

        const rule = rules.get(field);

        if (!rule) {
            return this.defaults.get(entity) ?? true;
        }

        return rule(keys, data);
    }

    /**
     * Get list of visible fields for an entity
     *
     * @param entity - Entity name
     * @param allFields - All possible fields
     * @param keys - User access keys
     * @param data - Sample entity data (for context-aware rules)
     */
    getVisibleFields(
        entity: string,
        allFields: string[],
        keys: string[],
        data: Record<string, unknown> = {}
    ): string[] {
        return allFields.filter(field =>
            this.isFieldVisible(entity, field, keys, data)
        );
    }

    /**
     * Get list of hidden fields for an entity
     */
    getHiddenFields(
        entity: string,
        allFields: string[],
        keys: string[],
        data: Record<string, unknown> = {}
    ): string[] {
        return allFields.filter(field =>
            !this.isFieldVisible(entity, field, keys, data)
        );
    }
}

/**
 * Pre-configured field rules for common entities
 */
export const CommonFieldConfigs: EntityFieldConfig[] = [
    {
        entity: 'User',
        rules: [
            { field: 'email', rule: FieldRules.any(FieldRules.ownerOnly('id'), FieldRules.adminOnly()) },
            { field: 'password', rule: FieldRules.never() },
            { field: 'banReason', rule: FieldRules.adminOnly() },
            { field: 'banExpires', rule: FieldRules.adminOnly() },
        ],
    },
    {
        entity: 'Member',
        rules: [
            { field: 'banReason', rule: FieldRules.adminOnly() },
            { field: 'banExpires', rule: FieldRules.adminOnly() },
        ],
    },
];
