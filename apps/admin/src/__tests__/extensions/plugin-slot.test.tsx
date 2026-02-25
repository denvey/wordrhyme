import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExtensionRegistry } from '../../lib/extensions/extension-registry';
import { PluginSlot, PluginErrorBoundary } from '../../lib/extensions/plugin-slot';
import type { UIExtension, SlotContext } from '../../lib/extensions/extension-types';

// Suppress console.error for ErrorBoundary tests
const originalError = console.error;
beforeEach(() => {
    console.error = vi.fn();
});
afterEach(() => {
    console.error = originalError;
});

function makeTestComponent(text: string) {
    return function TestComponent(_props: SlotContext) {
        return <div data-testid="plugin-component">{text}</div>;
    };
}

function registerTestExtension(overrides: Partial<UIExtension> & { id: string; pluginId: string }): void {
    ExtensionRegistry.register({
        label: 'Test',
        targets: [],
        ...overrides,
    });
}

describe('PluginSlot', () => {
    beforeEach(() => {
        ExtensionRegistry.clear();
    });

    describe('basic rendering', () => {
        it('renders nothing when no extensions registered', () => {
            const { container } = render(<PluginSlot name="settings.plugin" />);
            expect(container.innerHTML).toBe('');
        });

        it('renders fallback when no extensions registered', () => {
            render(
                <PluginSlot name="settings.plugin" fallback={<div>No plugins</div>} />,
            );
            expect(screen.getByText('No plugins')).toBeInTheDocument();
        });

        it('renders extension component', () => {
            registerTestExtension({
                id: 'test.settings',
                pluginId: 'com.test',
                label: 'Test Settings',
                component: makeTestComponent('Hello from plugin'),
                targets: [{ slot: 'settings.plugin' }],
            });

            render(<PluginSlot name="settings.plugin" />);
            expect(screen.getByText('Hello from plugin')).toBeInTheDocument();
        });

        it('renders multiple extensions', () => {
            registerTestExtension({
                id: 'a.settings',
                pluginId: 'com.a',
                label: 'Plugin A',
                component: makeTestComponent('Plugin A'),
                targets: [{ slot: 'settings.plugin', order: 10 }],
            });
            registerTestExtension({
                id: 'b.settings',
                pluginId: 'com.b',
                label: 'Plugin B',
                component: makeTestComponent('Plugin B'),
                targets: [{ slot: 'settings.plugin', order: 20 }],
            });

            render(<PluginSlot name="settings.plugin" />);
            expect(screen.getByText('Plugin A')).toBeInTheDocument();
            expect(screen.getByText('Plugin B')).toBeInTheDocument();
        });
    });

    describe('permissionFilter', () => {
        it('filters entries based on permissionFilter', () => {
            registerTestExtension({
                id: 'visible.settings',
                pluginId: 'com.visible',
                label: 'Visible',
                component: makeTestComponent('Visible'),
                targets: [{ slot: 'settings.plugin' }],
            });
            registerTestExtension({
                id: 'hidden.settings',
                pluginId: 'com.hidden',
                label: 'Hidden',
                component: makeTestComponent('Hidden'),
                targets: [{ slot: 'settings.plugin' }],
            });

            render(
                <PluginSlot
                    name="settings.plugin"
                    permissionFilter={(entry) => entry.extension.pluginId !== 'com.hidden'}
                />,
            );

            expect(screen.getByText('Visible')).toBeInTheDocument();
            expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
        });

        it('shows fallback when all entries filtered out', () => {
            registerTestExtension({
                id: 'test.settings',
                pluginId: 'com.test',
                component: makeTestComponent('Test'),
                targets: [{ slot: 'settings.plugin' }],
            });

            render(
                <PluginSlot
                    name="settings.plugin"
                    permissionFilter={() => false}
                    fallback={<div>No access</div>}
                />,
            );

            expect(screen.queryByText('Test')).not.toBeInTheDocument();
            expect(screen.getByText('No access')).toBeInTheDocument();
        });
    });

    describe('renderItem', () => {
        it('uses custom renderItem', () => {
            registerTestExtension({
                id: 'custom.settings',
                pluginId: 'com.custom',
                label: 'Custom Label',
                component: makeTestComponent('Default'),
                targets: [{ slot: 'settings.plugin' }],
            });

            render(
                <PluginSlot
                    name="settings.plugin"
                    renderItem={(entry) => (
                        <div data-testid="custom-render">{entry.extension.label} - custom</div>
                    )}
                />,
            );

            expect(screen.getByText('Custom Label - custom')).toBeInTheDocument();
            expect(screen.queryByText('Default')).not.toBeInTheDocument();
        });
    });

    describe('layout modes', () => {
        beforeEach(() => {
            registerTestExtension({
                id: 'a',
                pluginId: 'com.a',
                label: 'A',
                component: makeTestComponent('A'),
                targets: [{ slot: 'settings.plugin', order: 10 }],
            });
            registerTestExtension({
                id: 'b',
                pluginId: 'com.b',
                label: 'B',
                component: makeTestComponent('B'),
                targets: [{ slot: 'settings.plugin', order: 20 }],
            });
        });

        it('renders stack layout by default', () => {
            const { container } = render(<PluginSlot name="settings.plugin" />);
            const wrapper = container.firstElementChild as HTMLElement;
            expect(wrapper.style.flexDirection).toBe('column');
        });

        it('renders inline layout', () => {
            const { container } = render(<PluginSlot name="settings.plugin" layout="inline" />);
            const wrapper = container.firstElementChild as HTMLElement;
            expect(wrapper.style.display).toBe('flex');
            expect(wrapper.style.flexDirection).not.toBe('column');
        });

        it('renders grid layout', () => {
            const { container } = render(<PluginSlot name="settings.plugin" layout="grid" />);
            const wrapper = container.firstElementChild as HTMLElement;
            expect(wrapper.style.display).toBe('grid');
        });

        it('renders tabs layout', () => {
            render(<PluginSlot name="settings.plugin" layout="tabs" />);
            expect(screen.getByRole('tablist')).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'A' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'B' })).toBeInTheDocument();
        });
    });

    describe('error boundary', () => {
        it('catches component errors and shows retry', () => {
            const BrokenComponent = () => {
                throw new Error('Plugin crashed');
            };

            registerTestExtension({
                id: 'broken',
                pluginId: 'com.broken',
                label: 'Broken',
                component: BrokenComponent,
                targets: [{ slot: 'settings.plugin' }],
            });

            render(<PluginSlot name="settings.plugin" />);
            expect(screen.getByText(/Extension unavailable/)).toBeInTheDocument();
            expect(screen.getByText('Retry')).toBeInTheDocument();
        });

        it('isolates errors per extension', () => {
            const BrokenComponent = () => {
                throw new Error('Crash');
            };

            registerTestExtension({
                id: 'broken',
                pluginId: 'com.broken',
                label: 'Broken',
                component: BrokenComponent,
                targets: [{ slot: 'settings.plugin', order: 10 }],
            });
            registerTestExtension({
                id: 'healthy',
                pluginId: 'com.healthy',
                label: 'Healthy',
                component: makeTestComponent('Still works'),
                targets: [{ slot: 'settings.plugin', order: 20 }],
            });

            render(<PluginSlot name="settings.plugin" />);
            expect(screen.getByText(/Extension unavailable/)).toBeInTheDocument();
            expect(screen.getByText('Still works')).toBeInTheDocument();
        });
    });
});

describe('PluginErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <PluginErrorBoundary pluginId="test">
                <div>Normal content</div>
            </PluginErrorBoundary>,
        );
        expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('catches error and shows recovery UI', () => {
        const Broken = () => {
            throw new Error('test');
        };

        render(
            <PluginErrorBoundary pluginId="com.test">
                <Broken />
            </PluginErrorBoundary>,
        );

        expect(screen.getByText(/Extension unavailable/)).toBeInTheDocument();
        expect(screen.getByText(/com\.test/)).toBeInTheDocument();
    });
});
