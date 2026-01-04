# user-management Specification

## Purpose

Provide comprehensive user management capabilities with two layers:
1. **Tenant Member Management** - Organization admins manage members within their tenant using `organization.*` APIs
2. **Super Admin Operations** - Global admins perform cross-cutting operations using `admin.*` APIs

---

# Layer 1: Tenant Member Management

> Uses `better-auth/organization` plugin. All operations are scoped to the current tenant (organization).

---

## ADDED Requirements

### Requirement: List Tenant Members

Organization admins SHALL be able to list all members within their current tenant with support for search, filtering, sorting, and pagination.

#### Scenario: List members with default pagination
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.listMembers({ organizationId: "tenant-A" })`
- **THEN** the first 100 members of tenant-A are returned
- **AND** the response includes `total`, `limit`, and `offset` metadata

#### Scenario: Search members by name
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.listMembers({ filterField: 'name', filterValue: 'John', filterOperator: 'contains' })`
- **THEN** only members from tenant-A whose name contains "John" are returned

#### Scenario: Filter members by role
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.listMembers({ filterField: 'role', filterValue: 'admin', filterOperator: 'eq' })`
- **THEN** only members from tenant-A with role "admin" are returned

#### Scenario: Paginate through members
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.listMembers({ limit: 10, offset: 20 })`
- **THEN** members 21-30 from tenant-A are returned (if they exist)

---

### Requirement: Invite Member to Tenant

Organization admins SHALL be able to invite new members to their tenant via email. Invited users receive an email and must accept the invitation to join.

#### Scenario: Invite member successfully
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.inviteMember({ email: 'user@example.com', role: 'member' })`
- **THEN** an invitation is created
- **AND** an email is sent to the user
- **AND** the invitation status is "pending"

#### Scenario: Invite member with specific role
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.inviteMember({ email: 'user@example.com', role: 'admin' })`
- **THEN** the invitation is created with role "admin"
- **AND** upon acceptance, the user joins as admin

#### Scenario: Resend invitation
- **GIVEN** an existing pending invitation for "user@example.com"
- **WHEN** an admin calls `organization.inviteMember({ email: 'user@example.com', resend: true })`
- **THEN** a new invitation email is sent
- **AND** the previous invitation is invalidated

#### Scenario: Invite duplicate email fails
- **GIVEN** "user@example.com" is already a member of tenant-A
- **WHEN** an admin calls `organization.inviteMember({ email: 'user@example.com' })`
- **THEN** the operation fails with a conflict error

---

### Requirement: Add Member Directly (Server-Only)

Server-side code SHALL be able to add members directly without invitation flow. This is for programmatic member creation.

#### Scenario: Add member directly
- **GIVEN** current tenant_id = "tenant-A"
- **AND** user with userId exists in the system
- **WHEN** server calls `organization.addMember({ userId, role: 'member' })`
- **THEN** the user is immediately added to tenant-A as a member

---

### Requirement: Remove Member from Tenant

Organization admins SHALL be able to remove members from their tenant. Removed members lose access to the tenant but their user account remains.

#### Scenario: Remove member successfully
- **GIVEN** current tenant_id = "tenant-A"
- **AND** user is a member of tenant-A
- **WHEN** an admin calls `organization.removeMember({ memberIdOrEmail: userId })`
- **THEN** the user is removed from tenant-A
- **AND** the user loses access to tenant-A resources
- **AND** the user account still exists

