import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionRegistry } from '../../lib/extensions/extension-registry';
import type { UIExtension } from '../../lib/extensions/extension-types';

function makeExt(overrides: Partial<UIExtension> & { id: string; pluginId: string }): UIExtension {
    return {
        label: 'Test',
        targets: [],
        ...overrides,
    };
}

describe('ExtensionRegistry', () => {
    beforeEach(() => {
        ExtensionRegistry.clear();
    });

    describe('register / getBySlot', () => {
        it('registers an extension and retrieves by slot', () => {
            ExtensionRegistry.register(makeExt({
                id: 'test.settings',
                pluginId: 'com.wordrhyme.test',
                label: 'Test Settings',
                targets: [{ slot: 'settings.plugin', order: 10 }],
            }));

            const entries = ExtensionRegistry.getBySlot('settings.plugin');
            expect(entries).toHaveLength(1);
            expect(entries[0]!.extension.id).toBe('test.settings');
            expect(entries[0]!.target.slot).toBe('settings.plugin');
        });

        it('returns empty array for unknown slot', () => {
            const entries = ExtensionRegistry.getBySlot('nonexistent.slot');
            expect(entries).toHaveLength(0);
        });

        it('registers multi-target extension and queries each slot', () => {
            ExtensionRegistry.register(makeExt({
                id: 'email.main',
                pluginId: 'com.wordrhyme.email',
                targets: [
                    { slot: 'nav.sidebar', path: '/p/email' },
                    { slot: 'settings.plugin', order: 50 },
                ],
            }));

            const navEntries = ExtensionRegistry.getBySlot('nav.sidebar');
            expect(navEntries).toHaveLength(1);
            expect(navEntries[0]!.target.slot).toBe('nav.sidebar');

            const settingsEntries = ExtensionRegistry.getBySlot('settings.plugin');
            expect(settingsEntries).toHaveLength(1);
            expect(settingsEntries[0]!.target.slot).toBe('settings.plugin');
        });
    });

    describe('registerAll', () => {
        it('registers multiple extensions at once', () => {
            ExtensionRegistry.registerAll([
                makeExt({
                    id: 'plugin-a.nav',
                    pluginId: 'com.wordrhyme.a',
                    targets: [{ slot: 'nav.sidebar', path: '/p/a' }],
                }),
                makeExt({
                    id: 'plugin-b.nav',
                    pluginId: 'com.wordrhyme.b',
                    targets: [{ slot: 'nav.sidebar', path: '/p/b' }],
                }),
            ]);

            const entries = ExtensionRegistry.getBySlot('nav.sidebar');
            expect(entries).toHaveLength(2);
        });
    });

    describe('ordering', () => {
        it('sorts entries by target.order', () => {
            ExtensionRegistry.registerAll([
                makeExt({
                    id: 'z-last',
                    pluginId: 'com.wordrhyme.z',
                    targets: [{ slot: 'settings.plugin', order: 200 }],
                }),
                makeExt({
                    id: 'a-first',
                    pluginId: 'com.wordrhyme.a',
                    targets: [{ slot: 'settings.plugin', order: 10 }],
                }),
                makeExt({
                    id: 'm-middle',
                    pluginId: 'com.wordrhyme.m',
                    targets: [{ slot: 'settings.plugin', order: 50 }],
                }),
            ]);

            const entries = ExtensionRegistry.getBySlot('settings.plugin');
            expect(entries.map(e => e.extension.id)).toEqual([
                'a-first', 'm-middle', 'z-last',
            ]);
        });

        it('defaults missing order to 100', () => {
            ExtensionRegistry.registerAll([
                makeExt({
                    id: 'no-order',
                    pluginId: 'com.wordrhyme.x',
                    targets: [{ slot: 'settings.plugin' }],
                }),
                makeExt({
                    id: 'has-order',
                    pluginId: 'com.wordrhyme.y',
                    targets: [{ slot: 'settings.plugin', order: 50 }],
                }),
            ]);

            const entries = ExtensionRegistry.getBySlot('settings.plugin');
            expect(entries[0]!.extension.id).toBe('has-order');
            expect(entries[1]!.extension.id).toBe('no-order');
        });
    });

    describe('getBySlotPattern', () => {
        it('matches wildcard patterns', () => {
            ExtensionRegistry.registerAll([
                makeExt({
                    id: 'settings-ext',
                    pluginId: 'com.wordrhyme.a',
                    targets: [{ slot: 'settings.plugin' }],
                }),
                makeExt({
                    id: 'dashboard-ext',
                    pluginId: 'com.wordrhyme.b',
                    targets: [{ slot: 'dashboard.widgets' }],
                }),
                makeExt({
                    id: 'dashboard-overview',
                    pluginId: 'com.wordrhyme.c',
                    targets: [{ slot: 'dashboard.overview' }],
                }),
            ]);

            const dashboardEntries = ExtensionRegistry.getBySlotPattern('dashboard.*');
            expect(dashboardEntries).toHaveLength(2);
            expect(dashboardEntries.map(e => e.extension.id)).toContain('dashboard-ext');
            expect(dashboardEntries.map(e => e.extension.id)).toContain('dashboard-overview');
        });

        it('does not match wrong prefix', () => {
            ExtensionRegistry.register(makeExt({
                id: 'nav-ext',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'nav.sidebar', path: '/p/a' }],
            }));

            const entries = ExtensionRegistry.getBySlotPattern('settings.*');
            expect(entries).toHaveLength(0);
        });
    });

    describe('unregisterPlugin', () => {
        it('removes all extensions for a plugin', () => {
            ExtensionRegistry.registerAll([
                makeExt({
                    id: 'plugin-a.nav',
                    pluginId: 'com.wordrhyme.a',
                    targets: [{ slot: 'nav.sidebar', path: '/p/a' }],
                }),
                makeExt({
                    id: 'plugin-a.settings',
                    pluginId: 'com.wordrhyme.a',
                    targets: [{ slot: 'settings.plugin' }],
                }),
                makeExt({
                    id: 'plugin-b.nav',
                    pluginId: 'com.wordrhyme.b',
                    targets: [{ slot: 'nav.sidebar', path: '/p/b' }],
                }),
            ]);

            const removed = ExtensionRegistry.unregisterPlugin('com.wordrhyme.a');
            expect(removed).toBe(2);

            expect(ExtensionRegistry.getBySlot('nav.sidebar')).toHaveLength(1);
            expect(ExtensionRegistry.getBySlot('nav.sidebar')[0]!.extension.pluginId).toBe('com.wordrhyme.b');
            expect(ExtensionRegistry.getBySlot('settings.plugin')).toHaveLength(0);
        });

        it('returns 0 for unknown plugin', () => {
            expect(ExtensionRegistry.unregisterPlugin('nonexistent')).toBe(0);
        });
    });

    describe('cache invalidation', () => {
        it('invalidates cache when new extension registered', () => {
            ExtensionRegistry.register(makeExt({
                id: 'first',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin', order: 10 }],
            }));

            const before = ExtensionRegistry.getBySlot('settings.plugin');
            expect(before).toHaveLength(1);

            ExtensionRegistry.register(makeExt({
                id: 'second',
                pluginId: 'com.wordrhyme.b',
                targets: [{ slot: 'settings.plugin', order: 20 }],
            }));

            const after = ExtensionRegistry.getBySlot('settings.plugin');
            expect(after).toHaveLength(2);
        });

        it('invalidates cache when extension unregistered', () => {
            ExtensionRegistry.register(makeExt({
                id: 'to-remove',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            expect(ExtensionRegistry.getBySlot('settings.plugin')).toHaveLength(1);

            ExtensionRegistry.unregisterPlugin('com.wordrhyme.a');
            expect(ExtensionRegistry.getBySlot('settings.plugin')).toHaveLength(0);
        });
    });

    describe('reference stability', () => {
        it('returns same reference when data unchanged', () => {
            ExtensionRegistry.register(makeExt({
                id: 'stable',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            const ref1 = ExtensionRegistry.getBySlot('settings.plugin');
            const ref2 = ExtensionRegistry.getBySlot('settings.plugin');
            expect(ref1).toBe(ref2);
        });

        it('returns new reference after change', () => {
            ExtensionRegistry.register(makeExt({
                id: 'changing',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            const ref1 = ExtensionRegistry.getBySlot('settings.plugin');

            ExtensionRegistry.register(makeExt({
                id: 'new-ext',
                pluginId: 'com.wordrhyme.b',
                targets: [{ slot: 'settings.plugin' }],
            }));

            const ref2 = ExtensionRegistry.getBySlot('settings.plugin');
            expect(ref1).not.toBe(ref2);
        });
    });

    describe('slot whitelist', () => {
        it('skips unknown slots in prod mode', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            ExtensionRegistry.register(makeExt({
                id: 'bad-slot',
                pluginId: 'com.wordrhyme.a',
                targets: [
                    { slot: 'invalid.slot.name' },
                    { slot: 'settings.plugin' },
                ],
            }));

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Skipping unknown slot "invalid.slot.name"'),
            );

            expect(ExtensionRegistry.getBySlot('settings.plugin')).toHaveLength(1);

            warnSpy.mockRestore();
        });
    });

    describe('subscribe', () => {
        it('notifies listeners on register', () => {
            const listener = vi.fn();
            const unsub = ExtensionRegistry.subscribe(listener);

            ExtensionRegistry.register(makeExt({
                id: 'trigger',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            expect(listener).toHaveBeenCalledTimes(1);

            unsub();

            ExtensionRegistry.register(makeExt({
                id: 'after-unsub',
                pluginId: 'com.wordrhyme.b',
                targets: [{ slot: 'settings.plugin' }],
            }));

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('notifies listeners on unregister', () => {
            ExtensionRegistry.register(makeExt({
                id: 'to-remove',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            const listener = vi.fn();
            ExtensionRegistry.subscribe(listener);

            ExtensionRegistry.unregisterPlugin('com.wordrhyme.a');
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAll / clear', () => {
        it('returns all registered extensions', () => {
            ExtensionRegistry.registerAll([
                makeExt({ id: 'a', pluginId: 'p1', targets: [{ slot: 'nav.sidebar', path: '/a' }] }),
                makeExt({ id: 'b', pluginId: 'p2', targets: [{ slot: 'settings.plugin' }] }),
            ]);

            expect(ExtensionRegistry.getAll()).toHaveLength(2);
        });

        it('clears all extensions', () => {
            ExtensionRegistry.register(makeExt({
                id: 'to-clear',
                pluginId: 'com.wordrhyme.a',
                targets: [{ slot: 'settings.plugin' }],
            }));

            ExtensionRegistry.clear();
            expect(ExtensionRegistry.getAll()).toHaveLength(0);
            expect(ExtensionRegistry.getBySlot('settings.plugin')).toHaveLength(0);
        });
    });
});
