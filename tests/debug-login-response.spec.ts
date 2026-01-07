/**
 * Debug Test - Capture Login Response
 */

import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: 'free@test.rawdrive.in',
  password: 'Test@123',
};

test('should capture login API response', async ({ page }) => {
  console.log('=== Testing Login Flow ===');

  // Listen to network requests
  page.on('response', async (response) => {
    if (response.url().includes('/api/v1/auth/login')) {
      console.log('Login Response Status:', response.status());
      try {
        const body = await response.json();
        console.log('Login Response Body:', JSON.stringify(body, null, 2));
      } catch (e) {
        console.log('Could not parse response body');
      }
    }
  });

  // Go to signin page
  await page.goto('http://localhost:5173/signin');
  await page.waitForLoadState('networkidle');

  // Fill login form
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill(TEST_USER.email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(TEST_USER.password);

  // Submit
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // Wait for response
  await page.waitForTimeout(2000);

  console.log('Current URL:', page.url());

  // Check localStorage after login
  const storage = await page.evaluate(() => {
    const tokens = localStorage.getItem('rawdrive_tokens');
    const user = localStorage.getItem('rawdrive_user');
    const workspace = localStorage.getItem('rawdrive_workspace');

    return {
      tokens: tokens ? JSON.parse(tokens) : null,
      user: user ? JSON.parse(user) : null,
      workspace: workspace ? JSON.parse(workspace) : null
    };
  });

  console.log('Stored Tokens:', storage.tokens);
  console.log('Stored User:', storage.user);
  console.log('Stored Workspace:', storage.workspace);

  console.log('=== Login Flow Test Complete ===');
});
