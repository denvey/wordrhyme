/**
 * Permission Control Tests
 *
 * Tests for CASL-based permission system including:
 * - useAbility / useCan hooks with mock context
 * - Can component for declarative checks
 * - OrgAdminRoute protection
 * - Menu/button visibility based on permissions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMongoAbility, type MongoAbility } from '@casl/ability';
import { createContextualCan } from '@casl/react';
import React, { createContext, useContext, type ReactNode } from 'react';

// Mock React Router
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useNavigate: () => vi.fn(),
}));

// Define ability types (mirroring the real types)
type AppSubject =
  | 'all'
  | 'User'
  | 'Organization'
  | 'Content'
  | 'Menu'
  | 'Plugin'
  | 'Role'
  | 'Permission'
  | 'AuditLog'
  | 'Settings';

type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete';
type AppAbility = MongoAbility<[AppAction, AppSubject]>;

// Create test ability context
const TestAbilityContext = createContext<AppAbility>(createMongoAbility<[AppAction, AppSubject]>([]));

// Test Can component
const TestCan = createContextualCan(TestAbilityContext.Consumer);

// Test hooks
function useTestAbility(): AppAbility {
  return useContext(TestAbilityContext);
}

function useTestCan(action: AppAction, subject: AppSubject): boolean {
  const ability = useTestAbility();
  return ability.can(action, subject);
}

// Test wrapper
interface TestWrapperProps {
  children: ReactNode;
  rules?: Array<{ action: AppAction; subject: AppSubject }>;
}

function TestWrapper({ children, rules = [] }: TestWrapperProps) {
  const ability = createMongoAbility<[AppAction, AppSubject]>(rules);
  return (
    <TestAbilityContext.Provider value={ability}>
      {children}
    </TestAbilityContext.Provider>
  );
}

// Test components
function PermissionTestComponent({ action, subject }: { action: AppAction; subject: AppSubject }) {
  const can = useTestCan(action, subject);
  return <div data-testid="can-result">{can ? 'allowed' : 'denied'}</div>;
}

function AbilityTestComponent() {
  const ability = useTestAbility();
  return (
    <div data-testid="ability-result">
      {ability.can('read', 'Settings') ? 'can-read' : 'cannot-read'}
    </div>
  );
}

function MultiPermissionTestComponent() {
  const ability = useTestAbility();
  const canReadSettings = ability.can('read', 'Settings');
  const canManageOrg = ability.can('manage', 'Organization');
  const canDeleteUser = ability.can('delete', 'User');

  return (
    <div>
      <span data-testid="read-settings">{canReadSettings ? 'yes' : 'no'}</span>
      <span data-testid="manage-org">{canManageOrg ? 'yes' : 'no'}</span>
      <span data-testid="delete-user">{canDeleteUser ? 'yes' : 'no'}</span>
    </div>
  );
}

// Test OrgAdminRoute component
function TestOrgAdminRoute({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const canManage = useTestCan('manage', 'Organization');

  if (!canManage) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <div data-testid="navigate" data-to="/" />;
  }

  return <>{children}</>;
}

describe('Permission Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CASL Ability', () => {
    it('should create ability with rules', () => {
      const ability = createMongoAbility<[AppAction, AppSubject]>([
        { action: 'read', subject: 'Settings' },
      ]);

      expect(ability.can('read', 'Settings')).toBe(true);
      expect(ability.can('update', 'Settings')).toBe(false);
    });

    it('should handle manage action as wildcard', () => {
      const ability = createMongoAbility<[AppAction, AppSubject]>([
        { action: 'manage', subject: 'Settings' },
      ]);

      expect(ability.can('read', 'Settings')).toBe(true);
      expect(ability.can('update', 'Settings')).toBe(true);
      expect(ability.can('delete', 'Settings')).toBe(true);
    });

    it('should handle all subject as wildcard', () => {
      const ability = createMongoAbility<[AppAction, AppSubject]>([
        { action: 'manage', subject: 'all' },
      ]);

      expect(ability.can('read', 'Settings')).toBe(true);
      expect(ability.can('delete', 'User')).toBe(true);
      expect(ability.can('manage', 'Plugin')).toBe(true);
    });

    it('should deny ungranted permissions', () => {
      const ability = createMongoAbility<[AppAction, AppSubject]>([
        { action: 'read', subject: 'Settings' },
      ]);

      expect(ability.can('delete', 'User')).toBe(false);
      expect(ability.can('manage', 'Organization')).toBe(false);
    });
  });

  describe('useAbility hook', () => {
    it('should return ability from context', () => {
      render(
        <TestWrapper rules={[{ action: 'read', subject: 'Settings' }]}>
          <AbilityTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('ability-result')).toHaveTextContent('can-read');
    });

    it('should return empty ability when no rules', () => {
      render(
        <TestWrapper rules={[]}>
          <AbilityTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('ability-result')).toHaveTextContent('cannot-read');
    });
  });

  describe('useCan hook', () => {
    it('should return true when user has permission', () => {
      render(
        <TestWrapper rules={[{ action: 'read', subject: 'Settings' }]}>
          <PermissionTestComponent action="read" subject="Settings" />
        </TestWrapper>
      );

      expect(screen.getByTestId('can-result')).toHaveTextContent('allowed');
    });

    it('should return false when user lacks permission', () => {
      render(
        <TestWrapper rules={[]}>
          <PermissionTestComponent action="manage" subject="Settings" />
        </TestWrapper>
      );

      expect(screen.getByTestId('can-result')).toHaveTextContent('denied');
    });

    it('should handle manage action as wildcard', () => {
      render(
        <TestWrapper rules={[{ action: 'manage', subject: 'Settings' }]}>
          <PermissionTestComponent action="read" subject="Settings" />
        </TestWrapper>
      );

      expect(screen.getByTestId('can-result')).toHaveTextContent('allowed');
    });

    it('should handle all subject as wildcard', () => {
      render(
        <TestWrapper rules={[{ action: 'manage', subject: 'all' }]}>
          <PermissionTestComponent action="delete" subject="User" />
        </TestWrapper>
      );

      expect(screen.getByTestId('can-result')).toHaveTextContent('allowed');
    });
  });

  describe('Multiple permissions check', () => {
    it('should check multiple permissions at once', () => {
      render(
        <TestWrapper
          rules={[
            { action: 'read', subject: 'Settings' },
            { action: 'manage', subject: 'Organization' },
          ]}
        >
          <MultiPermissionTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('read-settings')).toHaveTextContent('yes');
      expect(screen.getByTestId('manage-org')).toHaveTextContent('yes');
      expect(screen.getByTestId('delete-user')).toHaveTextContent('no');
    });
  });

  describe('Can component', () => {
    it('should render children when permission is granted', () => {
      render(
        <TestWrapper rules={[{ action: 'update', subject: 'Settings' }]}>
          <TestCan I="update" a="Settings">
            <button data-testid="settings-btn">Update Settings</button>
          </TestCan>
        </TestWrapper>
      );

      expect(screen.getByTestId('settings-btn')).toBeInTheDocument();
    });

    it('should not render children when permission is denied', () => {
      render(
        <TestWrapper rules={[]}>
          <TestCan I="delete" a="User">
            <button data-testid="delete-btn">Delete User</button>
          </TestCan>
        </TestWrapper>
      );

      expect(screen.queryByTestId('delete-btn')).not.toBeInTheDocument();
    });

    it('should render fallback when permission is denied using passThrough', () => {
      render(
        <TestWrapper rules={[]}>
          <TestCan I="manage" a="Settings" passThrough>
            {(allowed: boolean) =>
              allowed ? (
                <button>Manage</button>
              ) : (
                <span data-testid="no-access">No Access</span>
              )
            }
          </TestCan>
        </TestWrapper>
      );

      expect(screen.getByTestId('no-access')).toBeInTheDocument();
    });
  });

  describe('OrgAdminRoute', () => {
    it('should render children when user can manage organization', () => {
      render(
        <TestWrapper rules={[{ action: 'manage', subject: 'Organization' }]}>
          <TestOrgAdminRoute>
            <div data-testid="admin-content">Admin Content</div>
          </TestOrgAdminRoute>
        </TestWrapper>
      );

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });

    it('should redirect when user cannot manage organization', () => {
      render(
        <TestWrapper rules={[]}>
          <TestOrgAdminRoute>
            <div data-testid="admin-content">Admin Content</div>
          </TestOrgAdminRoute>
        </TestWrapper>
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/');
    });

    it('should render fallback when provided and permission denied', () => {
      render(
        <TestWrapper rules={[]}>
          <TestOrgAdminRoute fallback={<div data-testid="access-denied">Access Denied</div>}>
            <div data-testid="admin-content">Admin Content</div>
          </TestOrgAdminRoute>
        </TestWrapper>
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
    });
  });

  describe('Menu Visibility', () => {
    function MenuComponent() {
      return (
        <nav>
          <TestCan I="read" a="Settings">
            <a data-testid="settings-link" href="/settings">
              Settings
            </a>
          </TestCan>
          <TestCan I="manage" a="User">
            <a data-testid="users-link" href="/users">
              Users
            </a>
          </TestCan>
          <TestCan I="read" a="AuditLog">
            <a data-testid="audit-link" href="/audit">
              Audit Log
            </a>
          </TestCan>
          <TestCan I="manage" a="Plugin">
            <a data-testid="plugins-link" href="/plugins">
              Plugins
            </a>
          </TestCan>
        </nav>
      );
    }

    it('should show only permitted menu items', () => {
      render(
        <TestWrapper
          rules={[
            { action: 'read', subject: 'Settings' },
            { action: 'read', subject: 'AuditLog' },
          ]}
        >
          <MenuComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('settings-link')).toBeInTheDocument();
      expect(screen.getByTestId('audit-link')).toBeInTheDocument();
      expect(screen.queryByTestId('users-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('plugins-link')).not.toBeInTheDocument();
    });

    it('should show all menu items for super admin', () => {
      render(
        <TestWrapper rules={[{ action: 'manage', subject: 'all' }]}>
          <MenuComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('settings-link')).toBeInTheDocument();
      expect(screen.getByTestId('users-link')).toBeInTheDocument();
      expect(screen.getByTestId('audit-link')).toBeInTheDocument();
      expect(screen.getByTestId('plugins-link')).toBeInTheDocument();
    });

    it('should hide all menu items for user with no permissions', () => {
      render(
        <TestWrapper rules={[]}>
          <MenuComponent />
        </TestWrapper>
      );

      expect(screen.queryByTestId('settings-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('users-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('audit-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('plugins-link')).not.toBeInTheDocument();
    });
  });

  describe('Button Visibility', () => {
    function ActionButtonsComponent() {
      return (
        <div>
          <TestCan I="create" a="Content">
            <button data-testid="create-btn">Create</button>
          </TestCan>
          <TestCan I="update" a="Content">
            <button data-testid="edit-btn">Edit</button>
          </TestCan>
          <TestCan I="delete" a="Content">
            <button data-testid="delete-btn">Delete</button>
          </TestCan>
        </div>
      );
    }

    it('should show create button only for users with create permission', () => {
      render(
        <TestWrapper rules={[{ action: 'create', subject: 'Content' }]}>
          <ActionButtonsComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('create-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-btn')).not.toBeInTheDocument();
    });

    it('should show all buttons for content manager', () => {
      render(
        <TestWrapper rules={[{ action: 'manage', subject: 'Content' }]}>
          <ActionButtonsComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('create-btn')).toBeInTheDocument();
      expect(screen.getByTestId('edit-btn')).toBeInTheDocument();
      expect(screen.getByTestId('delete-btn')).toBeInTheDocument();
    });
  });

  describe('Page Access Control', () => {
    function ProtectedPage({
      requiredAction,
      requiredSubject,
    }: {
      requiredAction: AppAction;
      requiredSubject: AppSubject;
    }) {
      const canAccess = useTestCan(requiredAction, requiredSubject);

      if (!canAccess) {
        return <div data-testid="forbidden">403 Forbidden</div>;
      }

      return <div data-testid="page-content">Page Content</div>;
    }

    it('should show page content when authorized', () => {
      render(
        <TestWrapper rules={[{ action: 'read', subject: 'Settings' }]}>
          <ProtectedPage requiredAction="read" requiredSubject="Settings" />
        </TestWrapper>
      );

      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });

    it('should show 403 when unauthorized', () => {
      render(
        <TestWrapper rules={[]}>
          <ProtectedPage requiredAction="manage" requiredSubject="Role" />
        </TestWrapper>
      );

      expect(screen.getByTestId('forbidden')).toBeInTheDocument();
    });
  });
});

describe('Role-Based Access Scenarios', () => {
  it('should handle viewer role (read-only)', () => {
    render(
      <TestWrapper
        rules={[
          { action: 'read', subject: 'Content' },
          { action: 'read', subject: 'Settings' },
        ]}
      >
        <div>
          <PermissionTestComponent action="read" subject="Content" />
          <PermissionTestComponent action="update" subject="Content" />
        </div>
      </TestWrapper>
    );

    const results = screen.getAllByTestId('can-result');
    expect(results[0]).toHaveTextContent('allowed'); // read
    expect(results[1]).toHaveTextContent('denied'); // update
  });

  it('should handle editor role (read + update)', () => {
    render(
      <TestWrapper
        rules={[
          { action: 'read', subject: 'Content' },
          { action: 'update', subject: 'Content' },
          { action: 'create', subject: 'Content' },
        ]}
      >
        <PermissionTestComponent action="delete" subject="Content" />
      </TestWrapper>
    );

    expect(screen.getByTestId('can-result')).toHaveTextContent('denied');
  });

  it('should handle admin role (manage all)', () => {
    render(
      <TestWrapper rules={[{ action: 'manage', subject: 'all' }]}>
        <PermissionTestComponent action="delete" subject="User" />
      </TestWrapper>
    );

    expect(screen.getByTestId('can-result')).toHaveTextContent('allowed');
  });

  it('should handle resource-specific admin', () => {
    render(
      <TestWrapper
        rules={[
          { action: 'manage', subject: 'Content' },
          { action: 'read', subject: 'Settings' },
        ]}
      >
        <div>
          <PermissionTestComponent action="delete" subject="Content" />
          <PermissionTestComponent action="update" subject="Settings" />
        </div>
      </TestWrapper>
    );

    const results = screen.getAllByTestId('can-result');
    expect(results[0]).toHaveTextContent('allowed'); // delete content
    expect(results[1]).toHaveTextContent('denied'); // update settings
  });
});

describe('Permission Inheritance', () => {
  it('manage includes all CRUD actions', () => {
    const ability = createMongoAbility<[AppAction, AppSubject]>([
      { action: 'manage', subject: 'Content' },
    ]);

    expect(ability.can('create', 'Content')).toBe(true);
    expect(ability.can('read', 'Content')).toBe(true);
    expect(ability.can('update', 'Content')).toBe(true);
    expect(ability.can('delete', 'Content')).toBe(true);
  });

  it('manage on all subject applies to all resources', () => {
    const ability = createMongoAbility<[AppAction, AppSubject]>([
      { action: 'manage', subject: 'all' },
    ]);

    expect(ability.can('manage', 'Content')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(true);
    expect(ability.can('manage', 'Settings')).toBe(true);
    expect(ability.can('manage', 'Plugin')).toBe(true);
    expect(ability.can('manage', 'Organization')).toBe(true);
  });

  it('specific permission does not grant other permissions', () => {
    const ability = createMongoAbility<[AppAction, AppSubject]>([
      { action: 'read', subject: 'Content' },
    ]);

    expect(ability.can('read', 'Content')).toBe(true);
    expect(ability.can('create', 'Content')).toBe(false);
    expect(ability.can('update', 'Content')).toBe(false);
    expect(ability.can('delete', 'Content')).toBe(false);
    expect(ability.can('read', 'Settings')).toBe(false);
  });
});
