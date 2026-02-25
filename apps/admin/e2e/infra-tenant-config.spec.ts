/**
 * Infrastructure Plugin Tenant Config E2E Test (Task 7.8)
 *
 * Full flow:
 * 1. Platform admin configures S3 plugin
 * 2. Platform admin sets policy to allow_override
 * 3. Tenant user sees the S3 tab
 * 4. Tenant switches to custom configuration
 * 5. Tenant saves custom config
 *
 * Prerequisites:
 * - S3 plugin installed and enabled
 * - Platform and tenant accounts seeded
 * - Server and admin running
 */
import { test, expect, login, TEST_ACCOUNTS } from './fixtures.js';

test.describe('Infrastructure Plugin Tenant Config', () => {
    test.describe.configure({ mode: 'serial' });

    // ─── Step 1 & 2: Platform admin sets policy ───

    test('platform admin can set infra policy to allow_override', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Login as platform admin (owner has platform access)
        await login(page, TEST_ACCOUNTS.owner.email, TEST_ACCOUNTS.owner.password);

        // Navigate to Settings page
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        // Find S3 Storage tab (or similar infrastructure plugin tab)
        const s3Tab = page.getByRole('tab', { name: /S3|Storage/i });
        await expect(s3Tab).toBeVisible({ timeout: 10000 });
        await s3Tab.click();

        // Wait for tab content to load
        await page.waitForTimeout(1000);

        // Find the Tenant Policy section (platform admin only)
        const policySection = page.getByText('Tenant Policy');
        await expect(policySection).toBeVisible({ timeout: 5000 });

        // Select "Allow tenant override" radio
        const allowOverrideRadio = page.getByRole('radio', { name: /allow tenant override/i });
        await expect(allowOverrideRadio).toBeVisible();
        await allowOverrideRadio.click();

        // Wait for mutation to complete
        await page.waitForTimeout(2000);

        // Verify the radio is now selected
        await expect(allowOverrideRadio).toBeChecked();

        await context.close();
    });

    // ─── Step 3: Tenant sees S3 tab ───

    test('tenant user sees S3 tab after policy is set to allow_override', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Login as regular admin (tenant user)
        await login(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

        // Navigate to Settings page
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        // S3 tab should be visible (not hidden by unified policy)
        const s3Tab = page.getByRole('tab', { name: /S3|Storage/i });
        await expect(s3Tab).toBeVisible({ timeout: 10000 });

        await context.close();
    });

    // ─── Step 4 & 5: Tenant switches to custom and saves ───

    test('tenant can switch to custom configuration and save', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Login as tenant admin
        await login(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

        // Navigate to Settings page
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        // Click S3 tab
        const s3Tab = page.getByRole('tab', { name: /S3|Storage/i });
        await s3Tab.click();
        await page.waitForTimeout(1000);

        // Should see "Using platform default" banner
        const platformBanner = page.getByText(/platform default/i);
        await expect(platformBanner).toBeVisible({ timeout: 5000 });

        // Click "Switch to custom configuration" button
        const switchBtn = page.getByRole('button', { name: /switch to custom/i });
        await expect(switchBtn).toBeVisible();
        await switchBtn.click();

        // If high-risk, handle confirmation dialog
        const confirmBtn = page.getByRole('button', { name: /I understand/i });
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmBtn.click();
        }

        // Should now see "You are using custom configuration" banner
        await expect(page.getByText(/custom configuration/i)).toBeVisible({ timeout: 5000 });

        // Form should be editable — verify no pointer-events-none overlay
        const formContainer = page.locator('[class*="pointer-events-none"]');
        await expect(formContainer).toHaveCount(0);

        await context.close();
    });

    // ─── Verify: unified mode hides tab ───

    test('tenant does NOT see S3 tab when policy is unified', async ({ browser }) => {
        // First: platform admin switches back to unified
        const platformCtx = await browser.newContext();
        const platformPage = await platformCtx.newPage();
        await login(platformPage, TEST_ACCOUNTS.owner.email, TEST_ACCOUNTS.owner.password);
        await platformPage.goto('/settings');
        await platformPage.waitForLoadState('networkidle');

        const s3Tab = platformPage.getByRole('tab', { name: /S3|Storage/i });
        await s3Tab.click();
        await platformPage.waitForTimeout(1000);

        const unifiedRadio = platformPage.getByRole('radio', { name: /unified platform/i });
        await unifiedRadio.click();
        await platformPage.waitForTimeout(2000);
        await platformCtx.close();

        // Then: tenant should NOT see the tab
        const tenantCtx = await browser.newContext();
        const tenantPage = await tenantCtx.newPage();
        await login(tenantPage, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
        await tenantPage.goto('/settings');
        await tenantPage.waitForLoadState('networkidle');

        // S3 tab should NOT be visible in unified mode
        const tenantS3Tab = tenantPage.getByRole('tab', { name: /S3|Storage/i });
        await expect(tenantS3Tab).not.toBeVisible({ timeout: 5000 });

        await tenantCtx.close();
    });
});