#### Scenario: Remove member by email
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.removeMember({ memberIdOrEmail: 'user@example.com' })`
- **THEN** the member with that email is removed from tenant-A

#### Scenario: Cannot remove last owner
- **GIVEN** current tenant_id = "tenant-A"
- **AND** user is the only owner of tenant-A
- **WHEN** an admin calls `organization.removeMember({ memberIdOrEmail: userId })`
- **THEN** the operation fails
- **AND** an error message indicates "Cannot remove the last owner"

---

### Requirement: Update Member Role within Tenant

Organization admins SHALL be able to change member roles within their tenant. This controls what the member can do within the organization.

#### Scenario: Update member role to admin
- **GIVEN** current tenant_id = "tenant-A"
- **AND** user is a member of tenant-A with role "member"
- **WHEN** an admin calls `organization.updateMemberRole({ memberId, role: 'admin' })`
- **THEN** the user's role in tenant-A is updated to "admin"

#### Scenario: Demote admin to member
- **GIVEN** current tenant_id = "tenant-A"
- **AND** user is an admin of tenant-A
- **WHEN** an owner calls `organization.updateMemberRole({ memberId, role: 'member' })`
- **THEN** the user's role is changed to "member"

#### Scenario: Non-admin cannot change roles
- **GIVEN** current tenant_id = "tenant-A"
- **AND** current user has role "member"
- **WHEN** the user calls `organization.updateMemberRole({ memberId, role: 'admin' })`
- **THEN** the operation is rejected with 403 Forbidden

---

### Requirement: Get Member Details

Organization admins SHALL be able to view detailed information about members in their tenant.

#### Scenario: Get active member info
- **WHEN** a user calls `organization.getActiveMember()`
- **THEN** the current user's member record in the active organization is returned
- **AND** includes role, createdAt, and other member fields

#### Scenario: Get full organization with members
- **GIVEN** current tenant_id = "tenant-A"
- **WHEN** an admin calls `organization.getFullOrganization({ organizationId: "tenant-A" })`
- **THEN** the organization details are returned
- **AND** includes a list of members (up to membersLimit)

---

# Layer 2: Super Admin Operations

> Uses `better-auth/admin` plugin. These are global operations that require super-admin privileges. All operations MUST include tenant isolation checks at the backend.

---

### Requirement: User Ban Management (Tenant-Level)

Super admins SHALL be able to ban users within their tenant. Bans are tenant-scoped (via membership.status), NOT global. A banned user loses access to the specific tenant but can still access other tenants they belong to.

#### Scenario: Ban user in tenant permanently
- **GIVEN** super-admin is authenticated
- **AND** target user belongs to the same tenant
- **WHEN** super-admin calls tenant ban API
- **THEN** the user's membership.status is set to "banned"
- **AND** the banReason is stored on membership record
- **AND** all user sessions for THIS tenant are revoked
- **AND** the user cannot access this tenant
- **AND** the user CAN still access other tenants they belong to

#### Scenario: Ban user temporarily
- **WHEN** super-admin calls tenant ban API with expiresIn: 604800 (7 days)
- **THEN** the user is banned from this tenant for 7 days
- **AND** the membership.banExpires timestamp is set
- **AND** after 7 days, the user can access this tenant again

#### Scenario: Banned user attempts to access tenant
- **GIVEN** user has membership.status = "banned" in tenant-A
- **WHEN** the user attempts to access tenant-A resources
- **THEN** the access is rejected with 403 Forbidden
- **AND** an appropriate error message is shown

#### Scenario: Unban user in tenant
- **WHEN** super-admin calls tenant unban API
- **THEN** the user's membership.status is set to "active"
- **AND** banReason and banExpires are cleared
- **AND** the user can access this tenant again

---

### Requirement: User Impersonation

Super admins SHALL be able to impersonate users for customer support purposes. Impersonation creates a temporary session that acts as the target user.

#### Scenario: Impersonate user
- **GIVEN** super-admin is authenticated
- **AND** target user belongs to the same tenant
- **WHEN** super-admin calls `admin.impersonateUser({ userId })`
- **THEN** a new session is created that acts as the target user
- **AND** the `impersonatedBy` field records the admin's user ID
- **AND** the session expires after 1 hour (configurable)

#### Scenario: Impersonate admin user blocked by default
- **WHEN** super-admin attempts to impersonate another admin user
- **AND** `allowImpersonatingAdmins` is false (default)
- **THEN** the operation is rejected
- **AND** an audit log entry is created

#### Scenario: Stop impersonation
- **WHEN** super-admin calls `admin.stopImpersonating()`
- **THEN** the impersonation session is ended
- **AND** the admin is returned to their original session

---

### Requirement: Session Management

Super admins SHALL be able to view and manage user sessions across the system.

#### Scenario: List user sessions
- **GIVEN** target user belongs to the same tenant
- **WHEN** super-admin calls `admin.listUserSessions({ userId })`
- **THEN** all active sessions for the user are returned
- **AND** each session includes creation time, last activity, and device info

#### Scenario: Revoke single session
- **WHEN** super-admin calls `admin.revokeUserSession({ sessionToken })`
- **THEN** the specified session is invalidated
- **AND** the user is logged out on that device

#### Scenario: Revoke all user sessions
- **GIVEN** target user belongs to the same tenant
- **WHEN** super-admin calls `admin.revokeUserSessions({ userId })`
- **THEN** all sessions for the user are invalidated
- **AND** the user is logged out on all devices

---

### Requirement: Global Role Management

Super admins SHALL be able to set global system roles (admin/user) that determine access to admin operations.

#### Scenario: Set user as global admin
- **GIVEN** target user belongs to the same tenant
- **WHEN** super-admin calls `admin.setRole({ userId, role: 'admin' })`
- **THEN** the user's global role is updated to "admin"
- **AND** the user gains admin permissions

#### Scenario: Set multiple global roles
- **WHEN** super-admin calls `admin.setRole({ userId, role: ['admin', 'moderator'] })`
- **THEN** the user is assigned both roles
- **AND** roles are stored as comma-separated string

---

### Requirement: User Password Management

Super admins SHALL be able to set or reset user passwords.

#### Scenario: Set user password
- **GIVEN** target user belongs to the same tenant
- **WHEN** super-admin calls `admin.setUserPassword({ userId, newPassword })`
- **THEN** the user's password is updated
- **AND** existing sessions remain valid

#### Scenario: Password validation
- **WHEN** super-admin attempts to set a password that doesn't meet requirements
- **THEN** the operation fails with validation error

---

### Requirement: Remove Member vs Delete User

The system SHALL distinguish between two operations: removing a member from a tenant (preserves user account) and deleting a user permanently (destroys user account).

#### Scenario: Remove member from tenant (super-admin)
- **GIVEN** super-admin is authenticated in tenant-A
- **AND** target user is a member of tenant-A
- **WHEN** super-admin calls `organization.removeMember({ memberIdOrEmail: userId })`
- **THEN** the user is removed from tenant-A
- **AND** the user loses access to tenant-A resources
- **AND** the user account still exists
- **AND** the user can still access other tenants they belong to

#### Scenario: Delete user permanently (platform-admin only)
- **GIVEN** caller has role "platform-admin"
- **AND** target user exists in the system
- **WHEN** platform-admin calls `admin.removeUser({ userId })`
- **THEN** the user is permanently deleted from the database
- **AND** all associated sessions are revoked
- **AND** all organization memberships are removed
- **AND** an audit log entry is created

#### Scenario: Super-admin cannot delete user globally
- **GIVEN** caller has role "super-admin" (NOT platform-admin)
- **WHEN** caller attempts `admin.removeUser({ userId })`
- **THEN** the operation is rejected with 403 Forbidden
- **AND** error message indicates "Platform admin role required"

---

# Cross-Cutting Requirements

---

### Requirement: Guard Chain for Admin Operations

All Layer 2 admin operations MUST pass through a Guard Chain that enforces RBAC, caller tenant validation, and target user validation.

#### Scenario: Guard Chain execution order
- **GIVEN** a request to any admin.* endpoint
- **WHEN** the request is processed
- **THEN** guards execute in order: AuthGuard → SuperAdminGuard → TenantContextGuard → TargetUserGuard
- **AND** failure at any guard stops execution and returns appropriate error

#### Scenario: SuperAdminGuard rejects non-admin caller
- **GIVEN** caller has role "member" (not admin/super-admin)
- **AND** caller is NOT in adminUserIds config
- **WHEN** caller attempts any admin.* operation
- **THEN** the operation is rejected with 403 Forbidden
- **AND** audit log records "unauthorized_admin_access"

#### Scenario: TenantContextGuard rejects caller not in tenant
- **GIVEN** caller has role "super-admin"
- **AND** caller is NOT a member of tenant-A
- **AND** caller is NOT a platform-admin
- **WHEN** caller sends request with X-Tenant-Id: "tenant-A"
- **THEN** the operation is rejected with 403 Forbidden
- **AND** audit log records "tenant_context_violation"

#### Scenario: Platform-admin can operate across tenants
- **GIVEN** caller has role "platform-admin"
- **AND** caller is NOT a member of tenant-A
- **WHEN** caller sends request with X-Tenant-Id: "tenant-A"
- **THEN** TenantContextGuard passes
- **AND** operation proceeds to TargetUserGuard

#### Scenario: TargetUserGuard extracts userId from multiple sources
- **GIVEN** a request to admin.* endpoint
- **WHEN** userId is provided in path params (/users/:userId/ban)
- **THEN** TargetUserGuard extracts userId from params
- **WHEN** userId is provided in query (?userId=xxx)
- **THEN** TargetUserGuard extracts userId from query
- **WHEN** userId is provided in body ({ userId: 'xxx' })
- **THEN** TargetUserGuard extracts userId from body

#### Scenario: TargetUserGuard rejects pending member
- **GIVEN** target user has membership status "pending" in tenant-A
- **WHEN** super-admin attempts to ban/delete the user
- **THEN** the operation is rejected with 403 Forbidden
- **AND** error message indicates "Target user is not a member of this tenant"

---

### Requirement: Tenant Isolation for Admin Operations

All admin operations on users MUST verify that the target user belongs to the current tenant. Cross-tenant operations MUST be rejected at the backend level.

#### Scenario: Admin operation on same-tenant user succeeds
- **GIVEN** current tenant_id = "tenant-A"
- **AND** target user belongs to "tenant-A"
- **WHEN** super-admin calls `admin.banUser({ userId })`
- **THEN** the operation succeeds

#### Scenario: Admin operation on cross-tenant user is rejected
- **GIVEN** current tenant_id = "tenant-A"
- **AND** target user belongs to "tenant-B"
- **WHEN** super-admin calls `admin.banUser({ userId })`
- **THEN** the operation is rejected with 403 Forbidden
- **AND** an audit log entry is created with type "cross_tenant_violation"
- **AND** the target user is NOT affected

#### Scenario: Admin cannot impersonate cross-tenant user
- **GIVEN** current tenant_id = "tenant-A"
- **AND** target user belongs to "tenant-B"
- **WHEN** super-admin calls `admin.impersonateUser({ userId })`
- **THEN** the operation is rejected with 403 Forbidden

#### Scenario: Admin cannot revoke sessions for cross-tenant user
- **GIVEN** current tenant_id = "tenant-A"
- **AND** target user belongs to "tenant-B"
- **WHEN** super-admin calls `admin.revokeUserSessions({ userId })`
- **THEN** the operation is rejected with 403 Forbidden

---

### Requirement: Access Control

Operations SHALL be restricted based on user roles:
- **Organization Admin**: Can perform Layer 1 operations within their tenant
- **Super Admin**: Can perform Layer 1 + Layer 2 operations within their tenant

#### Scenario: Organization admin can manage members
- **GIVEN** user has role "admin" in organization
- **WHEN** user calls `organization.inviteMember()`
- **THEN** the operation is permitted

#### Scenario: Organization admin cannot ban users
- **GIVEN** user has role "admin" in organization but NOT global "admin" role
- **WHEN** user calls `admin.banUser()`
- **THEN** the operation is rejected with 403 Forbidden

#### Scenario: Super admin can perform all operations
- **GIVEN** user has global role "admin" or is in `adminUserIds`
- **WHEN** user calls any admin.* or organization.* API
- **THEN** the operation is permitted (subject to tenant isolation)

---

### Requirement: Comprehensive Audit Logging

All operations that modify user data or memberships SHALL be logged with both success and failure outcomes.

#### Scenario: Successful operation logged
- **WHEN** any admin.* or organization.* operation succeeds
- **THEN** an audit log entry is created with success: true
- **AND** includes: action, adminId, adminRole, targetUserId, tenantId, duration, ipAddress, userAgent, requestId

#### Scenario: Failed operation logged
- **WHEN** any admin.* or organization.* operation fails
- **THEN** an audit log entry is created with success: false
- **AND** includes: action, failureReason, adminId, targetUserId, tenantId, ipAddress, userAgent, requestId

#### Scenario: Member invitation logged
- **WHEN** an admin invites a member
- **THEN** an audit log entry is created with action "member.invite"

#### Scenario: Member removal logged
- **WHEN** an admin removes a member
- **THEN** an audit log entry is created with action "member.remove"

#### Scenario: Ban user logged
- **WHEN** a super-admin bans a user
- **THEN** an audit log entry is created with action "user.ban"
- **AND** the entry includes the ban reason and expiry

#### Scenario: Impersonation logged
- **WHEN** a super-admin impersonates a user
- **THEN** an audit log entry is created with action "user.impersonate_start"
- **AND** the entry includes both admin ID and impersonated user ID

#### Scenario: Cross-tenant violation logged
- **WHEN** any cross-tenant operation is attempted
- **THEN** an audit log entry is created with action "security.cross_tenant_attempt"
- **AND** includes the admin ID, target user ID, and attempted action

---

### Requirement: Rate Limiting for Sensitive Operations

Sensitive admin operations SHALL be rate-limited to prevent abuse.

#### Scenario: Ban operation rate limited
- **GIVEN** super-admin has banned 10 users in the last minute
- **WHEN** super-admin attempts to ban another user
- **THEN** the operation is rejected with 429 Too Many Requests
- **AND** audit log records "security.rate_limit_exceeded"

#### Scenario: Impersonation rate limited
- **GIVEN** super-admin has impersonated 5 users in the last 5 minutes
- **WHEN** super-admin attempts another impersonation
- **THEN** the operation is rejected with 429 Too Many Requests

#### Scenario: Delete operation rate limited
- **GIVEN** platform-admin has deleted 3 users in the last 5 minutes
- **WHEN** platform-admin attempts to delete another user
- **THEN** the operation is rejected with 429 Too Many Requests

#### Scenario: Rate limit window resets
- **GIVEN** super-admin hit the ban rate limit
- **WHEN** 60 seconds pass
- **THEN** the rate limit counter resets
- **AND** super-admin can ban users again

---
