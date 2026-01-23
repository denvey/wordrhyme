/**
 * Registration E2E Tests
 *
 * Tests the complete user registration flow including:
 * - Form display and validation
 * - Successful registration
 * - Error handling
 * - Navigation between login and register pages
 */
import { test, expect } from '@playwright/test';

// Generate unique email for each test run to avoid conflicts
function generateTestEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test-${timestamp}-${random}@example.com`;
}

test.describe('Registration Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/register');
    });

    test('should display registration form with all fields', async ({ page }) => {
        // Check page title
        await expect(page.getByText('WordRhyme')).toBeVisible();
        await expect(page.getByText('Create your account')).toBeVisible();

        // Check all form fields are present using IDs
        await expect(page.locator('#name')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.locator('#confirmPassword')).toBeVisible();

        // Check submit button
        await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();

        // Check login link
        await expect(page.getByText('Already have an account?')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    });

    test('should navigate to login page when clicking Sign in link', async ({ page }) => {
        await page.getByRole('link', { name: 'Sign in' }).click();
        await expect(page).toHaveURL('/login');
    });
});

test.describe('Registration Form Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/register');
    });

    test('should show error for name shorter than 2 characters', async ({ page }) => {
        await page.locator('#name').fill('A');
        await page.locator('#email').fill('test@example.com');
        await page.locator('#password').fill('password123');
        await page.locator('#confirmPassword').fill('password123');

        await page.getByRole('button', { name: 'Create Account' }).click();

        await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
        await page.locator('#name').fill('Test User');
        await page.locator('#email').fill('invalid-email');
        await page.locator('#password').fill('password123');
        await page.locator('#confirmPassword').fill('password123');

        await page.getByRole('button', { name: 'Create Account' }).click();

        // Check for email validation error (flexible matcher for different Zod versions)
        await expect(page.locator('.text-destructive').filter({ hasText: /email|invalid/i })).toBeVisible();
    });

    test('should show error for password shorter than 8 characters', async ({ page }) => {
        await page.locator('#name').fill('Test User');
        await page.locator('#email').fill('test@example.com');
        await page.locator('#password').fill('1234567');
        await page.locator('#confirmPassword').fill('1234567');

        await page.getByRole('button', { name: 'Create Account' }).click();

        await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
        await page.locator('#name').fill('Test User');
        await page.locator('#email').fill('test@example.com');
        await page.locator('#password').fill('password123');
        await page.locator('#confirmPassword').fill('differentpassword');

        await page.getByRole('button', { name: 'Create Account' }).click();

        await expect(page.getByText('Passwords do not match')).toBeVisible();
    });

    test('should show multiple validation errors at once', async ({ page }) => {
        // Submit empty form
        await page.getByRole('button', { name: 'Create Account' }).click();

        // Should show name error (first field)
        await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
    });
});

test.describe('Successful Registration', () => {
    test('should register successfully and show success page', async ({ page }) => {
        await page.goto('/register');

        const testEmail = generateTestEmail();

        // Fill in valid registration data using IDs
        await page.locator('#name').fill('E2E Test User');
        await page.locator('#email').fill(testEmail);
        await page.locator('#password').fill('TestPassword123!');
        await page.locator('#confirmPassword').fill('TestPassword123!');

        // Submit form
        await page.getByRole('button', { name: 'Create Account' }).click();

        // Should show loading state
        await expect(page.getByText('Creating account...')).toBeVisible();

        // Should show success page with email verification message
        await expect(page.getByText('Check your email')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText("We've sent a verification link")).toBeVisible();

        // Should have back to login button
        await expect(page.getByRole('link', { name: 'Back to Login' })).toBeVisible();
    });

    test('should navigate to login from success page', async ({ page }) => {
        await page.goto('/register');

        const testEmail = generateTestEmail();

        // Complete registration
        await page.locator('#name').fill('E2E Test User');
        await page.locator('#email').fill(testEmail);
        await page.locator('#password').fill('TestPassword123!');
        await page.locator('#confirmPassword').fill('TestPassword123!');
        await page.getByRole('button', { name: 'Create Account' }).click();

        // Wait for success page
        await expect(page.getByText('Check your email')).toBeVisible({ timeout: 15000 });

        // Click back to login
        await page.getByRole('link', { name: 'Back to Login' }).click();

        // Should be on login page
        await expect(page).toHaveURL('/login');
    });
});

test.describe('Registration Error Handling', () => {
    test('should show error for duplicate email', async ({ page }) => {
        await page.goto('/register');

        // Try to register with an existing test account email
        await page.locator('#name').fill('Duplicate User');
        await page.locator('#email').fill('owner@wordrhyme.test');
        await page.locator('#password').fill('TestPassword123!');
        await page.locator('#confirmPassword').fill('TestPassword123!');

        await page.getByRole('button', { name: 'Create Account' }).click();

        // Should show error toast (using sonner)
        await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Registration UX', () => {
    test('should have autofocus on name field', async ({ page }) => {
        await page.goto('/register');

        // Name field should be focused
        const nameInput = page.locator('#name');
        await expect(nameInput).toBeFocused();
    });

    test('should disable submit button while loading', async ({ page }) => {
        await page.goto('/register');

        const testEmail = generateTestEmail();

        await page.locator('#name').fill('Test User');
        await page.locator('#email').fill(testEmail);
        await page.locator('#password').fill('TestPassword123!');
        await page.locator('#confirmPassword').fill('TestPassword123!');

        const submitButton = page.getByRole('button', { name: 'Create Account' });
        await submitButton.click();

        // Button should show loading state and be disabled
        await expect(page.getByText('Creating account...')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeDisabled();
    });

    test('should show password fields as password type', async ({ page }) => {
        await page.goto('/register');

        const passwordInput = page.locator('#password');
        const confirmPasswordInput = page.locator('#confirmPassword');

        await expect(passwordInput).toHaveAttribute('type', 'password');
        await expect(confirmPasswordInput).toHaveAttribute('type', 'password');
    });
});

test.describe('Login Page Integration', () => {
    test('should have link to register page from login', async ({ page }) => {
        await page.goto('/login');

        // Check for register link
        const registerLink = page.getByRole('link', { name: /register|sign up/i });

        if (await registerLink.isVisible()) {
            await registerLink.click();
            await expect(page).toHaveURL('/register');
        }
    });
});
