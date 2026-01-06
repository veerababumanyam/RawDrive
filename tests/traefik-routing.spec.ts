import { test, expect } from '@playwright/test';

test.describe('Traefik Routing Tests', () => {
  test('Grafana should be accessible at http://localhost/grafana', async ({ page }) => {
    // Navigate to Grafana
    const response = await page.goto('http://localhost/grafana', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    console.log('Grafana Response Status:', response?.status());
    console.log('Grafana Response URL:', response?.url());

    // Take screenshot for debugging
    await page.screenshot({ path: 'tests/screenshots/grafana.png', fullPage: true });

    // Get page content
    const content = await page.content();
    console.log('Grafana Page HTML Length:', content.length);
    console.log('Grafana Page Title:', await page.title());

    // Check console errors
    page.on('console', msg => console.log('Browser Console:', msg.text()));

    // Assertions
    expect(response?.status()).not.toBe(404);
  });

  test('Traefik dashboard should be accessible at http://traefik.localhost', async ({ page }) => {
    // Navigate to Traefik dashboard
    const response = await page.goto('http://traefik.localhost', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    console.log('Traefik Response Status:', response?.status());
    console.log('Traefik Response URL:', response?.url());

    // Take screenshot for debugging
    await page.screenshot({ path: 'tests/screenshots/traefik.png', fullPage: true });

    // Get page content
    const content = await page.content();
    console.log('Traefik Page HTML Length:', content.length);
    console.log('Traefik Page Title:', await page.title());

    // Assertions
    expect(response?.status()).not.toBe(404);
  });

  test('Check direct Traefik dashboard port', async ({ page }) => {
    // Try accessing Traefik dashboard directly on port 8080
    const response = await page.goto('http://localhost:8080', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    console.log('Traefik:8080 Response Status:', response?.status());
    console.log('Traefik:8080 Response URL:', response?.url());

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/traefik-8080.png', fullPage: true });

    const content = await page.content();
    console.log('Traefik:8080 Page HTML Length:', content.length);
    console.log('Traefik:8080 Page Title:', await page.title());
  });

  test('Check Traefik is running and serving requests', async ({ page }) => {
    // Test if Traefik is forwarding to backend
    const response = await page.goto('http://localhost/api/health', {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    console.log('Backend API Response Status:', response?.status());
    console.log('Backend API Response URL:', response?.url());

    if (response?.status() === 200) {
      const json = await response.json();
      console.log('Backend Health Check:', JSON.stringify(json, null, 2));
    }
  });
});
