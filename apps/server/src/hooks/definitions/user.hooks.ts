/**
 * User and Auth Hooks
 *
 * Hook definitions for User lifecycle and Authentication.
 */

import { HookDefinition } from '../hook.types';

export const USER_HOOKS: HookDefinition[] = [
  // Registration
  {
    id: 'user.beforeRegister',
    type: 'filter',
    description: 'Before registration - invite code, blacklist',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterRegister',
    type: 'action',
    description: 'After registration - welcome email, CRM',
    defaultTimeout: 10000,
  },

  // Login/Logout
  {
    id: 'user.beforeLogin',
    type: 'filter',
    description: 'Before login - 2FA, IP ban',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterLogin',
    type: 'action',
    description: 'After login - audit log',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onLoginFailed',
    type: 'action',
    description: 'Login failed - security alert',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onLogout',
    type: 'action',
    description: 'On logout - clear session',
    defaultTimeout: 3000,
  },

  // Session/Token
  {
    id: 'auth.session.transform',
    type: 'filter',
    description: 'Generate token - inject custom claims',
    defaultTimeout: 3000,
  },

  // Password
  {
    id: 'auth.password.request',
    type: 'action',
    description: 'Password reset request',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onPasswordChange',
    type: 'action',
    description: 'Password changed - force logout',
    defaultTimeout: 5000,
  },

  // Profile
  {
    id: 'user.beforeUpdate',
    type: 'filter',
    description: 'Profile update before',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterUpdate',
    type: 'action',
    description: 'Profile update after - third-party sync',
    defaultTimeout: 5000,
  },

  // Account status
  {
    id: 'user.onBan',
    type: 'action',
    description: 'User banned',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onUnban',
    type: 'action',
    description: 'User unbanned',
    defaultTimeout: 5000,
  },

  // Role/Permission
  {
    id: 'user.onRoleChange',
    type: 'action',
    description: 'Role changed',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onPermissionChange',
    type: 'action',
    description: 'Permission changed',
    defaultTimeout: 5000,
  },
];
