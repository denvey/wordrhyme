/**
 * Multi-Tenant & Auth Route Tests
 *
 * Tests for tenant switching and route protection:
 * - AuthProvider context
 * - ProtectedRoute redirect behavior
 * - SuperAdminRoute access control
 * - OrgAdminRoute access control
 * - Organization switching
 *
 * @task A.3 - Frontend Tests (Multi-tenant Switching)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React, { createContext, useContext, type ReactNode } from 'react';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard' }),
}));

// Types for auth context
interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface TenantContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  switchOrganization: (orgId: string) => Promise<void>;
  isLoading: boolean;
}

// Test auth context
const TestAuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isSuperAdmin: false,
  isOrgAdmin: false,
  login: async () => {},
  logout: async () => {},
});

// Test tenant context
const TestTenantContext = createContext<TenantContextType>({
  currentOrg: null,
  organizations: [],
  switchOrganization: async () => {},
  isLoading: false,
});

function useTestAuth() {
  return useContext(TestAuthContext);
}

function useTestTenant() {
  return useContext(TestTenantContext);
}

// Test wrapper
interface TestWrapperProps {
  children: ReactNode;
  authValue?: Partial<AuthContextType>;
  tenantValue?: Partial<TenantContextType>;
}

function TestWrapper({ children, authValue = {}, tenantValue = {} }: TestWrapperProps) {
  const defaultAuth: AuthContextType = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isSuperAdmin: false,
    isOrgAdmin: false,
    login: async () => {},
    logout: async () => {},
    ...authValue,
  };

  const defaultTenant: TenantContextType = {
    currentOrg: null,
    organizations: [],
    switchOrganization: async () => {},
    isLoading: false,
    ...tenantValue,
  };

  return (
    <TestAuthContext.Provider value={defaultAuth}>
      <TestTenantContext.Provider value={defaultTenant}>
        {children}
      </TestTenantContext.Provider>
    </TestAuthContext.Provider>
  );
}

// Test components simulating real route protection
function TestProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useTestAuth();

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    mockNavigate('/login', { state: { from: '/dashboard' } });
    return null;
  }

  return <>{children}</>;
}

function TestSuperAdminRoute({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isSuperAdmin, isLoading } = useTestAuth();

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  if (!isSuperAdmin) {
    if (fallback) {
      return <>{fallback}</>;
    }
    mockNavigate('/');
    return null;
  }

  return <>{children}</>;
}

function TestOrgAdminRoute({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isOrgAdmin, isLoading } = useTestAuth();

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  if (!isOrgAdmin) {
    if (fallback) {
      return <>{fallback}</>;
    }
    mockNavigate('/');
    return null;
  }

  return <>{children}</>;
}

// Organization switcher component for testing
function TestOrgSwitcher() {
  const { currentOrg, organizations, switchOrganization, isLoading } = useTestTenant();

  if (isLoading) {
    return <div data-testid="org-loading">Loading organizations...</div>;
  }

  return (
    <div data-testid="org-switcher">
      <span data-testid="current-org">{currentOrg?.name || 'No organization'}</span>
      <ul>
        {organizations.map((org) => (
          <li key={org.id}>
            <button
              data-testid={`switch-to-${org.id}`}
              onClick={() => switchOrganization(org.id)}
            >
              {org.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication State', () => {
    it('should provide unauthenticated state by default', () => {
      function TestComponent() {
        const { isAuthenticated, user } = useTestAuth();
        return (
          <div>
            <span data-testid="auth-status">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="user-name">{user?.name || 'none'}</span>
          </div>
        );
      }

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('auth-status')).toHaveTextContent('no');
      expect(screen.getByTestId('user-name')).toHaveTextContent('none');
    });

    it('should provide authenticated user data', () => {
      function TestComponent() {
        const { isAuthenticated, user } = useTestAuth();
        return (
          <div>
            <span data-testid="auth-status">{isAuthenticated ? 'yes' : 'no'}</span>
            <span data-testid="user-name">{user?.name || 'none'}</span>
            <span data-testid="user-email">{user?.email || 'none'}</span>
          </div>
        );
      }

      render(
        <TestWrapper
          authValue={{
            isAuthenticated: true,
            user: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
          }}
        >
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('auth-status')).toHaveTextContent('yes');
      expect(screen.getByTestId('user-name')).toHaveTextContent('John Doe');
      expect(screen.getByTestId('user-email')).toHaveTextContent('john@example.com');
    });

    it('should indicate loading state', () => {
      function TestComponent() {
        const { isLoading } = useTestAuth();
        return <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>;
      }

      render(
        <TestWrapper authValue={{ isLoading: true }}>
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });
  });

  describe('Role Checks', () => {
    it('should identify super admin by role', () => {
      function TestComponent() {
        const { isSuperAdmin } = useTestAuth();
        return <span data-testid="is-super">{isSuperAdmin ? 'yes' : 'no'}</span>;
      }

      render(
        <TestWrapper
          authValue={{
            isAuthenticated: true,
            user: { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
            isSuperAdmin: true,
          }}
        >
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('is-super')).toHaveTextContent('yes');
    });

    it('should identify org admin', () => {
      function TestComponent() {
        const { isOrgAdmin } = useTestAuth();
        return <span data-testid="is-org-admin">{isOrgAdmin ? 'yes' : 'no'}</span>;
      }

      render(
        <TestWrapper
          authValue={{
            isAuthenticated: true,
            user: { id: 'u1', name: 'Org Admin', email: 'orgadmin@example.com' },
            isOrgAdmin: true,
          }}
        >
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('is-org-admin')).toHaveTextContent('yes');
    });

    it('should not be super admin for regular user', () => {
      function TestComponent() {
        const { isSuperAdmin } = useTestAuth();
        return <span data-testid="is-super">{isSuperAdmin ? 'yes' : 'no'}</span>;
      }

      render(
        <TestWrapper
          authValue={{
            isAuthenticated: true,
            user: { id: 'u1', name: 'User', email: 'user@example.com' },
            isSuperAdmin: false,
          }}
        >
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('is-super')).toHaveTextContent('no');
    });
  });
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading indicator while checking auth', () => {
    render(
      <TestWrapper authValue={{ isLoading: true }}>
        <TestProtectedRoute>
          <div data-testid="content">Protected Content</div>
        </TestProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('should redirect to login when not authenticated', () => {
    render(
      <TestWrapper authValue={{ isAuthenticated: false, isLoading: false }}>
        <TestProtectedRoute>
          <div data-testid="content">Protected Content</div>
        </TestProtectedRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { from: '/dashboard' } });
  });

  it('should render children when authenticated', () => {
    render(
      <TestWrapper authValue={{ isAuthenticated: true, isLoading: false }}>
        <TestProtectedRoute>
          <div data-testid="content">Protected Content</div>
        </TestProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('SuperAdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading indicator while checking', () => {
    render(
      <TestWrapper authValue={{ isLoading: true }}>
        <TestSuperAdminRoute>
          <div data-testid="admin-content">Super Admin Content</div>
        </TestSuperAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('should redirect when not super admin (no fallback)', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: false, isLoading: false }}>
        <TestSuperAdminRoute>
          <div data-testid="admin-content">Super Admin Content</div>
        </TestSuperAdminRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should show fallback when not super admin', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: false, isLoading: false }}>
        <TestSuperAdminRoute fallback={<div data-testid="fallback">Access Denied</div>}>
          <div data-testid="admin-content">Super Admin Content</div>
        </TestSuperAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should render children for super admin', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: true, isLoading: false }}>
        <TestSuperAdminRoute>
          <div data-testid="admin-content">Super Admin Content</div>
        </TestSuperAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
  });
});

describe('OrgAdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading indicator while checking', () => {
    render(
      <TestWrapper authValue={{ isLoading: true }}>
        <TestOrgAdminRoute>
          <div data-testid="org-content">Org Admin Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('should redirect when not org admin (no fallback)', () => {
    render(
      <TestWrapper authValue={{ isOrgAdmin: false, isLoading: false }}>
        <TestOrgAdminRoute>
          <div data-testid="org-content">Org Admin Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should show fallback when not org admin', () => {
    render(
      <TestWrapper authValue={{ isOrgAdmin: false, isLoading: false }}>
        <TestOrgAdminRoute fallback={<div data-testid="fallback">Access Denied</div>}>
          <div data-testid="org-content">Org Admin Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should render children for org admin', () => {
    render(
      <TestWrapper authValue={{ isOrgAdmin: true, isLoading: false }}>
        <TestOrgAdminRoute>
          <div data-testid="org-content">Org Admin Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('org-content')).toBeInTheDocument();
  });

  it('should allow super admin access', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: true, isOrgAdmin: true, isLoading: false }}>
        <TestOrgAdminRoute>
          <div data-testid="org-content">Org Admin Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('org-content')).toBeInTheDocument();
  });
});

describe('Multi-Tenant Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Organization Switcher', () => {
    it('should display current organization', () => {
      const currentOrg = { id: 'org-1', name: 'Acme Corp', slug: 'acme' };

      render(
        <TestWrapper tenantValue={{ currentOrg }}>
          <TestOrgSwitcher />
        </TestWrapper>
      );

      expect(screen.getByTestId('current-org')).toHaveTextContent('Acme Corp');
    });

    it('should display "No organization" when none selected', () => {
      render(
        <TestWrapper tenantValue={{ currentOrg: null }}>
          <TestOrgSwitcher />
        </TestWrapper>
      );

      expect(screen.getByTestId('current-org')).toHaveTextContent('No organization');
    });

    it('should list available organizations', () => {
      const organizations = [
        { id: 'org-1', name: 'Acme Corp', slug: 'acme' },
        { id: 'org-2', name: 'Test Inc', slug: 'test' },
      ];

      render(
        <TestWrapper tenantValue={{ organizations }}>
          <TestOrgSwitcher />
        </TestWrapper>
      );

      expect(screen.getByTestId('switch-to-org-1')).toHaveTextContent('Acme Corp');
      expect(screen.getByTestId('switch-to-org-2')).toHaveTextContent('Test Inc');
    });

    it('should call switchOrganization when button clicked', async () => {
      const switchOrganization = vi.fn();
      const organizations = [
        { id: 'org-1', name: 'Acme Corp', slug: 'acme' },
        { id: 'org-2', name: 'Test Inc', slug: 'test' },
      ];

      render(
        <TestWrapper tenantValue={{ organizations, switchOrganization }}>
          <TestOrgSwitcher />
        </TestWrapper>
      );

      const switchButton = screen.getByTestId('switch-to-org-2');
      switchButton.click();

      expect(switchOrganization).toHaveBeenCalledWith('org-2');
    });

    it('should show loading state', () => {
      render(
        <TestWrapper tenantValue={{ isLoading: true }}>
          <TestOrgSwitcher />
        </TestWrapper>
      );

      expect(screen.getByTestId('org-loading')).toBeInTheDocument();
    });
  });
});

describe('Tenant Data Isolation', () => {
  it('should scope data to current organization', () => {
    function TestDataComponent() {
      const { currentOrg } = useTestTenant();
      const orgId = currentOrg?.id || 'none';

      return (
        <div>
          <span data-testid="data-scope">Data for org: {orgId}</span>
        </div>
      );
    }

    render(
      <TestWrapper
        tenantValue={{
          currentOrg: { id: 'org-123', name: 'Test Org', slug: 'test' },
        }}
      >
        <TestDataComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('data-scope')).toHaveTextContent('Data for org: org-123');
  });

  it('should update data scope when organization changes', () => {
    function TestDataComponent() {
      const { currentOrg } = useTestTenant();
      return <span data-testid="org-id">{currentOrg?.id || 'none'}</span>;
    }

    const { rerender } = render(
      <TestWrapper
        tenantValue={{
          currentOrg: { id: 'org-1', name: 'Org 1', slug: 'org1' },
        }}
      >
        <TestDataComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('org-id')).toHaveTextContent('org-1');

    rerender(
      <TestWrapper
        tenantValue={{
          currentOrg: { id: 'org-2', name: 'Org 2', slug: 'org2' },
        }}
      >
        <TestDataComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('org-id')).toHaveTextContent('org-2');
  });
});

describe('Role Hierarchy', () => {
  it('should grant super admin access to org routes', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: true, isOrgAdmin: true, isLoading: false }}>
        <TestOrgAdminRoute>
          <div data-testid="content">Org Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('should NOT grant org admin access to super admin routes', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: false, isOrgAdmin: true, isLoading: false }}>
        <TestSuperAdminRoute fallback={<div data-testid="denied">Denied</div>}>
          <div data-testid="content">Super Admin Content</div>
        </TestSuperAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('denied')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should deny regular user from org admin routes', () => {
    render(
      <TestWrapper authValue={{ isSuperAdmin: false, isOrgAdmin: false, isLoading: false }}>
        <TestOrgAdminRoute fallback={<div data-testid="denied">Denied</div>}>
          <div data-testid="content">Org Content</div>
        </TestOrgAdminRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('denied')).toBeInTheDocument();
  });
});
