/**
 * Playwright Test Fixtures
 *
 * Provides reusable test fixtures for authentication and common page objects.
 */
import { test as base, type Page } from '@playwright/test';

// Test accounts from seed script
export const TEST_ACCOUNTS = {
    owner: {
        email: 'owner@wordrhyme.test',
        password: 'Test123456',
        role: 'owner',
    },
    admin: {
        email: 'admin@wordrhyme.test',
        password: 'Test123456',
        role: 'admin',
    },
    member: {
        email: 'member@wordrhyme.test',
        password: 'Test123456',
        role: 'member',
    },
};

/**
 * Login helper function
 */
export async function login(page: Page, email: string, password: string) {
    await page.goto('/login');

    // Wait for login page
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Fill in credentials
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);

    // Click login button
    await page.click('button[type="submit"]');

    // Wait for full page reload (since we use window.location.href)
    await page.waitForURL('/', { timeout: 15000 });

    // Wait a bit more to ensure session is fully loaded
    await page.waitForTimeout(1000);
}

/**
 * Extended test fixture with authenticated contexts
 */
type AuthenticatedFixtures = {
    ownerPage: Page;
    adminPage: Page;
    memberPage: Page;
};

export const test = base.extend<AuthenticatedFixtures>({
    ownerPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await login(page, TEST_ACCOUNTS.owner.email, TEST_ACCOUNTS.owner.password);
        await use(page);
        await context.close();
    },

    adminPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await login(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
        await use(page);
        await context.close();
    },

    memberPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await login(page, TEST_ACCOUNTS.member.email, TEST_ACCOUNTS.member.password);
        await use(page);
        await context.close();
    },
});

export { expect } from '@playwright/test';
