/**
 * Login Flow E2E Test
 * Tests authentication with business@test.rawdrive.in
 */

import { test, expect } from '@playwright/test';

// Test credentials
const TEST_USER = {
  email: 'business@test.rawdrive.in',
  password: 'Test@123',
};

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/signin');
  });

  test('should successfully log in with valid credentials', async ({ page }) => {
    // Wait for login page to load
    await expect(page).toHaveURL(/\/signin/);

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Fill in email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill(TEST_USER.email);

    // Fill in password
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(TEST_USER.password);

    // Click submit button
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation after login
    // Should redirect to dashboard or workspace
    await page.waitForURL(/\/(dashboard|workspace)/, { timeout: 10000 });

    // Verify we're logged in by checking for user menu or logout button
    const userMenu = page.locator('[aria-label*="user"], [data-testid*="user"]').first();
    await expect(userMenu).toBeVisible({ timeout: 5000 });

    console.log('✓ Login successful - redirected to:', page.url());
  });

  test('should show error message for invalid credentials', async ({ page }) => {
    // Wait for login page
    await expect(page).toHaveURL(/\/signin/);

    // Fill in invalid credentials
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill('invalid@example.com');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('wrongpassword');

    // Submit form
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for error message
    const errorMessage = page.locator('[role="alert"], .error, [class*="error"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    console.log('✓ Error message displayed for invalid credentials');
  });

  test('should check for console errors during login', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Perform login
    await expect(page).toHaveURL(/\/signin/);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(TEST_USER.email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(TEST_USER.password);

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation
    await page.waitForURL(/\/(dashboard|workspace)/, { timeout: 10000 });

    // Check for console errors
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
    }

    // This test should pass even with console errors, but log them
    expect(consoleErrors.filter(err => !err.includes('Download the React DevTools'))).toHaveLength(0);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Block API requests to simulate network failure
    await page.route('**/api/v1/auth/login', (route) => {
      route.abort('failed');
    });

    await expect(page).toHaveURL(/\/signin/);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(TEST_USER.email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(TEST_USER.password);

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Should show error message
    const errorMessage = page.locator('[role="alert"], .error, [class*="error"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    console.log('✓ Network error handled gracefully');
  });

  test('should remember user after page reload', async ({ page, context }) => {
    // First login
    await expect(page).toHaveURL(/\/signin/);

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(TEST_USER.email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(TEST_USER.password);

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for successful login
    await page.waitForURL(/\/(dashboard|workspace)/, { timeout: 10000 });

    // Reload the page
    await page.reload();

    // Should still be logged in (not redirected to signin)
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/signin/);

    console.log('✓ User session persisted after reload');
  });
});

test.describe('Login Page UI', () => {
  test('should display all required form elements', async ({ page }) => {
    await page.goto('/signin');
    await expect(page).toHaveURL(/\/signin/);

    // Check for email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Check for password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Check for submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    console.log('✓ All form elements present');
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    await page.goto('/signin');
    await expect(page).toHaveURL(/\/signin/);

    // Check for form labels
    const emailInput = page.locator('input[type="email"]').first();
    const emailLabel = await emailInput.getAttribute('aria-label') ||
                       await emailInput.getAttribute('placeholder');
    expect(emailLabel).toBeTruthy();

    const passwordInput = page.locator('input[type="password"]').first();
    const passwordLabel = await passwordInput.getAttribute('aria-label') ||
                          await passwordInput.getAttribute('placeholder');
    expect(passwordLabel).toBeTruthy();

    console.log('✓ Accessibility attributes present');
  });
});
