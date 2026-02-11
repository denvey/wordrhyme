/**
 * OAuth Social Login E2E Tests
 *
 * Tests OAuth login button visibility, disabled states, and error handling.
 * Note: Actual OAuth flow cannot be tested in E2E as it requires external provider interaction.
 */
import { test, expect } from '@playwright/test';

test.describe('OAuth Social Login', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('should display OAuth buttons on login page', async ({ page }) => {
        // Check all three OAuth buttons are visible
        await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /apple/i })).toBeVisible();
    });

    test('should display "Or continue with" separator', async ({ page }) => {
        await expect(page.getByText(/or continue with/i)).toBeVisible();
    });

    test('should have OAuth buttons enabled by default', async ({ page }) => {
        await expect(page.getByRole('button', { name: /google/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /github/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /apple/i })).toBeEnabled();
    });

    test('should disable all buttons when email form is submitting', async ({ page }) => {
        // Fill in email form
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'password123');

        // Start form submission (intercept to keep loading state)
        await page.route('**/api/auth/**', async (route) => {
            // Delay response to keep loading state visible
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await route.continue();
        });

        // Click submit
        await page.click('button[type="submit"]');

        // Verify OAuth buttons are disabled during loading
        await expect(page.getByRole('button', { name: /google/i })).toBeDisabled();
        await expect(page.getByRole('button', { name: /github/i })).toBeDisabled();
        await expect(page.getByRole('button', { name: /apple/i })).toBeDisabled();
    });

    test('should show error toast for OAuthAccountNotLinked error', async ({ page }) => {
        await page.goto('/login?error=OAuthAccountNotLinked');

        // Verify Chinese error message is displayed
        await expect(
            page.getByText('此邮箱已使用其他方式注册，请使用邮箱密码登录')
        ).toBeVisible({ timeout: 5000 });

        // URL should be cleaned up
        await expect(page).toHaveURL('/login');
    });

    test('should show error toast for AccessDenied error', async ({ page }) => {
        await page.goto('/login?error=AccessDenied');

        await expect(page.getByText('登录已取消')).toBeVisible({ timeout: 5000 });
        await expect(page).toHaveURL('/login');
    });

    test('should show error toast for Configuration error', async ({ page }) => {
        await page.goto('/login?error=Configuration');

        await expect(page.getByText('OAuth 配置错误，请联系管理员')).toBeVisible({
            timeout: 5000,
        });
        await expect(page).toHaveURL('/login');
    });

    test('should show generic error for unknown error codes', async ({ page }) => {
        await page.goto('/login?error=SomeUnknownError');

        // Should show generic error message (XSS prevention)
        await expect(page.getByText('登录失败，请重试')).toBeVisible({
            timeout: 5000,
        });
        await expect(page).toHaveURL('/login');
    });

    test('should have correct aria-labels for accessibility', async ({ page }) => {
        await expect(
            page.getByRole('button', { name: 'Sign in with Google' })
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Sign in with GitHub' })
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Sign in with Apple' })
        ).toBeVisible();
    });

    // Note: Cannot test actual OAuth redirect as it goes to external provider
    test.skip('should redirect to Google OAuth when clicking Google button', async ({
        page,
    }) => {
        // This test would require mocking the OAuth flow
        // In a real scenario, clicking would redirect to accounts.google.com
        const googleButton = page.getByRole('button', { name: /google/i });
        await googleButton.click();
        // Cannot assert external redirect in E2E
    });
});
