/**
 * CASL Rule Editor E2E Tests
 *
 * Tests the CASL rule editor UI including:
 * - Adding/removing rules
 * - Field-level permissions
 * - ABAC conditions
 * - Inverted rules
 */
import { test, expect } from './fixtures.js';

test.describe('CASL Rule Editor', () => {
    test.beforeEach(async ({ ownerPage }) => {
        // Navigate to role management
        await ownerPage.goto('/roles', { timeout: 60000 });
        await ownerPage.waitForTimeout(1000);

        // Create a new test role
        await ownerPage.getByRole('button', { name: /Create Role/i }).click();
        await ownerPage.fill('input[id="name"]', 'CASL Test Role');
        await ownerPage.fill('textarea[id="description"]', 'For testing CASL editor');

        // Click Create Role button in the dialog
        await ownerPage.getByRole('button', { name: /^Create Role$/i }).click();

        // Wait for role detail page to load
        await ownerPage.waitForURL(/\/roles\/.+/, { timeout: 60000 });
        await ownerPage.waitForTimeout(1000);
    });

    test('should add a basic CASL rule', async ({ ownerPage }) => {
        // Click add rule button
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();

        // Select action: read
        const actionSelect = ownerPage.locator('select[name*="action"]').first();
        await actionSelect.selectOption('read');

        // Select subject: Content
        const subjectSelect = ownerPage.locator('select[name*="subject"]').first();
        await subjectSelect.selectOption('Content');

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully with toast
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should add field-level permissions', async ({ ownerPage }) => {
        // Add a rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();

        const actionSelect = ownerPage.locator('select[name*="action"]').first();
        await actionSelect.selectOption('update');

        const subjectSelect = ownerPage.locator('select[name*="subject"]').first();
        await subjectSelect.selectOption('Content');

        // Expand advanced options
        await ownerPage.getByRole('button', { name: /Advanced Options/i }).click();

        // Add fields
        const fieldsInput = ownerPage.locator('input[name*="fields"]');
        await fieldsInput.fill('title, body, tags');

        // Verify fields are displayed
        await expect(fieldsInput).toHaveValue('title, body, tags');

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should add ABAC conditions', async ({ ownerPage }) => {
        // Add a rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();

        const actionSelect = ownerPage.locator('select[name*="action"]').first();
        await actionSelect.selectOption('update');

        const subjectSelect = ownerPage.locator('select[name*="subject"]').first();
        await subjectSelect.selectOption('Content');

        // Expand advanced options
        await ownerPage.getByRole('button', { name: /Advanced Options/i }).click();

        // Add conditions
        const conditionsInput = ownerPage.locator('textarea[name*="conditions"]');
        await conditionsInput.fill('{ "ownerId": "${user.id}" }');

        // Verify conditions are displayed
        await expect(conditionsInput).toHaveValue('{ "ownerId": "${user.id}" }');

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should add inverted rule (Cannot)', async ({ ownerPage }) => {
        // Add a rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();

        const actionSelect = ownerPage.locator('select[name*="action"]').first();
        await actionSelect.selectOption('read');

        const subjectSelect = ownerPage.locator('select[name*="subject"]').first();
        await subjectSelect.selectOption('AuditLog');

        // Expand advanced options
        await ownerPage.getByRole('button', { name: /Advanced Options/i }).click();

        // Check inverted checkbox
        const invertedCheckbox = ownerPage.locator('input[type="checkbox"][name*="inverted"]');
        await invertedCheckbox.check();

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should add multiple rules', async ({ ownerPage }) => {
        // Add first rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').first().selectOption('read');
        await ownerPage.locator('select[name*="subject"]').first().selectOption('Content');

        // Add second rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').nth(1).selectOption('manage');
        await ownerPage.locator('select[name*="subject"]').nth(1).selectOption('Menu');

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should remove a rule', async ({ ownerPage }) => {
        // Add two rules
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').first().selectOption('read');
        await ownerPage.locator('select[name*="subject"]').first().selectOption('Content');

        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').nth(1).selectOption('manage');
        await ownerPage.locator('select[name*="subject"]').nth(1).selectOption('Menu');

        // Remove the first rule - look for delete icon button
        await ownerPage.locator('button[class*="text-destructive"]').first().click();

        // Save role
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test('should edit existing role with rules', async ({ ownerPage }) => {
        // First create a role with rules
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').first().selectOption('read');
        await ownerPage.locator('select[name*="subject"]').first().selectOption('Content');
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Wait for save
        await ownerPage.waitForTimeout(1000);

        // Go back to roles list
        await ownerPage.goto('/roles');

        // Click on the role to edit
        await ownerPage.getByText('CASL Test Role').click();

        // Wait for page load
        await ownerPage.waitForURL(/\/roles\/.+/);

        // Add another rule
        await ownerPage.getByRole('button', { name: /Add Rule/i }).click();
        await ownerPage.locator('select[name*="action"]').nth(1).selectOption('update');
        await ownerPage.locator('select[name*="subject"]').nth(1).selectOption('Content');

        // Save
        await ownerPage.getByRole('button', { name: /Save Changes/i }).click();

        // Verify saved successfully
        await expect(ownerPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
    });

    test.afterEach(async ({ ownerPage }) => {
        // Clean up: delete the test role
        try {
            await ownerPage.goto('/roles', { timeout: 60000 });
            await ownerPage.waitForTimeout(2000);

            // Find role that matches "CASL Test Role"
            const roleCards = await ownerPage.getByText('CASL Test Role').all();
            if (roleCards.length === 0) {
                // Already deleted
                return;
            }

            // Click on the first matching role
            await roleCards[0].click();

            // Wait for role detail page
            await ownerPage.waitForURL(/\/roles\/.+/, { timeout: 60000 });
            await ownerPage.waitForTimeout(1000);

            // Try to find and click delete button - there may be multiple approaches
            // Approach 1: Try dropdown menu
            try {
                const dropdownButtons = await ownerPage.locator('button').filter({ has: ownerPage.locator('svg') }).all();
                for (const btn of dropdownButtons) {
                    const text = await btn.textContent();
                    if (!text || text.trim() === '') {
                        await btn.click();
                        await ownerPage.waitForTimeout(500);
                        break;
                    }
                }
                await ownerPage.getByText('Delete Role').click({ timeout: 5000 });
            } catch {
                // Dropdown approach failed, maybe role is system role and cannot be deleted
                console.log('Cannot delete role - may be a system role');
                return;
            }

            // Confirm deletion in alert dialog
            await ownerPage.getByRole('button', { name: /^Delete$/i }).click();

            // Wait for deletion to complete
            await ownerPage.waitForTimeout(2000);
        } catch (error) {
            console.error('Cleanup failed:', error);
            // Ignore cleanup failures
        }
    });
});
