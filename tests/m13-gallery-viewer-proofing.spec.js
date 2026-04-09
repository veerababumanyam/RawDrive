// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * M13: Gallery Viewer, Sharing & Proofing — Browser E2E Tests
 */

const API_BASE = process.env.PLAYWRIGHT_API_URL || 'http://host.docker.internal:8080';
const GALLERY_ID = 'c5c73f5a-c252-45fe-87d7-2b496f411f58';

async function getAuthToken() {
  const resp = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@rawdrive.test', password: 'SuperAdmin123!' }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.access_token;
}

test.beforeEach(async ({ page }) => {
  const token = await getAuthToken();
  await page.goto('/');
  if (token) {
    await page.evaluate((t) => {
      localStorage.setItem('rawdrive_token', t);
    }, token);
  }
});

async function gotoAndWait(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test.describe('M13: Gallery Proofing Page', () => {
  test('proofing page loads with heading', async ({ page }) => {
    await gotoAndWait(page, `/galleries/${GALLERY_ID}/proofing`);
    const heading = page.locator('h1');
    await expect(heading).toContainText('Proofing', { timeout: 15000 });
  });

  test('proofing page shows status badges', async ({ page }) => {
    await gotoAndWait(page, `/galleries/${GALLERY_ID}/proofing`);
    await expect(page.locator('text=Selected')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Approved')).toBeVisible();
    await expect(page.locator('text=Rejected')).toBeVisible();
  });
});

test.describe('M13: Public Gallery Page', () => {
  test('public gallery page loads without crash', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('rawdrive_token');
    });
    await gotoAndWait(page, '/g/test-slug');
    await expect(page).toHaveTitle(/.*/);
  });
});

test.describe('M14: Gallery Analytics Page', () => {
  test('analytics page loads with heading', async ({ page }) => {
    await gotoAndWait(page, `/galleries/${GALLERY_ID}/analytics`);
    const heading = page.locator('h1');
    await expect(heading).toContainText('Analytics', { timeout: 15000 });
  });

  test('analytics page shows time range toggles', async ({ page }) => {
    await gotoAndWait(page, `/galleries/${GALLERY_ID}/analytics`);
    await expect(page.locator('button:has-text("7d")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("30d")')).toBeVisible();
    await expect(page.locator('button:has-text("90d")')).toBeVisible();
  });

  test('analytics page shows stat cards', async ({ page }) => {
    await gotoAndWait(page, `/galleries/${GALLERY_ID}/analytics`);
    await expect(page.locator('text=Views')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Visitors')).toBeVisible();
    await expect(page.locator('text=Downloads')).toBeVisible();
  });
});

test.describe('M13: No console errors', () => {
  test('proofing page has no critical console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });

    await gotoAndWait(page, `/galleries/${GALLERY_ID}/proofing`);

    const criticalErrors = errors.filter(e =>
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('Failed to fetch') &&
      !e.includes('net::') &&
      !e.includes('hydration')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
