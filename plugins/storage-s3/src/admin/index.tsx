import { settingsExtension } from '@wordrhyme/plugin';
import { SettingsPage } from './components/SettingsPage.js';

export const extensions = [
    settingsExtension({
        id: 'storage-s3.settings',
        label: 'S3 Storage',
        order: 60,
        category: 'storage',
        visibility: 'all',
        component: SettingsPage,
    }),
];

export async function init(): Promise<void> {
    console.log('[Storage S3 Plugin] Admin UI initialized');
}

export default { extensions, init };
