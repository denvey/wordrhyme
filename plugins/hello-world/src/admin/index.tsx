import { navExtension, settingsExtension } from '@wordrhyme/plugin';
import { HelloWorldPage } from './pages/HelloWorldPage';
import { HelloWorldSettings } from './pages/HelloWorldSettings';

export const extensions = [
    navExtension({
        id: 'hello-world.page',
        label: 'Hello World',
        icon: 'Sparkles',
        path: '/p/com.wordrhyme.hello-world',
        order: 100,
        component: HelloWorldPage,
    }),
    settingsExtension({
        id: 'hello-world.settings',
        label: 'Hello World',
        order: 100,
        component: HelloWorldSettings,
    }),
];

export async function init(): Promise<void> {
    console.log('[HelloWorld Plugin] Admin UI initialized');
}

export default { extensions, init };
