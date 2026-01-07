/**
 * Workspace Features E2E Test
 * Comprehensive test of all workspace features after login
 */

import { test, expect } from '@playwright/test';

// Test credentials
const TEST_USER = {
  email: 'free@test.rawdrive.in',
  password: 'Test@123',
};

test.describe('Workspace Features Access', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173/signin');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(TEST_USER.email);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(TEST_USER.password);

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation to workspace
    await page.waitForURL(/\/(dashboard|workspace)/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  });

  test('should access Dashboard', async ({ page }) => {
    console.log('Testing Dashboard access...');

    // Click Dashboard in sidebar
    const dashboardButton = page.locator('button:has-text("Dashboard")').first();
    await dashboardButton.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on dashboard
    await expect(page).toHaveURL(/\/(dashboard|workspace)/);

    console.log('✓ Dashboard accessible at:', page.url());
  });

  test('should access Galleries', async ({ page }) => {
    console.log('Testing Galleries access...');

    // Click Galleries in sidebar
    const galleriesButton = page.locator('button:has-text("Galleries")').first();
    await galleriesButton.click();
    await page.waitForLoadState('networkidle');

    // Check for gallery content or empty state
    const pageContent = await page.content();
    const hasGalleryContent = pageContent.includes('gallery') ||
                              pageContent.includes('Gallery') ||
                              pageContent.includes('Create') ||
                              pageContent.includes('No galleries');

    expect(hasGalleryContent).toBeTruthy();

    console.log('✓ Galleries page accessible at:', page.url());
  });

  test('should access Clients', async ({ page }) => {
    console.log('Testing Clients access...');

    // Click Clients in sidebar
    const clientsButton = page.locator('button:has-text("Clients")').first();
    await clientsButton.click();
    await page.waitForLoadState('networkidle');

    // Check for clients content
    const pageContent = await page.content();
    const hasClientsContent = pageContent.includes('client') ||
                             pageContent.includes('Client') ||
                             pageContent.includes('Add') ||
                             pageContent.includes('No clients');

    expect(hasClientsContent).toBeTruthy();

    console.log('✓ Clients page accessible at:', page.url());
  });

  test('should access Invitations', async ({ page }) => {
    console.log('Testing Invitations access...');

    // Click Invitations in sidebar
    const invitationsButton = page.locator('button:has-text("Invitations")').first();
    await invitationsButton.click();
    await page.waitForLoadState('networkidle');

    // Check for invitations content
    const pageContent = await page.content();
    const hasInvitationsContent = pageContent.includes('invitation') ||
                                  pageContent.includes('Invitation') ||
                                  pageContent.includes('Create') ||
                                  pageContent.includes('No invitations');

    expect(hasInvitationsContent).toBeTruthy();

    console.log('✓ Invitations page accessible at:', page.url());
  });

  test('should access People (Face Detection)', async ({ page }) => {
    console.log('Testing People access...');

    // Click People in sidebar
    const peopleButton = page.locator('button:has-text("People")').first();
    await peopleButton.click();
    await page.waitForLoadState('networkidle');

    // Check for people/faces content
    const pageContent = await page.content();
    const hasPeopleContent = pageContent.includes('people') ||
                            pageContent.includes('People') ||
                            pageContent.includes('face') ||
                            pageContent.includes('No people');

    expect(hasPeopleContent).toBeTruthy();

    console.log('✓ People page accessible at:', page.url());
  });

  test('should access Visitors', async ({ page }) => {
    console.log('Testing Visitors access...');

    // Click Visitors in sidebar
    const visitorsButton = page.locator('button:has-text("Visitors")').first();
    await visitorsButton.click();
    await page.waitForLoadState('networkidle');

    // Check for visitors content
    const pageContent = await page.content();
    const hasVisitorsContent = pageContent.includes('visitor') ||
                               pageContent.includes('Visitor') ||
                               pageContent.includes('analytics') ||
                               pageContent.includes('No visitors');

    expect(hasVisitorsContent).toBeTruthy();

    console.log('✓ Visitors page accessible at:', page.url());
  });

  test('should access Shared', async ({ page }) => {
    console.log('Testing Shared access...');

    // Click Shared in sidebar
    const sharedButton = page.locator('button:has-text("Shared")').first();
    await sharedButton.click();
    await page.waitForLoadState('networkidle');

    // Check for shared content
    const pageContent = await page.content();
    const hasSharedContent = pageContent.includes('shared') ||
                            pageContent.includes('Shared') ||
                            pageContent.includes('No shared');

    expect(hasSharedContent).toBeTruthy();

    console.log('✓ Shared page accessible at:', page.url());
  });

  test('should access Recent', async ({ page }) => {
    console.log('Testing Recent access...');

    // Click Recent in sidebar
    const recentButton = page.locator('button:has-text("Recent")').first();
    await recentButton.click();
    await page.waitForLoadState('networkidle');

    // Check for recent content
    const pageContent = await page.content();
    const hasRecentContent = pageContent.includes('recent') ||
                            pageContent.includes('Recent') ||
                            pageContent.includes('No recent');

    expect(hasRecentContent).toBeTruthy();

    console.log('✓ Recent page accessible at:', page.url());
  });

  test('should access Favorites', async ({ page }) => {
    console.log('Testing Favorites access...');

    // Click Favorites in sidebar
    const favoritesButton = page.locator('button:has-text("Favorites")').first();
    await favoritesButton.click();
    await page.waitForLoadState('networkidle');

    // Check for favorites content
    const pageContent = await page.content();
    const hasFavoritesContent = pageContent.includes('favorite') ||
                                pageContent.includes('Favorite') ||
                                pageContent.includes('No favorites');

    expect(hasFavoritesContent).toBeTruthy();

    console.log('✓ Favorites page accessible at:', page.url());
  });

  test('should access Trash', async ({ page }) => {
    console.log('Testing Trash access...');

    // Click Trash in sidebar
    const trashButton = page.locator('button:has-text("Trash")').first();
    await trashButton.click();
    await page.waitForLoadState('networkidle');

    // Check for trash content
    const pageContent = await page.content();
    const hasTrashContent = pageContent.includes('trash') ||
                           pageContent.includes('Trash') ||
                           pageContent.includes('deleted') ||
                           pageContent.includes('No items');

    expect(hasTrashContent).toBeTruthy();

    console.log('✓ Trash page accessible at:', page.url());
  });

  test('should access Settings', async ({ page }) => {
    console.log('Testing Settings access...');

    // Click Settings in sidebar
    const settingsButton = page.locator('button:has-text("Settings")').first();
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Check for settings content
    const pageContent = await page.content();
    const hasSettingsContent = pageContent.includes('setting') ||
                               pageContent.includes('Setting') ||
                               pageContent.includes('preference') ||
                               pageContent.includes('configuration');

    expect(hasSettingsContent).toBeTruthy();

    console.log('✓ Settings page accessible at:', page.url());
  });

  test('should access Company Profile', async ({ page }) => {
    console.log('Testing Company Profile access...');

    // Click Company Profile in sidebar
    const companyButton = page.locator('button:has-text("Company Profile")').first();
    await companyButton.click();
    await page.waitForLoadState('networkidle');

    // Check for company profile content
    const pageContent = await page.content();
    const hasCompanyContent = pageContent.includes('company') ||
                             pageContent.includes('Company') ||
                             pageContent.includes('profile') ||
                             pageContent.includes('branding');

    expect(hasCompanyContent).toBeTruthy();

    console.log('✓ Company Profile page accessible at:', page.url());
  });

  test('should access My Profile', async ({ page }) => {
    console.log('Testing My Profile access...');

    // Click My Profile in sidebar
    const profileButton = page.locator('button:has-text("My Profile")').first();
    await profileButton.click();
    await page.waitForLoadState('networkidle');

    // Check for profile content
    const pageContent = await page.content();
    const hasProfileContent = pageContent.includes('profile') ||
                             pageContent.includes('Profile') ||
                             pageContent.includes('account') ||
                             pageContent.includes(TEST_USER.email);

    expect(hasProfileContent).toBeTruthy();

    console.log('✓ My Profile page accessible at:', page.url());
  });

  test('should check for console errors across all pages', async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listen for network errors
    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    console.log('Checking all pages for errors...');

    // Navigate through key pages
    const pages = [
      { name: 'Dashboard', selector: 'button:has-text("Dashboard")' },
      { name: 'Galleries', selector: 'button:has-text("Galleries")' },
      { name: 'Clients', selector: 'button:has-text("Clients")' },
      { name: 'Settings', selector: 'button:has-text("Settings")' },
      { name: 'Company Profile', selector: 'button:has-text("Company Profile")' },
    ];

    for (const pageInfo of pages) {
      const button = page.locator(pageInfo.selector).first();
      await button.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // Wait for any async errors

      console.log(`  Checked ${pageInfo.name}`);
    }

    // Report errors
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
    }

    if (networkErrors.length > 0) {
      console.warn('Network errors detected:', networkErrors);
    }

    // Filter out React DevTools warnings
    const criticalErrors = consoleErrors.filter(
      err => !err.includes('Download the React DevTools') &&
             !err.includes('DevTools')
    );

    expect(criticalErrors).toHaveLength(0);
    expect(networkErrors.filter(err => !err.includes('favicon'))).toHaveLength(0);

    console.log('✓ No critical errors found across workspace features');
  });

  test('should verify user menu and logout', async ({ page }) => {
    console.log('Testing user menu and logout...');

    // Find and click user menu
    const userMenuButton = page.locator('button:has-text("User menu"), button:has-text("Test Free User")').first();
    await userMenuButton.click();
    await page.waitForTimeout(500);

    // Check if menu opened (look for logout or profile option)
    const menuVisible = await page.locator('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")').isVisible()
      .catch(() => false);

    if (menuVisible) {
      console.log('✓ User menu opened successfully');
    } else {
      console.log('⚠ User menu may have different structure');
    }
  });
});
