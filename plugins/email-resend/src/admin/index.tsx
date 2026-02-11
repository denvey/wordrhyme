/**
 * Email Resend Plugin - Admin UI Entry
 *
 * This exports extensions for the Admin UI via Module Federation.
 * Extensions are loaded by the host app and injected into extension points.
 */
import type { Extension } from './types';
import { SettingsPage } from './components/SettingsPage';

/**
 * Plugin extensions to register with the Admin UI
 */
export const extensions: Extension[] = [
    // Sidebar navigation item
    {
        id: 'email-resend.sidebar',
        pluginId: 'com.wordrhyme.email-resend',
        type: 'sidebar',
        label: 'Email Settings',
        icon: 'Mail',
        path: '/p/com.wordrhyme.email-resend',
        order: 50,
        component: SettingsPage,
    },
    // Settings tab
    {
        id: 'email-resend.settings',
        pluginId: 'com.wordrhyme.email-resend',
        type: 'settings_tab',
        label: 'Email',
        order: 50,
        component: SettingsPage,
    },
];

/**
 * Optional initialization function
 */
export async function init(): Promise<void> {
    console.log('[Email Resend Plugin] Admin UI initialized');
}

// Default export for Module Federation
export default { extensions, init };
