/**
 * Hello World Plugin - Admin UI Entry
 *
 * This exports extensions for the Admin UI via Module Federation.
 * Extensions are loaded by the host app and injected into extension points.
 */
import type { Extension } from './types';
import { HelloWorldPage } from './pages/HelloWorldPage';
import { HelloWorldSettings } from './pages/HelloWorldSettings';

/**
 * Plugin extensions to register with the Admin UI
 */
export const extensions: Extension[] = [
    // Sidebar navigation item
    {
        id: 'hello-world.sidebar',
        pluginId: 'com.wordrhyme.hello-world',
        type: 'sidebar',
        label: 'Hello World',
        icon: 'Sparkles',
        path: '/p/com.wordrhyme.hello-world',
        order: 100,
        component: HelloWorldPage,
    },
    // Settings tab
    {
        id: 'hello-world.settings',
        pluginId: 'com.wordrhyme.hello-world',
        type: 'settings_tab',
        label: 'Hello World',
        order: 100,
        component: HelloWorldSettings,
    },
];

/**
 * Optional initialization function
 */
export async function init(): Promise<void> {
    console.log('[HelloWorld Plugin] Admin UI initialized');
}

// Default export for Module Federation
export default { extensions, init };
