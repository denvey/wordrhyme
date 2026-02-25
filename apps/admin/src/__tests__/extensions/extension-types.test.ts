import { describe, it, expect } from 'vitest';
import {
    CORE_SLOTS,
    isValidSlot,
    matchSlotPattern,
    type UIExtension,
    type NavTarget,
    type SettingsTarget,
    type DashboardTarget,
    type GenericTarget,
    type SlotEntry,
} from '../../lib/extensions/extension-types';

describe('CORE_SLOTS', () => {
    it('contains expected slots', () => {
        expect(CORE_SLOTS).toContain('nav.sidebar');
        expect(CORE_SLOTS).toContain('settings.plugin');
        expect(CORE_SLOTS).toContain('dashboard.widgets');
        expect(CORE_SLOTS).toContain('dashboard.overview');
    });

    it('is an array with known length', () => {
        expect(CORE_SLOTS.length).toBeGreaterThan(0);
        expect(Array.isArray(CORE_SLOTS)).toBe(true);
    });
});

describe('isValidSlot', () => {
    it('returns true for valid slots', () => {
        expect(isValidSlot('nav.sidebar')).toBe(true);
        expect(isValidSlot('settings.plugin')).toBe(true);
        expect(isValidSlot('dashboard.widgets')).toBe(true);
    });

    it('returns false for invalid slots', () => {
        expect(isValidSlot('invalid.slot')).toBe(false);
        expect(isValidSlot('')).toBe(false);
        expect(isValidSlot('nav')).toBe(false);
        expect(isValidSlot('nav.sidebar.extra')).toBe(false);
    });
});

describe('matchSlotPattern', () => {
    it('matches exact slot names', () => {
        expect(matchSlotPattern('nav.sidebar', 'nav.sidebar')).toBe(true);
        expect(matchSlotPattern('settings.plugin', 'settings.plugin')).toBe(true);
    });

    it('does not match different exact names', () => {
        expect(matchSlotPattern('nav.sidebar', 'settings.plugin')).toBe(false);
    });

    it('matches wildcard patterns', () => {
        expect(matchSlotPattern('settings.*', 'settings.plugin')).toBe(true);
        expect(matchSlotPattern('dashboard.*', 'dashboard.widgets')).toBe(true);
        expect(matchSlotPattern('dashboard.*', 'dashboard.overview')).toBe(true);
    });

    it('does not match wildcard patterns against wrong prefix', () => {
        expect(matchSlotPattern('settings.*', 'nav.sidebar')).toBe(false);
        expect(matchSlotPattern('dashboard.*', 'settings.plugin')).toBe(false);
    });

    it('matches multi-level wildcards', () => {
        expect(matchSlotPattern('article.*', 'article.editor.actions')).toBe(true);
        expect(matchSlotPattern('article.*', 'article.editor.sidebar')).toBe(true);
    });

    it('does not match partial prefix without wildcard', () => {
        expect(matchSlotPattern('nav', 'nav.sidebar')).toBe(false);
    });
});

describe('Type contracts', () => {
    it('NavTarget requires path', () => {
        const target: NavTarget = {
            slot: 'nav.sidebar',
            path: '/p/my-plugin',
        };
        expect(target.slot).toBe('nav.sidebar');
        expect(target.path).toBe('/p/my-plugin');
    });

    it('SettingsTarget has no path', () => {
        const target: SettingsTarget = {
            slot: 'settings.plugin',
            order: 50,
        };
        expect(target.slot).toBe('settings.plugin');
        expect(target.order).toBe(50);
    });

    it('DashboardTarget supports colSpan', () => {
        const target: DashboardTarget = {
            slot: 'dashboard.widgets',
            colSpan: 2,
        };
        expect(target.colSpan).toBe(2);
    });

    it('GenericTarget accepts any slot string', () => {
        const target: GenericTarget = {
            slot: 'article.editor.actions',
        };
        expect(target.slot).toBe('article.editor.actions');
    });

    it('UIExtension has correct shape', () => {
        const ext: UIExtension = {
            id: 'test.settings',
            pluginId: 'com.wordrhyme.test',
            label: 'Test Plugin',
            icon: 'Settings',
            targets: [
                { slot: 'settings.plugin', order: 10 },
            ],
        };
        expect(ext.targets).toHaveLength(1);
        expect(ext.targets[0]!.slot).toBe('settings.plugin');
    });

    it('UIExtension supports multiple targets', () => {
        const ext: UIExtension = {
            id: 'test.main',
            pluginId: 'com.wordrhyme.test',
            label: 'Test',
            targets: [
                { slot: 'nav.sidebar', path: '/p/test' },
                { slot: 'settings.plugin', order: 50 },
            ],
        };
        expect(ext.targets).toHaveLength(2);
    });

    it('SlotEntry pairs extension with target', () => {
        const ext: UIExtension = {
            id: 'test.main',
            pluginId: 'com.wordrhyme.test',
            label: 'Test',
            targets: [
                { slot: 'nav.sidebar', path: '/p/test' },
                { slot: 'settings.plugin' },
            ],
        };
        const entry: SlotEntry = {
            extension: ext,
            target: ext.targets[0]!,
        };
        expect(entry.extension.id).toBe('test.main');
        expect(entry.target.slot).toBe('nav.sidebar');
    });
});
