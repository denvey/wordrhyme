import { describe, it, expect } from 'vitest';
import {
    navExtension,
    settingsExtension,
    dashboardExtension,
    multiSlotExtension,
} from '@wordrhyme/plugin';

describe('navExtension', () => {
    it('creates a UIExtensionDef with nav.sidebar target', () => {
        const ext = navExtension({
            id: 'test.page',
            label: 'Test Page',
            icon: 'Sparkles',
            path: '/p/com.wordrhyme.test',
            order: 10,
        });

        expect(ext.id).toBe('test.page');
        expect(ext.label).toBe('Test Page');
        expect(ext.icon).toBe('Sparkles');
        expect(ext.targets).toHaveLength(1);

        const target = ext.targets[0]!;
        expect(target.slot).toBe('nav.sidebar');
        expect('path' in target && target.path).toBe('/p/com.wordrhyme.test');
        expect(target.order).toBe(10);
    });

    it('includes requiredPermission when provided', () => {
        const ext = navExtension({
            id: 'test.page',
            label: 'Test',
            path: '/p/test',
            requiredPermission: 'plugin:test:read',
        });

        const target = ext.targets[0]!;
        expect('requiredPermission' in target && target.requiredPermission).toBe('plugin:test:read');
    });

    it('omits undefined optional fields', () => {
        const ext = navExtension({
            id: 'test.page',
            label: 'Test',
            path: '/p/test',
        });

        const target = ext.targets[0]!;
        expect('order' in target).toBe(false);
        expect('requiredPermission' in target).toBe(false);
        expect('icon' in ext).toBe(false);
    });
});

describe('settingsExtension', () => {
    it('creates a UIExtensionDef with settings.plugin target', () => {
        const ext = settingsExtension({
            id: 'test.settings',
            label: 'Test Settings',
            order: 50,
            category: 'storage',
        });

        expect(ext.id).toBe('test.settings');
        expect(ext.category).toBe('storage');
        expect(ext.targets).toHaveLength(1);

        const target = ext.targets[0]!;
        expect(target.slot).toBe('settings.plugin');
        expect(target.order).toBe(50);
    });
});

describe('dashboardExtension', () => {
    it('creates a UIExtensionDef with dashboard.widgets target', () => {
        const ext = dashboardExtension({
            id: 'test.widget',
            label: 'Test Widget',
            colSpan: 2,
        });

        expect(ext.targets).toHaveLength(1);
        const target = ext.targets[0]!;
        expect(target.slot).toBe('dashboard.widgets');
        expect('colSpan' in target && target.colSpan).toBe(2);
    });
});

describe('multiSlotExtension', () => {
    it('creates a UIExtensionDef with multiple targets', () => {
        const ext = multiSlotExtension({
            id: 'test.main',
            label: 'Test Plugin',
            icon: 'Mail',
            targets: [
                { slot: 'nav.sidebar', path: '/p/test' },
                { slot: 'settings.plugin', order: 50 },
            ],
        });

        expect(ext.targets).toHaveLength(2);
        expect(ext.targets[0]!.slot).toBe('nav.sidebar');
        expect(ext.targets[1]!.slot).toBe('settings.plugin');
    });

    it('passes through all properties', () => {
        const ext = multiSlotExtension({
            id: 'test.main',
            label: 'Test',
            icon: 'Star',
            category: 'general',
            targets: [{ slot: 'settings.plugin' }],
        });

        expect(ext.icon).toBe('Star');
        expect(ext.category).toBe('general');
    });
});
