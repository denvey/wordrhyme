/**
 * Menu Registry Tests
 *
 * Tests for:
 * - First install: inserts all menus
 * - Reconciliation: adds new, updates changed, deletes removed menus
 * - Visibility toggle: setPluginMenusVisibility updates visible field
 * - Structural fields updated, user customizations (order, visible) preserved
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginManifest } from '@wordrhyme/plugin';

// ── Mock setup ──────────────────────────────────────────────────────
// Must be declared before vi.mock() calls so hoisting picks them up

const mockValues = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

const mockSetUpdate = vi.fn().mockReturnThis();
const mockWhereUpdate = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockReturnValue({ set: mockSetUpdate });
mockSetUpdate.mockReturnValue({ where: mockWhereUpdate });

const mockWhereDelete = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockReturnValue({ where: mockWhereDelete });

const mockWhereSelect = vi.fn().mockResolvedValue([]);
const mockFromSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
const mockSelect = vi.fn().mockReturnValue({ from: mockFromSelect });

vi.mock('../../db', () => ({
    db: {
        insert: (...args: unknown[]) => mockInsert(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
        select: (...args: unknown[]) => mockSelect(...args),
    },
}));

vi.mock('../../db/schema/menus', () => ({
    menus: {
        id: 'menus.id',
        code: 'menus.code',
        source: 'menus.source',
        organizationId: 'menus.organizationId',
        label: 'menus.label',
        icon: 'menus.icon',
        parentCode: 'menus.parentCode',
        path: 'menus.path',
        requiredPermission: 'menus.requiredPermission',
        visible: 'menus.visible',
        target: 'menus.target',
        type: 'menus.type',
        order: 'menus.order',
        openMode: 'menus.openMode',
        metadata: 'menus.metadata',
    },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('drizzle-orm')>();
    return {
        ...actual,
        eq: vi.fn((a, b) => ({ op: 'eq', field: a, value: b })),
        and: vi.fn((...args) => ({ op: 'and', conditions: args })),
        isNull: vi.fn((a) => ({ op: 'isNull', field: a })),
    };
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
    return {
        pluginId: 'com.test.shop',
        version: '1.0.0',
        name: 'Test Shop',
        admin: {
            extensions: [
                {
                    id: 'shop-group',
                    label: 'Shop',
                    icon: 'ShoppingCart',
                    targets: [{ slot: 'nav.sidebar.group', icon: 'ShoppingCart', order: 50 }],
                },
                {
                    id: 'products',
                    label: 'Products',
                    targets: [{ slot: 'nav.sidebar', path: '/shop/products', parent: 'shop-group', order: 10 }],
                },
            ],
        },
        ...overrides,
    } as PluginManifest;
}

function makeExistingMenu(code: string, overrides: Record<string, unknown> = {}) {
    return {
        id: `id-${code}`,
        code,
        type: 'system',
        source: 'com.test.shop',
        organizationId: 'org-1',
        label: 'Old Label',
        icon: null,
        path: null,
        openMode: 'route',
        parentCode: null,
        order: 0,
        visible: true,
        requiredPermission: null,
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('MenuRegistry', () => {
    let menuRegistry: InstanceType<typeof import('../../plugins/menu-registry').MenuRegistry>;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset default: select returns empty array (no existing menus)
        mockWhereSelect.mockResolvedValue([]);

        const { MenuRegistry } = await import('../../plugins/menu-registry');
        menuRegistry = new MenuRegistry();
    });

    describe('registerPluginMenus', () => {
        it('should insert all menus on first install (no existing menus)', async () => {
            const manifest = makeManifest();

            await menuRegistry.registerPluginMenus(manifest, 'org-1');

            expect(mockInsert).toHaveBeenCalledTimes(1);
            expect(mockValues).toHaveBeenCalledTimes(1);

            const insertedRows = mockValues.mock.calls[0][0];
            expect(insertedRows).toHaveLength(2); // group + nav item
            expect(insertedRows[0].code).toBe('plugin:com.test.shop:shop-group');
            expect(insertedRows[1].code).toBe('plugin:com.test.shop::shop:products');
        });

        it('should skip when manifest has no menus', async () => {
            const manifest = makeManifest({ admin: undefined });

            await menuRegistry.registerPluginMenus(manifest, 'org-1');

            expect(mockInsert).not.toHaveBeenCalled();
        });

        it('should reconcile: insert new, update changed, delete removed', async () => {
            // Existing menus in DB: group + old-page (old-page will be removed)
            const existingMenus = [
                makeExistingMenu('plugin:com.test.shop:shop-group', {
                    label: 'Old Shop Label',
                    icon: 'OldIcon',
                }),
                makeExistingMenu('plugin:com.test.shop:old-page', {
                    label: 'Old Page',
                    path: '/shop/old',
                }),
            ];
            mockWhereSelect.mockResolvedValue(existingMenus);

            const manifest = makeManifest();

            await menuRegistry.registerPluginMenus(manifest, 'org-1');

            // Should insert the new 'products' nav item
            expect(mockInsert).toHaveBeenCalled();
            const insertedRows = mockValues.mock.calls[0][0];
            expect(insertedRows).toHaveLength(1);
            expect(insertedRows[0].code).toBe('plugin:com.test.shop::shop:products');

            // Should update the group's changed structural fields (label, icon)
            expect(mockUpdate).toHaveBeenCalled();

            // Should delete the removed 'old-page'
            expect(mockDelete).toHaveBeenCalled();
        });

        it('should not update when structural fields are unchanged', async () => {
            const existingMenus = [
                makeExistingMenu('plugin:com.test.shop:shop-group', {
                    label: 'Shop',
                    icon: 'ShoppingCart',
                    path: null,
                    parentCode: null,
                    requiredPermission: null,
                }),
                makeExistingMenu('plugin:com.test.shop::shop:products', {
                    label: 'Products',
                    icon: null,
                    path: '/shop/products',
                    parentCode: 'plugin:com.test.shop:shop-group',
                    requiredPermission: null,
                }),
            ];
            mockWhereSelect.mockResolvedValue(existingMenus);

            const manifest = makeManifest();

            await menuRegistry.registerPluginMenus(manifest, 'org-1');

            // No inserts (all codes exist), no updates (nothing changed), no deletes
            expect(mockInsert).not.toHaveBeenCalled();
            expect(mockUpdate).not.toHaveBeenCalled();
            expect(mockDelete).not.toHaveBeenCalled();
        });
    });

    describe('setPluginMenusVisibility', () => {
        it('should set visible=false for all plugin menus in an org', async () => {
            await menuRegistry.setPluginMenusVisibility('com.test.shop', 'org-1', false);

            expect(mockUpdate).toHaveBeenCalledTimes(1);
            expect(mockSetUpdate).toHaveBeenCalledWith({ visible: false });
        });

        it('should set visible=true for all plugin menus in an org', async () => {
            await menuRegistry.setPluginMenusVisibility('com.test.shop', 'org-1', true);

            expect(mockUpdate).toHaveBeenCalledTimes(1);
            expect(mockSetUpdate).toHaveBeenCalledWith({ visible: true });
        });
    });

    describe('unregisterPluginMenus', () => {
        it('should delete all menus for a plugin in an org', async () => {
            await menuRegistry.unregisterPluginMenus('com.test.shop', 'org-1');

            expect(mockDelete).toHaveBeenCalledTimes(1);
        });

        it('should delete all menus globally when no org specified', async () => {
            await menuRegistry.unregisterPluginMenus('com.test.shop');

            expect(mockDelete).toHaveBeenCalledTimes(1);
        });
    });
});
