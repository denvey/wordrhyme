import { describe, expect, it } from 'vitest';
import {
    defaultPluginGovernance,
    instanceManagedPluginGovernance,
    shouldDropSchemaOnInstanceUninstall,
    shouldRunInstanceInstallLifecycle,
    shouldRunInstanceMigrationsOnStartup,
} from '../../plugins/governance';

describe('plugin governance', () => {
    it('uses startup-managed migrations for the default Shopify-first path', () => {
        expect(shouldRunInstanceMigrationsOnStartup(defaultPluginGovernance, true)).toBe(true);
        expect(shouldRunInstanceInstallLifecycle(defaultPluginGovernance, true)).toBe(false);
        expect(shouldDropSchemaOnInstanceUninstall(defaultPluginGovernance)).toBe(false);
    });

    it('keeps instance-managed compatibility available when explicitly enabled', () => {
        expect(shouldRunInstanceMigrationsOnStartup(instanceManagedPluginGovernance, true)).toBe(true);
        expect(shouldRunInstanceInstallLifecycle(instanceManagedPluginGovernance, true)).toBe(true);
        expect(shouldDropSchemaOnInstanceUninstall(instanceManagedPluginGovernance)).toBe(true);
    });
});
