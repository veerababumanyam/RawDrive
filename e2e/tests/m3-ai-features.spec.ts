// @ts-check
import { test, expect } from '@playwright/test';

// Increase default timeout for client-side hydration
test.use({ actionTimeout: 10000 });

// Set a mock auth token before each test so dashboard pages render
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('rawdrive_token', 'e2e-test-token');
  });
});

// Helper: navigate and wait for hydration
async function gotoAndWait(page: any, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test.describe('M3: AI Features', () => {
  test.describe('AI Dashboard Navigation', () => {
    test('AI overview page loads', async ({ page }) => {
      await gotoAndWait(page, '/ai');
      await expect(page.locator('h1')).toContainText('AI Studio', { timeout: 10000 });
    });

    test('tab navigation renders all sections', async ({ page }) => {
      await gotoAndWait(page, '/ai');
      for (const label of ['Overview', 'Search', 'People', 'Duplicates', 'Settings']) {
        await expect(page.getByRole('link', { name: label })).toBeVisible({ timeout: 10000 });
      }
    });

    test('navigates to search section', async ({ page }) => {
      await gotoAndWait(page, '/ai/search');
      await expect(page.locator('h2')).toContainText('Semantic Search', { timeout: 10000 });
    });

    test('navigates to settings section', async ({ page }) => {
      await gotoAndWait(page, '/ai/settings');
      await expect(page.locator('h3').first()).toContainText('Gemini API Key', { timeout: 10000 });
    });
  });

  test.describe('Semantic Search', () => {
    test('search page renders input field', async ({ page }) => {
      await gotoAndWait(page, '/ai/search');
      await expect(page.getByPlaceholder(/Search photos/)).toBeVisible({ timeout: 10000 });
    });

    test('search input has minimum 44px touch target', async ({ page }) => {
      await gotoAndWait(page, '/ai/search');
      const searchInput = page.getByPlaceholder(/Search photos/);
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      const box = await searchInput.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('BYOK Setup', () => {
    test('settings page shows API key form', async ({ page }) => {
      await gotoAndWait(page, '/ai/settings');
      await expect(page.getByPlaceholder('AIza...')).toBeVisible({ timeout: 10000 });
    });

    test('model preference dropdown has options', async ({ page }) => {
      await gotoAndWait(page, '/ai/settings');
      const select = page.locator('select');
      await expect(select).toBeVisible({ timeout: 10000 });
      const options = await select.locator('option').allTextContents();
      expect(options.length).toBeGreaterThanOrEqual(2);
    });

    test('save button disabled without key, enabled with key', async ({ page }) => {
      await gotoAndWait(page, '/ai/settings');
      const saveBtn = page.getByRole('button', { name: 'Save Key' });
      await expect(saveBtn).toBeVisible({ timeout: 10000 });
      await expect(saveBtn).toBeDisabled();

      await page.getByPlaceholder('AIza...').fill('AIzaSyTestKey12345');
      await expect(saveBtn).toBeEnabled();
    });
  });

  test.describe('People / Face Clusters', () => {
    test('faces page loads without crash', async ({ page }) => {
      await gotoAndWait(page, '/ai/faces');
      await expect(page.locator('h2')).toContainText('People', { timeout: 10000 });
    });
  });

  test.describe('Duplicates', () => {
    test('duplicates page loads without crash', async ({ page }) => {
      await gotoAndWait(page, '/ai/duplicates');
      await expect(page.locator('h2')).toContainText('Duplicate Detection', { timeout: 10000 });
    });
  });

  test.describe('Accessibility', () => {
    test('buttons have minimum 44px touch targets', async ({ page }) => {
      await gotoAndWait(page, '/ai/settings');
      const buttons = await page.getByRole('button').all();
      for (const button of buttons) {
        const box = await button.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('search input is keyboard focusable', async ({ page }) => {
      await gotoAndWait(page, '/ai/search');
      const searchInput = page.getByPlaceholder(/Search photos/);
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.focus();
      await expect(searchInput).toBeFocused();
    });
  });
});
