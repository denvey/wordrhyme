## MODIFIED Requirements

### Requirement: Access Control

Operations SHALL be restricted based on user roles:
- **Organization Admin (member.role = 'admin')**: Can perform Layer 1 operations within their tenant
- **Global Admin (user.role = 'admin')**: Can perform Layer 1 + Layer 2 operations within their tenant. This is the sole admin role; the previously used `super-admin` alias has been removed.
- **Platform Admin**: Distinguished from organization-level admin via membership in the platform organization combined with the `owner` or `admin` role.

#### Scenario: Organization admin can manage members
- **GIVEN** user has role "admin" in organization
- **WHEN** user calls `organization.inviteMember()`
- **THEN** the operation is permitted

#### Scenario: Organization admin cannot ban users
- **GIVEN** user has role "admin" in organization but NOT global "admin" role
- **WHEN** user calls `admin.banUser()`
- **THEN** the operation is rejected with 403 Forbidden

#### Scenario: Global admin can perform all admin operations
- **GIVEN** user has global role "admin" or is in `adminUserIds`
- **WHEN** user calls any admin.* or organization.* API
- **THEN** the operation is permitted (subject to tenant isolation)

### Requirement: Guard Chain for Admin Operations

All Layer 2 admin operations MUST pass through a Guard Chain that enforces RBAC, caller tenant validation, and target user validation.

#### Scenario: Guard Chain execution order
- **GIVEN** a request to any admin.* endpoint
- **WHEN** the request is processed
- **THEN** guards execute in order: AuthGuard → AdminGuard → TenantContextGuard → TargetUserGuard
- **AND** failure at any guard stops execution and returns appropriate error

#### Scenario: AdminGuard rejects non-admin caller
- **GIVEN** caller has role "member" (not admin)
- **AND** caller is NOT in adminUserIds config
- **WHEN** caller attempts any admin.* operation
- **THEN** the operation is rejected with 403 Forbidden
- **AND** audit log records "unauthorized_admin_access"
