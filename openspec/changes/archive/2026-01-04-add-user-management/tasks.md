# Tasks: Add User Management Feature

## Phase 1: Server Integration

### 1.1 better-auth Plugin Setup
- [x] 1.1.1 Add `admin` plugin to `apps/server/src/auth/auth.ts`
- [x] 1.1.2 Configure admin plugin options (defaultRole, adminRoles, impersonationSessionDuration)
- [x] 1.1.3 Verify `organization` plugin is already configured (should exist)
- [x] 1.1.4 Run database migration to add admin-related fields

### 1.2 Database Schema Verification
- [x] 1.2.1 Verify `user` table has new fields: `role`, `banned`, `banReason`, `banExpires`
- [x] 1.2.2 Verify `session` table has `impersonatedBy` field
- [x] 1.2.3 Document schema changes in relevant spec

### 1.3 Guard Chain for Layer 2 Security
- [x] 1.3.1 Create `SuperAdminGuard` - verify caller has admin/super-admin role or is in adminUserIds
- [x] 1.3.2 Create `TenantContextGuard` - verify caller is member of X-Tenant-Id tenant (or platform-admin)
- [x] 1.3.3 Create `TargetUserGuard` - extract userId from params/query/body, verify target is active member
- [x] 1.3.4 Create `MembershipService.getMembership(userId, tenantId)` utility
- [x] 1.3.5 Apply Guard Chain to all admin.* endpoints: `@UseGuards(AuthGuard, SuperAdminGuard, TenantContextGuard, TargetUserGuard)`
- [x] 1.3.6 Return 403 Forbidden for RBAC/tenant/target violations
- [x] 1.3.7 Log all violations to audit log (unauthorized_admin_access, tenant_context_violation, cross_tenant_operation)

### 1.4 Tenant-Level Ban Service
- [x] 1.4.1 Add `status`, `banReason`, `banExpires` fields to membership table
- [x] 1.4.2 Create `TenantBanService.banUserInTenant()` - update membership.status to 'banned'
- [x] 1.4.3 Create `TenantBanService.unbanUserInTenant()` - update membership.status to 'active'
- [x] 1.4.4 Revoke tenant-specific sessions on ban

### 1.5 Audit Logging Infrastructure
- [x] 1.5.1 Create `AuditLogEntry` schema with action, success, adminId, targetUserId, tenantId, details, ipAddress, userAgent, requestId
- [x] 1.5.2 Create `@Audited(action)` decorator for automatic success/failure logging
- [x] 1.5.3 Apply `@Audited` to all admin.* and organization.* endpoints

### 1.6 Rate Limiting
- [x] 1.6.1 Create `AdminRateLimitGuard` with configurable limits per action
- [x] 1.6.2 Configure limits: ban (10/min), impersonate (5/5min), delete (3/5min), password_reset (10/min)
- [x] 1.6.3 Log rate limit violations to audit log

---

## Phase 2: Client Integration

### 2.1 Auth Client Update
- [x] 2.1.1 Add `adminClient` plugin to `apps/admin/src/lib/auth-client.ts`
- [x] 2.1.2 Verify `organizationClient` plugin is already configured
- [x] 2.1.3 Export admin-related hooks and methods

---

## Phase 3: Layer 1 - Tenant Member Management UI

> Uses `organization.*` APIs. All operations scoped to current tenant.

### 3.1 Member List Page
- [x] 3.1.1 Create `apps/admin/src/pages/Members.tsx` page component
- [x] 3.1.2 Implement member list with DataTable using `organization.listMembers()`
- [x] 3.1.3 Add search functionality (by name, email)
- [x] 3.1.4 Add filter functionality (by role)
- [x] 3.1.5 Add pagination support
- [x] 3.1.6 Add route for `/members` in router
- [x] 3.1.7 Add "Members" item to sidebar navigation

### 3.2 Invite Member
- [x] 3.2.1 Add "Invite Member" button to member list page
- [x] 3.2.2 Implement invite member dialog/modal
- [x] 3.2.3 Form fields: email, role (member/admin)
- [x] 3.2.4 Call `organization.inviteMember()` API
- [x] 3.2.5 Show pending invitations list
- [x] 3.2.6 Implement resend invitation

### 3.3 Remove Member
- [x] 3.3.1 Add remove member action to member list row
- [x] 3.3.2 Implement confirmation dialog
- [x] 3.3.3 Call `organization.removeMember()` API
- [x] 3.3.4 Prevent removing last owner

### 3.4 Update Member Role
- [x] 3.4.1 Add role selector to member list/detail
- [x] 3.4.2 Call `organization.updateMemberRole()` API
- [x] 3.4.3 Show current role with update confirmation

### 3.5 Member Detail Page
- [x] 3.5.1 Create `apps/admin/src/pages/MemberDetail.tsx` page component
- [x] 3.5.2 Display member profile information
- [x] 3.5.3 Show organization role and createdAt
- [x] 3.5.4 Add route for `/members/:memberId`

---

## Phase 4: Layer 2 - Super Admin Operations UI

> Uses `admin.*` APIs. Requires global admin role. All operations protected by TenantGuard.

### 4.1 Ban/Unban User (Tenant-Level)
- [x] 4.1.1 Add ban/unban action buttons to member detail (super-admin only)
- [x] 4.1.2 Implement ban dialog with reason and duration options
- [x] 4.1.3 Call `TenantBanService.banUserInTenant()` API (NOT admin.banUser)
- [x] 4.1.4 Show banned status indicator in member list (membership.status = 'banned')

