/**
 * Debug Test - Check Browser Storage
 */

import { test } from '@playwright/test';

test('should check and clear browser storage', async ({ page }) => {
  console.log('=== Checking Browser Storage ===');

  await page.goto('http://localhost:5173');

  // Get all localStorage keys
  const localStorageKeys = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const data: Record<string, any> = {};
    keys.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        data[key] = value ? JSON.parse(value) : value;
      } catch {
        data[key] = localStorage.getItem(key);
      }
    });
    return data;
  });

  console.log('localStorage contents:', JSON.stringify(localStorageKeys, null, 2));

  // Get all sessionStorage keys
  const sessionStorageKeys = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage);
    const data: Record<string, any> = {};
    keys.forEach(key => {
      try {
        const value = sessionStorage.getItem(key);
        data[key] = value ? JSON.parse(value) : value;
      } catch {
        data[key] = sessionStorage.getItem(key);
      }
    });
    return data;
  });

  console.log('sessionStorage contents:', JSON.stringify(sessionStorageKeys, null, 2));

  // Clear all storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    console.log('✅ All storage cleared');
  });

  // Verify cleared
  const afterClear = await page.evaluate(() => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length
  }));

  console.log('After clear:', afterClear);
  console.log('=== Storage Debug Complete ===');
});
