export type PluginMigrationOwnerScope = 'instance' | 'organization';

export interface PluginMigrationOwner {
    scope: PluginMigrationOwnerScope;
    ownerId: string;
}

export const DEFAULT_INSTANCE_MIGRATION_OWNER_ID = 'platform';

export function createInstanceMigrationOwner(
    ownerId = DEFAULT_INSTANCE_MIGRATION_OWNER_ID,
): PluginMigrationOwner {
    return {
        scope: 'instance',
        ownerId,
    };
}

export function createOrganizationMigrationOwner(ownerId: string): PluginMigrationOwner {
    return {
        scope: 'organization',
        ownerId,
    };
}

export function getPluginMigrationRecordOwnerId(owner: PluginMigrationOwner): string {
    return owner.ownerId;
}