### 4.2 Session Management
- [x] 4.2.1 Display user's active sessions list on member detail (super-admin only)
- [x] 4.2.2 Implement revoke single session
- [x] 4.2.3 Implement revoke all sessions button
- [x] 4.2.4 Call `admin.listUserSessions()` and `admin.revokeUserSessions()` APIs

### 4.3 Global Role Management
- [x] 4.3.1 Add global role selector (super-admin only)
- [x] 4.3.2 Call `admin.setRole()` API
- [x] 4.3.3 Show both organization role and global role on member detail

### 4.4 Password Management
- [x] 4.4.1 Add "Reset Password" button on member detail (super-admin only)
- [x] 4.4.2 Implement password reset dialog
- [x] 4.4.3 Call `admin.setUserPassword()` API

### 4.5 Delete User (Platform-Admin Only)
- [x] 4.5.1 Add delete user action with confirmation dialog (platform-admin only, NOT super-admin)
- [x] 4.5.2 Call `admin.removeUser()` API (requires platform-admin role)
- [x] 4.5.3 Handle cascading effects (sessions, memberships)
- [x] 4.5.4 Show "Remove from tenant" option for super-admin (uses organization.removeMember)

---

## Phase 5: User Impersonation (Layer 2)

### 5.1 Impersonation Feature
- [x] 5.1.1 Add "Impersonate" button on member detail page (super-admin only)
- [x] 5.1.2 Implement impersonation confirmation modal
- [x] 5.1.3 Call `admin.impersonateUser()` API
- [x] 5.1.4 Add impersonation indicator in UI header
- [x] 5.1.5 Add "Stop Impersonation" button
- [x] 5.1.6 Call `admin.stopImpersonating()` API

---

## Phase 6: Permission Integration

### 6.1 Route Protection
- [x] 6.1.1 Create `AdminRoute` component that checks for global admin role
- [x] 6.1.2 Create `OrgAdminRoute` component that checks for org admin role
- [x] 6.1.3 Wrap Layer 1 routes with OrgAdminRoute
- [x] 6.1.4 Wrap Layer 2 actions with AdminRoute checks

### 6.2 UI Conditional Rendering
- [x] 6.2.1 Hide Layer 2 actions for non-super-admin users
- [x] 6.2.2 Show appropriate error messages for unauthorized access
- [x] 6.2.3 Disable actions based on role permissions

---

## Phase 7: Testing & Validation

### 7.1 Layer 1 Testing (Tenant Member Management)
- [ ] 7.1.1 Test member list with search/filter/pagination
- [ ] 7.1.2 Test invite member flow
- [ ] 7.1.3 Test remove member (and last owner protection)
- [ ] 7.1.4 Test update member role
- [ ] 7.1.5 Verify org admin can perform Layer 1 operations
- [ ] 7.1.6 Verify member cannot perform Layer 1 admin operations

### 7.2 Layer 2 Testing (Super Admin Operations)
- [ ] 7.2.1 Test ban/unban flow
- [ ] 7.2.2 Test session listing and revocation
- [ ] 7.2.3 Test global role assignment
- [ ] 7.2.4 Test password reset
- [ ] 7.2.5 Test user deletion
- [ ] 7.2.6 Test user impersonation and stop

### 7.3 Guard Chain & Tenant Isolation Verification
- [ ] 7.3.1 Verify SuperAdminGuard rejects non-admin caller with 403
- [ ] 7.3.2 Verify TenantContextGuard rejects caller not in tenant with 403
- [ ] 7.3.3 Verify TenantContextGuard allows platform-admin cross-tenant access
- [ ] 7.3.4 Verify TargetUserGuard extracts userId from params/query/body
- [ ] 7.3.5 Verify TargetUserGuard rejects pending member with 403
- [ ] 7.3.6 Verify cross-tenant ban operation is rejected with 403
- [ ] 7.3.7 Verify cross-tenant impersonate operation is rejected with 403
- [ ] 7.3.8 Verify all violations are logged to audit log

### 7.4 Rate Limiting Verification
- [ ] 7.4.1 Verify ban rate limit (10/min) triggers 429
- [ ] 7.4.2 Verify impersonate rate limit (5/5min) triggers 429
- [ ] 7.4.3 Verify delete rate limit (3/5min) triggers 429
- [ ] 7.4.4 Verify rate limit violations are logged

### 7.5 Access Control Verification
- [ ] 7.5.1 Verify non-admin cannot access admin endpoints
- [ ] 7.5.2 Verify org-admin cannot perform Layer 2 operations
- [ ] 7.5.3 Verify super-admin cannot delete user globally (only platform-admin can)
- [ ] 7.5.4 Verify admin cannot impersonate super-admin (by default)

---

## Dependencies

- Phase 2 depends on Phase 1 completion
- Phase 3-5 depend on Phase 2 completion
- Phase 6 runs parallel with Phase 3-5
- Phase 7 requires all other phases complete

## Layer Summary

| Layer | Plugin | Scope | Who Can Use |
|-------|--------|-------|-------------|
| Layer 1 | `organization` | Tenant-scoped | Org admin, Org owner |
| Layer 2 | `admin` | Global (guarded) | Super admin only |
