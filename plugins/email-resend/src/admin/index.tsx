import { multiSlotExtension } from '@wordrhyme/plugin';
import { SettingsPage } from './components/SettingsPage';

export const extensions = [
    multiSlotExtension({
        id: 'email-resend.main',
        label: 'Email (Resend)',
        icon: 'Mail',
        component: SettingsPage,
        targets: [
            { slot: 'nav.sidebar', path: '/p/com.wordrhyme.email-resend', order: 50 },
            { slot: 'settings.plugin', order: 50 },
        ],
    }),
];

export async function init(): Promise<void> {
    console.log('[Email Resend Plugin] Admin UI initialized');
}

export default { extensions, init };
