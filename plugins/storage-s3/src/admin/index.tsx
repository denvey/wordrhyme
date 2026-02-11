/**
 * Storage S3 Plugin - Admin UI Entry
 *
 * Exports extensions for the Admin UI via Module Federation.
 * Provides settings tab for configuring S3 storage instances.
 */
import type { Extension } from './types';
import { SettingsPage } from './components/SettingsPage';

export const extensions: Extension[] = [
    {
        id: 'storage-s3.settings',
        pluginId: 'com.wordrhyme.storage-s3',
        type: 'settings_tab',
        label: 'S3 Storage',
        order: 60,
        component: SettingsPage,
    },
];

export async function init(): Promise<void> {
    console.log('[Storage S3 Plugin] Admin UI initialized');
}

export default { extensions, init };
