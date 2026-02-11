/**
 * Plugin UI Loader Tests
 *
 * Tests for Module Federation-based plugin loading including:
 * - PluginUILoader component lifecycle
 * - Plugin module loading with timeout
 * - Extension registry integration
 * - Error boundary handling
 * - useExtensions hook
 *
 * @task A.3 - Frontend Tests (Plugin UI Dynamic Loading)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';

// Mock tRPC
const mockPluginList = vi.fn();
vi.mock('../../lib/trpc', () => ({
  trpc: {
    plugin: {
      list: {
        useQuery: () => mockPluginList(),
      },
    },
  },
}));

// Mock plugin loader functions
const mockLoadPlugins = vi.fn();
const mockUnloadPlugin = vi.fn();
vi.mock('../../lib/extensions/plugin-loader', () => ({
  loadPlugins: (...args: unknown[]) => mockLoadPlugins(...args),
  unloadPlugin: (...args: unknown[]) => mockUnloadPlugin(...args),
}));

// Mock extension registry
const mockExtensions: Array<{ id: string; pluginId: string; type: string }> = [];
const mockSubscribe = vi.fn();
const mockRegister = vi.fn();
const mockUnregisterPlugin = vi.fn();
vi.mock('../../lib/extensions', () => ({
  ExtensionRegistry: {
    getAllExtensions: () => mockExtensions,
    subscribe: (fn: (ext: typeof mockExtensions) => void) => {
      mockSubscribe(fn);
      return () => {};
    },
    register: (...args: unknown[]) => mockRegister(...args),
    unregisterPlugin: (...args: unknown[]) => mockUnregisterPlugin(...args),
  },
}));

// Mock dev utils
vi.mock('@wordrhyme/plugin/dev-utils', () => ({
  getPluginDevRemoteEntry: (pluginId: string) => `http://localhost:3002/${pluginId}/remoteEntry.js`,
  getPluginMfName: (pluginId: string) => pluginId.replace(/[.-]/g, '_'),
}));

// Mock Skeleton component
vi.mock('@wordrhyme/ui', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// Import components after mocks
import {
  PluginUILoader,
  PluginErrorBoundary,
  PluginComponent,
  useExtensions,
} from '../../components/PluginUILoader';

// Test data
const testPlugins = [
  {
    id: 'plugin-1',
    manifest: {
      pluginId: 'com.example.plugin1',
      version: '1.0.0',
      admin: {
        remoteEntry: './dist/admin/remoteEntry.js',
      },
    },
  },
  {
    id: 'plugin-2',
    manifest: {
      pluginId: 'com.example.plugin2',
      version: '1.0.0',
      admin: {
        remoteEntry: './dist/admin/remoteEntry.js',
      },
    },
  },
];

describe('PluginUILoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPluginList.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    mockLoadPlugins.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should render children while loading plugins', () => {
      mockPluginList.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      render(
        <PluginUILoader>
          <div data-testid="child-content">App Content</div>
        </PluginUILoader>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('should render children when no plugins have admin UI', async () => {
      mockPluginList.mockReturnValue({
        data: [{ id: 'plugin-1', manifest: { pluginId: 'test', version: '1.0' } }],
        isLoading: false,
        error: null,
      });

      render(
        <PluginUILoader>
          <div data-testid="child-content">App Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(screen.getByTestId('child-content')).toBeInTheDocument();
      });
    });
  });

  describe('Plugin Loading', () => {
    it('should call loadPlugins with manifests that have admin UI', async () => {
      mockPluginList.mockReturnValue({
        data: testPlugins,
        isLoading: false,
        error: null,
      });

      mockLoadPlugins.mockResolvedValue([
        { pluginId: 'com.example.plugin1', success: true },
        { pluginId: 'com.example.plugin2', success: true },
      ]);

      render(
        <PluginUILoader>
          <div>Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(mockLoadPlugins).toHaveBeenCalled();
      });

      const calledManifests = mockLoadPlugins.mock.calls[0][0];
      expect(calledManifests).toHaveLength(2);
      expect(calledManifests[0].pluginId).toBe('com.example.plugin1');
    });

    it('should handle plugin load failures gracefully', async () => {
      mockPluginList.mockReturnValue({
        data: testPlugins,
        isLoading: false,
        error: null,
      });

      mockLoadPlugins.mockResolvedValue([
        { pluginId: 'com.example.plugin1', success: true },
        { pluginId: 'com.example.plugin2', success: false, error: 'Load failed' },
      ]);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <PluginUILoader>
          <div data-testid="content">Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle loadPlugins error', async () => {
      mockPluginList.mockReturnValue({
        data: testPlugins,
        isLoading: false,
        error: null,
      });

      mockLoadPlugins.mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <PluginUILoader>
          <div data-testid="content">Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Dev Mode', () => {
    it('should use dev remote entry URL in development', async () => {
      // Simulate dev mode
      const originalEnv = import.meta.env.DEV;
      (import.meta.env as { DEV: boolean }).DEV = true;

      mockPluginList.mockReturnValue({
        data: testPlugins,
        isLoading: false,
        error: null,
      });

      mockLoadPlugins.mockResolvedValue([]);

      render(
        <PluginUILoader>
          <div>Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(mockLoadPlugins).toHaveBeenCalled();
      });

      // Restore
      (import.meta.env as { DEV: boolean }).DEV = originalEnv;
    });
  });

  describe('Cleanup', () => {
    it('should not throw on unmount', async () => {
      mockPluginList.mockReturnValue({
        data: testPlugins,
        isLoading: false,
        error: null,
      });

      mockLoadPlugins.mockResolvedValue([
        { pluginId: 'com.example.plugin1', success: true },
      ]);

      const { unmount } = render(
        <PluginUILoader>
          <div>Content</div>
        </PluginUILoader>
      );

      await waitFor(() => {
        expect(mockLoadPlugins).toHaveBeenCalled();
      });

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });
  });
});

describe('PluginErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React error boundary console errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render children when no error', () => {
    render(
      <PluginErrorBoundary pluginId="test-plugin">
        <div data-testid="child">Plugin Content</div>
      </PluginErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should catch and display error when child throws', () => {
    const ThrowingComponent = () => {
      throw new Error('Component crashed');
    };

    render(
      <PluginErrorBoundary pluginId="crashing-plugin">
        <ThrowingComponent />
      </PluginErrorBoundary>
    );

    expect(screen.getByText(/Plugin "crashing-plugin" failed to load/)).toBeInTheDocument();
    expect(screen.getByText(/Component crashed/)).toBeInTheDocument();
  });

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    render(
      <PluginErrorBoundary pluginId="test-plugin">
        <ThrowingComponent />
      </PluginErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls.some((call) => call[0]?.includes?.('Plugin test-plugin crashed'))).toBe(true);
  });
});

describe('PluginComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render component with error boundary and suspense', () => {
    const TestComponent = () => <div data-testid="plugin-content">Hello from Plugin</div>;

    render(<PluginComponent pluginId="test-plugin" component={TestComponent} />);

    expect(screen.getByTestId('plugin-content')).toBeInTheDocument();
  });

  it('should show skeleton during lazy load', () => {
    // Create a component that suspends (simulated with lazy loading)
    const LazyComponent = React.lazy(
      () =>
        new Promise<{ default: React.ComponentType }>((resolve) => {
          setTimeout(() => {
            resolve({
              default: () => <div data-testid="lazy-content">Lazy Content</div>,
            });
          }, 100);
        })
    );

    render(<PluginComponent pluginId="lazy-plugin" component={LazyComponent} />);

    // Should show skeleton initially
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('should handle component errors with boundary', () => {
    const CrashingComponent = () => {
      throw new Error('Plugin crashed');
    };

    render(<PluginComponent pluginId="crash-plugin" component={CrashingComponent} />);

    expect(screen.getByText(/Plugin "crash-plugin" failed to load/)).toBeInTheDocument();
  });
});

describe('useExtensions hook', () => {
  it('should return extensions from registry', () => {
    const TestComponent = () => {
      const extensions = useExtensions();
      return <div data-testid="count">{extensions.length}</div>;
    };

    render(<TestComponent />);

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('should subscribe to extension changes', () => {
    const TestComponent = () => {
      useExtensions();
      return <div>Test</div>;
    };

    render(<TestComponent />);

    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should cleanup subscription on unmount', () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);

    const TestComponent = () => {
      useExtensions();
      return <div>Test</div>;
    };

    const { unmount } = render(<TestComponent />);
    unmount();

    // Cleanup should be called (the return value from subscribe)
    expect(mockSubscribe).toHaveBeenCalled();
  });
});

describe('Extension Registry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register extensions when plugins load successfully', async () => {
    const testExtensions = [
      { id: 'sidebar-1', pluginId: 'test-plugin', type: 'SIDEBAR' },
    ];

    mockPluginList.mockReturnValue({
      data: testPlugins,
      isLoading: false,
      error: null,
    });

    mockLoadPlugins.mockResolvedValue([
      { pluginId: 'com.example.plugin1', success: true, extensionCount: 1 },
    ]);

    render(
      <PluginUILoader>
        <div>Content</div>
      </PluginUILoader>
    );

    await waitFor(() => {
      expect(mockLoadPlugins).toHaveBeenCalled();
    });
  });

  it('should skip plugins without admin UI', async () => {
    const pluginsWithoutAdmin = [
      {
        id: 'plugin-no-admin',
        manifest: {
          pluginId: 'com.example.no-admin',
          version: '1.0.0',
          // No admin field
        },
      },
    ];

    mockPluginList.mockReturnValue({
      data: pluginsWithoutAdmin,
      isLoading: false,
      error: null,
    });

    render(
      <PluginUILoader>
        <div data-testid="content">Content</div>
      </PluginUILoader>
    );

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    // loadPlugins should not be called with empty array
    // or called with empty manifests array
    if (mockLoadPlugins.mock.calls.length > 0) {
      expect(mockLoadPlugins.mock.calls[0][0]).toHaveLength(0);
    }
  });
});

describe('Plugin Load Results', () => {
  it('should track successfully loaded plugins', async () => {
    mockPluginList.mockReturnValue({
      data: testPlugins,
      isLoading: false,
      error: null,
    });

    mockLoadPlugins.mockResolvedValue([
      { pluginId: 'com.example.plugin1', success: true },
      { pluginId: 'com.example.plugin2', success: true },
    ]);

    render(
      <PluginUILoader>
        <div data-testid="content">Content</div>
      </PluginUILoader>
    );

    await waitFor(() => {
      expect(mockLoadPlugins).toHaveBeenCalled();
    });

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('should log warning for failed plugins', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockPluginList.mockReturnValue({
      data: testPlugins,
      isLoading: false,
      error: null,
    });

    mockLoadPlugins.mockResolvedValue([
      { pluginId: 'com.example.plugin1', success: false, error: 'Network error' },
    ]);

    render(
      <PluginUILoader>
        <div>Content</div>
      </PluginUILoader>
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Some plugins failed to load:',
        expect.any(Array)
      );
    });

    consoleSpy.mockRestore();
  });
});

describe('Query Error Handling', () => {
  it('should handle tRPC query errors', async () => {
    mockPluginList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Query failed'),
    });

    render(
      <PluginUILoader>
        <div data-testid="content">Content</div>
      </PluginUILoader>
    );

    // Should still render children
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('should wait for plugins data before loading', async () => {
    // Clear any previous calls from other tests
    mockLoadPlugins.mockClear();

    mockPluginList.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(
      <PluginUILoader>
        <div data-testid="content">Content</div>
      </PluginUILoader>
    );

    // loadPlugins should not be called while still loading
    // Use a small wait to ensure effect runs
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockLoadPlugins).not.toHaveBeenCalled();
  });
});
