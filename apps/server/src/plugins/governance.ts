export type PluginInstallationScope = 'platform' | 'tenant' | 'instance';
export type PluginMigrationStrategy = 'startup-managed' | 'install-managed' | 'deploy-managed';
export type PluginUpgradePolicy = 'platform-managed' | 'instance-managed';

export interface PluginGovernanceConfig {
    installationScope: PluginInstallationScope;
    migrationStrategy: PluginMigrationStrategy;
    upgradePolicy: PluginUpgradePolicy;
}

export const defaultPluginGovernance: PluginGovernanceConfig = {
    installationScope: 'platform',
    migrationStrategy: 'startup-managed',
    upgradePolicy: 'platform-managed',
};

export const instanceManagedPluginGovernance: PluginGovernanceConfig = {
    installationScope: 'instance',
    migrationStrategy: 'install-managed',
    upgradePolicy: 'instance-managed',
};

export function shouldRunInstanceMigrationsOnStartup(
    governance: PluginGovernanceConfig,
    isFirstInstall: boolean,
): boolean {
    return governance.migrationStrategy === 'startup-managed'
        || (governance.migrationStrategy === 'install-managed' && isFirstInstall);
}

export function shouldRunInstanceInstallLifecycle(
    governance: PluginGovernanceConfig,
    isFirstInstall: boolean,
): boolean {
    return isFirstInstall
        && governance.installationScope === 'instance'
        && governance.migrationStrategy === 'install-managed';
}

export function shouldDropSchemaOnInstanceUninstall(
    governance: PluginGovernanceConfig,
): boolean {
    return governance.installationScope === 'instance'
        && governance.upgradePolicy === 'instance-managed';
}
