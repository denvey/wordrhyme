/**
 * Authentication E2E Tests
 *
 * Tests login functionality for different user roles.
 */
import { test, expect } from '@playwright/test';
import { TEST_ACCOUNTS } from './fixtures.js';

test.describe('Authentication', () => {
    test('should show login page', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should login as Owner successfully', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"]', TEST_ACCOUNTS.owner.email);
        await page.fill('input[type="password"]', TEST_ACCOUNTS.owner.password);
        await page.click('button[type="submit"]');

        // Wait for redirect to dashboard
        await page.waitForURL('/', { timeout: 10000 });

        // Verify dashboard is loaded
        await expect(page).toHaveURL('/');
    });

    test('should login as Admin successfully', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"]', TEST_ACCOUNTS.admin.email);
        await page.fill('input[type="password"]', TEST_ACCOUNTS.admin.password);
        await page.click('button[type="submit"]');

        await page.waitForURL('/', { timeout: 10000 });
        await expect(page).toHaveURL('/');
    });

    test('should login as Member successfully', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"]', TEST_ACCOUNTS.member.email);
        await page.fill('input[type="password"]', TEST_ACCOUNTS.member.password);
        await page.click('button[type="submit"]');

        await page.waitForURL('/', { timeout: 10000 });
        await expect(page).toHaveURL('/');
    });

    test.skip('should show error on invalid credentials', async ({ page }) => {
        // TODO: Add error message display in Login.tsx
        await page.goto('/login');

        await page.fill('input[type="email"]', 'invalid@example.com');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');

        // Should stay on login page and show error
        await expect(page).toHaveURL('/login');
        // Wait for error message (adjust selector based on your UI)
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
    });
});
