# admin-ui-host Specification Delta

## ADDED Requirements

### Requirement: Roles Management Page

The Admin UI SHALL provide a Roles page for viewing and managing roles within the current organization.

#### Scenario: View roles list
- **GIVEN** admin navigates to `/roles`
- **THEN** a list of all roles in the organization is displayed
- **AND** each role shows: name, description, system badge (if applicable)
- **AND** system roles show "System" badge and cannot be deleted

#### Scenario: Create new role
- **GIVEN** admin is on the roles page
- **WHEN** admin clicks "Create Role" button
- **THEN** a form appears with name and description fields
- **WHEN** admin submits the form
- **THEN** the new role is created and appears in the list

#### Scenario: Edit role
- **GIVEN** a custom role exists
- **WHEN** admin clicks "Edit" on the role
- **THEN** admin is navigated to the role detail page
- **AND** can modify name and description

#### Scenario: Delete role
- **GIVEN** a custom role exists (is_system = false)
- **WHEN** admin clicks "Delete" on the role
- **THEN** a confirmation dialog appears
- **WHEN** admin confirms deletion
- **THEN** the role is deleted
- **AND** the role disappears from the list

#### Scenario: Cannot delete system role
- **GIVEN** a system role (owner, admin, member, viewer)
- **THEN** the delete button is disabled or hidden
- **AND** tooltip explains "System roles cannot be deleted"

---

### Requirement: Role Permission Assignment UI

The Admin UI SHALL provide a permission assignment interface within the role detail page.

#### Scenario: View role permissions
- **GIVEN** admin navigates to `/roles/:id`
- **THEN** role details are displayed
- **AND** a permissions matrix shows all available capabilities
- **AND** assigned capabilities are checked

#### Scenario: Permissions grouped by category
- **GIVEN** admin is on role detail page
- **THEN** permissions are grouped by resource type (Content, Media, Organization, User, Plugin)
- **AND** plugin permissions are grouped under their plugin name

#### Scenario: Assign permission to role
- **GIVEN** admin is on role detail page
- **WHEN** admin checks a capability checkbox
- **AND** clicks "Save Permissions"
- **THEN** the capability is added to the role
- **AND** a success toast is shown

#### Scenario: Remove permission from role
- **GIVEN** admin is on role detail page
- **WHEN** admin unchecks a capability checkbox
- **AND** clicks "Save Permissions"
- **THEN** the capability is removed from the role

#### Scenario: Cannot modify owner role permissions
- **GIVEN** admin views the "owner" system role
- **THEN** the permissions matrix is read-only
- **AND** a notice explains "Owner role has full access to all resources"

---

### Requirement: Member Role Selection Enhancement

The existing Members page SHALL use database-defined roles for role assignment instead of hardcoded options.

#### Scenario: Role dropdown shows database roles
- **GIVEN** organization has roles: owner, admin, member, viewer, content-editor
- **WHEN** admin edits a member's role
- **THEN** the role dropdown shows all 5 roles from database
- **AND** roles are sorted with system roles first

#### Scenario: Role assignment uses slug
- **WHEN** admin selects role "Content Editor" for a member
- **THEN** `member.role` is set to the role's slug "content-editor"

---

### Requirement: Sidebar Navigation Update

The Admin UI sidebar SHALL include a link to the Roles management page.

#### Scenario: Roles link in sidebar
- **GIVEN** admin is logged in
- **THEN** sidebar shows "Roles" link under organization section
- **WHEN** admin clicks "Roles"
- **THEN** navigates to `/roles` page
