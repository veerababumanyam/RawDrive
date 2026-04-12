// @ts-check
const { test, expect } = require('@playwright/test');

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({
    sub: 'user-1',
    workspace_id: 'workspace-1',
    role: 'owner',
    platform_role: 'photographer',
    state_id: '27',
  })).toString('base64url');
  return `header.${payload}.signature`;
}

async function mockDashboardApis(page) {
  const token = fakeToken();
  const packages = [
    {
      id: 'package-1',
      workspace_id: 'workspace-1',
      name: 'Wedding Gold',
      description: 'Two-day wedding coverage',
      inclusions: ['Photography', 'Album'],
      base_price_paisa: 15000000,
      gst_rate: 18,
      sac_code: '998386',
      active: true,
      addons: [],
      created_at: '2026-04-12T00:00:00Z',
      updated_at: '2026-04-12T00:00:00Z',
    },
  ];
  const gstrReport = {
    financial_year: '2026-27',
    b2b_count: 1,
    b2c_count: 0,
    total_taxable_paisa: 100000,
    total_cgst_paisa: 0,
    total_sgst_paisa: 0,
    total_igst_paisa: 18000,
    total_paisa: 118000,
    entries: [
      {
        invoice_number: 'INV-2026-27-000001',
        invoice_date: '02-04-2026',
        client_name: 'Asha Weddings',
        client_gstin: '29AABCU9603R1ZM',
        place_of_supply: 'Karnataka',
        sac_code: '998386',
        taxable_value_paisa: 100000,
        cgst_paisa: 0,
        sgst_paisa: 0,
        igst_paisa: 18000,
        total_paisa: 118000,
        supply_type: 'B2B',
      },
    ],
  };

  await page.addInitScript(
    ({ accessToken, packagesResponse, gstrResponse }) => {
      const originalFetch = window.fetch.bind(window);
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });

      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = (init?.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();

        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(jsonResponse({ access_token: accessToken }));
        }
        if (url.endsWith('/api/v1/auth/me')) {
          return Promise.resolve(jsonResponse({ display_name: 'Studio Owner', email: 'owner@example.test' }));
        }
        if (url.includes('/api/v1/billing/packages') && method === 'GET') {
          return Promise.resolve(jsonResponse(packagesResponse));
        }
        if (url.includes('/api/v1/billing/invoices')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/api/v1/crm/contacts')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/api/v1/billing/reports/gstr1')) {
          return Promise.resolve(jsonResponse(gstrResponse));
        }

        return originalFetch(input, init);
      };
    },
    { accessToken: token, packagesResponse: packages, gstrResponse: gstrReport },
  );

  await page.route('**/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ display_name: 'Studio Owner', email: 'owner@example.test' }),
    });
  });
  await page.route('**/api/v1/billing/packages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(packages),
    });
  });
  await page.route('**/api/v1/billing/invoices**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
  await page.route('**/api/v1/crm/contacts**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
  await page.route('**/api/v1/billing/reports/gstr1**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(gstrReport),
    });
  });
}

test.describe('M24 CRM documents browser smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApis(page);
  });

  test('packages page renders package catalogue UI', async ({ page }) => {
    await page.goto('/settings/packages');
    await expect(page.getByRole('heading', { name: 'Service Packages' })).toBeVisible();
    await expect(page.getByText('Wedding Gold')).toBeVisible();
  });

  test('billing page exposes M24 document types', async ({ page }) => {
    await page.goto('/billing');
    await page.getByRole('button', { name: '+ New Invoice' }).click();
    await expect(page.getByRole('option', { name: 'Proforma' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Quotation' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Credit Note' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Wedding Gold' })).toBeAttached();
  });

  test('gstr1 page renders B2B export rows', async ({ page }) => {
    await page.goto('/reports/gstr1');
    await expect(page.getByRole('heading', { name: 'GSTR-1 Export' })).toBeVisible();
    await expect(page.getByText('INV-2026-27-000001')).toBeVisible();
    await expect(page.getByText('Asha Weddings')).toBeVisible();
  });
});
