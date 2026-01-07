/**
 * Debug Test - Full Login Flow with Console Logs
 */

import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: 'free@test.rawdrive.in',
  password: 'Test@123',
};

test('should debug full login flow', async ({ page }) => {
  console.log('=== Full Login Debug ===');

  // Capture console logs
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture errors
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(`[PageError] ${error.message}`);
  });

  // Go to signin page
  await page.goto('http://localhost:5173/signin');
  await page.waitForLoadState('networkidle');

  console.log('\\n1. Before Login - Storage:');
  const beforeStorage = await page.evaluate(() => {
    return Object.keys(localStorage).map(key => ({
      key,
      value: localStorage.getItem(key)
    }));
  });
  console.log(JSON.stringify(beforeStorage, null, 2));

  // Fill login form
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill(TEST_USER.email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(TEST_USER.password);

  // Submit
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // Wait for navigation or error
  await page.waitForTimeout(3000);

  console.log('\\n2. After Login - URL:', page.url());

  console.log('\\n3. After Login - Storage:');
  const afterStorage = await page.evaluate(() => {
    return Object.keys(localStorage).map(key => ({
      key,
      value: localStorage.getItem(key)?.substring(0, 50) + '...'
    }));
  });
  console.log(JSON.stringify(afterStorage, null, 2));

  console.log('\\n4. Check Specific Keys:');
  const specificKeys = await page.evaluate(() => {
    return {
      access_token_exists: !!localStorage.getItem('rawdrive_access_token'),
      refresh_token_exists: !!localStorage.getItem('rawdrive_refresh_token'),
      user: localStorage.getItem('rawdrive_user'),
      workspace: localStorage.getItem('rawdrive_workspace')
    };
  });
  console.log(JSON.stringify(specificKeys, null, 2));

  console.log('\\n5. Console Logs:');
  consoleLogs.forEach(log => console.log(log));

  if (errors.length > 0) {
    console.log('\\n6. Errors:');
    errors.forEach(err => console.log(err));
  }

  console.log('\\n=== Full Login Debug Complete ===');
});
