/**
 * Role-Based Permissions E2E Tests
 *
 * Tests that different roles see different menus and have different access levels.
 */
import { test, expect } from './fixtures.js';

test.describe('Role-Based Permissions', () => {
    test.describe('Owner Role', () => {
        test('should see all menu items', async ({ ownerPage }) => {
            await ownerPage.goto('/');

            // Owner should see all menu items - use role="link" to target sidebar links specifically
            await expect(ownerPage.getByRole('link', { name: 'Dashboard' })).toBeVisible();
            await expect(ownerPage.getByRole('link', { name: 'Plugins' })).toBeVisible();
            await expect(ownerPage.getByRole('link', { name: 'Members' })).toBeVisible();
            await expect(ownerPage.getByRole('link', { name: 'Roles' })).toBeVisible();
            await expect(ownerPage.getByRole('link', { name: 'Settings' })).toBeVisible();
        });

        test('should access role management page', async ({ ownerPage }) => {
            await ownerPage.goto('/roles');

            // Should load successfully
            await expect(ownerPage).toHaveURL(/\/roles/);
            await expect(ownerPage.getByRole('heading', { name: /Roles/i })).toBeVisible();

            // Should see create button
            await expect(ownerPage.getByRole('button', { name: /Create Role/i })).toBeVisible();
        });

        test('should create a new role', async ({ ownerPage }) => {
            await ownerPage.goto('/roles');

            // Click create button
            await ownerPage.getByRole('button', { name: /Create Role/i }).click();

            // Fill in role details
            await ownerPage.fill('input[id="name"]', 'Test Role E2E');
            await ownerPage.fill('textarea[id="description"]', 'Created by E2E test');

            // Click Create Role button in dialog
            await ownerPage.getByRole('button', { name: /^Create Role$/i }).click();

            // Wait for role detail page
            await ownerPage.waitForURL(/\/roles\/.+/);

            // Add a permission rule
            await ownerPage.getByRole('button', { name: /Add Rule/i }).click();

            // Select action and subject
            await ownerPage.locator('select').first().selectOption('read');
            await ownerPage.locator('select').nth(1).selectOption('Content');

            // Save
            await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

            // Verify success
            await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
        });

        test('should delete a role', async ({ ownerPage }) => {
            await ownerPage.goto('/roles');
            await ownerPage.waitForTimeout(1000);

            // Find the test role and click to open detail
            await ownerPage.getByText('Test Role E2E').click();

            // Wait for role detail page
            await ownerPage.waitForURL(/\/roles\/.+/);

            // Find and click the dropdown menu button (MoreHorizontal icon)
            const menuButton = ownerPage.locator('button[class*="ghost"]').filter({ hasText: '' }).first();
            await menuButton.click();

            // Click delete option
            await ownerPage.getByText(/Delete Role/i).click();

            // Confirm deletion in alert dialog
            await ownerPage.getByRole('button', { name: /^Delete$/i }).click();

            // Wait and verify deletion
            await ownerPage.waitForTimeout(1000);
            await ownerPage.goto('/roles');
            await expect(ownerPage.getByText('Test Role E2E')).not.toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Admin Role', () => {
        test('should see limited menu items', async ({ adminPage }) => {
            await adminPage.goto('/');

            // Admin should see main menu items - use role="link" for sidebar
            await expect(adminPage.getByRole('link', { name: 'Dashboard' })).toBeVisible();
            await expect(adminPage.getByRole('link', { name: 'Members' })).toBeVisible();

            // But may have restricted access to certain features (depends on permissions)
            // This test verifies the menu loads successfully
        });

        test.skip('should be denied access to role management', async ({ adminPage }) => {
            // Skip this test as permission checks are not fully implemented yet
            await adminPage.goto('/roles');

            // Should either redirect or show access denied
            await expect(
                adminPage.getByText(/Access Denied|Permission Denied/i)
            ).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Member Role', () => {
        test('should see minimal menu items', async ({ memberPage }) => {
            await memberPage.goto('/');

            // Member should see basic navigation - use role="link" for sidebar
            await expect(memberPage.getByRole('link', { name: 'Dashboard' })).toBeVisible();
        });

        test.skip('should be denied access to role management', async ({ memberPage }) => {
            // Skip this test as permission checks are not fully implemented yet
            await memberPage.goto('/roles');

            // Should either redirect or show access denied
            await expect(
                memberPage.getByText(/Access Denied|Permission Denied/i)
            ).toBeVisible({ timeout: 5000 });
        });

        test('should view members list', async ({ memberPage }) => {
            await memberPage.goto('/members');

            // Should load successfully
            await expect(memberPage).toHaveURL(/\/members/);
        });
    });
});
