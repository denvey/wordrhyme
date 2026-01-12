/**
 * Debug Login Test
 *
 * Simple test to debug the login flow
 */
import { test, expect } from '@playwright/test';

test('debug login flow', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    console.log('1. Navigated to /login');

    // Take screenshot of login page
    await page.screenshot({ path: 'test-results/01-login-page.png' });

    // Fill credentials
    await page.fill('input[type="email"]', 'owner@wordrhyme.test');
    await page.fill('input[type="password"]', 'Test123456');
    console.log('2. Filled credentials');

    // Take screenshot before submit
    await page.screenshot({ path: 'test-results/02-before-submit.png' });

    // Click submit
    await page.click('button[type="submit"]');
    console.log('3. Clicked submit');

    // Wait a bit
    await page.waitForTimeout(3000);
    console.log('4. Waited 3 seconds');

    // Take screenshot after submit
    await page.screenshot({ path: 'test-results/03-after-submit.png' });

    // Check URL
    const url = page.url();
    console.log('5. Current URL:', url);

    // Check if there's any error message
    const errorMessages = await page.locator('[role="alert"]').allTextContents();
    console.log('6. Error messages:', errorMessages);

    // Check for any visible text
    const bodyText = await page.textContent('body');
    console.log('7. Page contains "WordRhyme":', bodyText?.includes('WordRhyme'));
});
