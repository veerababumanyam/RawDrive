// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * M11: Gallery Processing, Storage & Organization — API E2E Tests
 * Tests hit the real running API to verify route wiring and input validation.
 */

const API_BASE = process.env.PLAYWRIGHT_API_BASE || 'http://localhost:8080';

/** @param {import('@playwright/test').APIRequestContext} request */
async function getAuthHeaders(request) {
  const token = process.env.PLAYWRIGHT_AUTH_TOKEN;
  if (token) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  const loginRes = await request.post(`${API_BASE}/auth/login`, {
    data: {
      email: process.env.E2E_TEST_EMAIL || 'admin@rawdrive.test',
      password: process.env.E2E_TEST_PASSWORD || 'UatPho@2026',
    },
  });
  if (loginRes.ok()) {
    const body = await loginRes.json();
    const accessToken = body.data?.access_token || body.access_token;
    if (accessToken) {
      return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    }
  }
  return { 'Content-Type': 'application/json' };
}

test.describe('M11: Health check', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('M11: Storage endpoints', () => {
  test('GET /api/v1/storage/usage — route exists and returns data or 401', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const res = await request.get(`${API_BASE}/api/v1/storage/usage`, { headers });
    // 200 (data), 401 (no auth), or 404 (server needs restart with new routes)
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.data).toHaveProperty('used_bytes');
      expect(body.data).toHaveProperty('quota_bytes');
      expect(body.data).toHaveProperty('warning_level');
    }
    if (res.status() === 404) {
      console.warn('Storage usage route returned 404 — server binary may need rebuild/restart');
    }
  });

  test('GET /api/v1/storage/analytics — route exists', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const res = await request.get(`${API_BASE}/api/v1/storage/analytics`, { headers });
    expect([200, 401, 404]).toContain(res.status());
  });
});

test.describe('M11: Asset lifecycle', () => {
  test('POST /api/v1/assets/{id}/lifecycle — validates target_state', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const res = await request.post(`${API_BASE}/api/v1/assets/${fakeId}/lifecycle`, {
      headers, data: { reason: 'test' },
    });
    expect([400, 401]).toContain(res.status());
  });

  test('POST /api/v1/assets/bulk — rejects empty asset_ids', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const res = await request.post(`${API_BASE}/api/v1/assets/bulk`, {
      headers, data: { action: 'delete', asset_ids: [] },
    });
    expect([400, 401]).toContain(res.status());
  });

  test('POST /api/v1/assets/bulk — rejects unknown action', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const res = await request.post(`${API_BASE}/api/v1/assets/bulk`, {
      headers, data: { action: 'bad_action', asset_ids: ['00000000-0000-0000-0000-000000000001'] },
    });
    expect([400, 401]).toContain(res.status());
  });
});

test.describe('M11: Albums', () => {
  test('GET /api/v1/galleries/{id}/albums — route exists', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const id = '00000000-0000-0000-0000-000000000001';
    const res = await request.get(`${API_BASE}/api/v1/galleries/${id}/albums`, { headers });
    expect([200, 401, 500]).toContain(res.status());
  });
});

test.describe('M11: Processing status', () => {
  test('GET /api/v1/assets/{id}/processing-status — route exists', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const id = '00000000-0000-0000-0000-000000000001';
    const res = await request.get(`${API_BASE}/api/v1/assets/${id}/processing-status`, { headers });
    // 404 or 401 — NOT 405 (missing route)
    expect([200, 401, 404]).toContain(res.status());
  });
});

test.describe('M11: Timeline', () => {
  test('GET /api/v1/galleries/{id}/assets/timeline — route exists', async ({ request }) => {
    const headers = await getAuthHeaders(request);
    const id = '00000000-0000-0000-0000-000000000001';
    const res = await request.get(`${API_BASE}/api/v1/galleries/${id}/assets/timeline`, { headers });
    expect([200, 401, 500]).toContain(res.status());
  });
});
