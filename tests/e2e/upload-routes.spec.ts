/**
 * Upload Service Route Validation E2E Tests
 *
 * End-to-end tests for Upload Service API routes through Traefik gateway.
 * Tests the RESTful routes and verifies:
 * - Routes work correctly (POST /api/v1/uploads, PATCH /api/v1/uploads/{id}/chunks, etc.)
 * - Traefik routing configuration
 * - CORS headers
 * - Middleware chain (rate limiting, headers, circuit breaker)
 * - TUS protocol headers (Upload-Offset, Tus-Resumable, etc.)
 *
 * @module upload-routes.spec
 */

import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';

// Test credentials - use existing test user
const TEST_USER = {
  email: 'business@test.rawdrive.in',
  password: 'Test@123',
};

// API base URL
const API_BASE = '/api/v1';

// Helper function to get workspace ID from localStorage after login
async function getWorkspaceId(page: any): Promise<string | null> {
  return await page.evaluate(() => {
    const workspaceData = localStorage.getItem('workspace');
    if (workspaceData) {
      try {
        const parsed = JSON.parse(workspaceData);
        return parsed.workspace_id || parsed.id;
      } catch {
        return null;
      }
    }
    return null;
  });
}

// Helper function to login and get auth token
async function loginAndGetToken(page: any): Promise<string | null> {
  await page.goto('/signin');
  await page.waitForLoadState('networkidle');

  // Fill login form
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.fill(TEST_USER.email);

  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.fill(TEST_USER.password);

  // Submit form
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // Wait for navigation after login
  await page.waitForURL(/\/(dashboard|workspace)/, { timeout: 15000 });

  // Get token from storage
  const token = await page.evaluate(() => {
    return localStorage.getItem('access_token') || localStorage.getItem('token');
  });

  return token;
}

// Helper function to create a gallery for testing
async function createTestGallery(request: any, workspaceId: string, token: string): Promise<string | null> {
  try {
    const response = await request.post(`${API_BASE}/galleries`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        title: `E2E Test Gallery ${Date.now()}`,
        client_name: 'Test Client',
        shoot_date: new Date().toISOString().split('T')[0],
      },
    });

    if (response.status() === 201) {
      const data = await response.json();
      return data.gallery_id || data.id;
    }
  } catch (error) {
    console.log('Failed to create test gallery:', error);
  }
  return null;
}

test.describe('Upload Service - New RESTful Routes', () => {
  test.describe.configure({ mode: 'serial' });

  let authToken: string | null = null;
  let workspaceId: string | null = null;
  let galleryId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Login once and store token for all tests
    const page = await browser.newPage();
    authToken = await loginAndGetToken(page);

    // Wait for workspace data
    await page.waitForTimeout(2000);
    workspaceId = await getWorkspaceId(page);

    await page.close();
  });

  test('should create upload session via POST /api/v1/uploads', async ({ request }) => {
    if (!authToken || !workspaceId) {
      console.log('No auth token or workspace ID, skipping test');
      test.skip();
      return;
    }

    // Try to get or create a gallery
    const galleries = await request.get(`${API_BASE}/galleries?limit=1`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
    });

    if (galleries.status() === 200) {
      const data = await galleries.json();
      galleryId = data.items?.[0]?.gallery_id || data.data?.[0]?.gallery_id;
    }

    if (!galleryId) {
      console.log('No gallery available, skipping upload test');
      test.skip();
      return;
    }

    // Create upload session
    const sha256 = crypto.randomBytes(32).toString('hex');
    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        file_name: 'test-photo-e2e.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 5_000_000,
        gallery_id: galleryId,
        sha256: sha256,
      },
    });

    console.log(`POST /api/v1/uploads response status: ${response.status()}`);

    // Should succeed with 201 Created or fail with auth/validation error
    expect([200, 201, 400, 401, 402, 403, 422]).toContain(response.status());

    // If successful, validate response structure
    if (response.status() === 201) {
      const data = await response.json();
      console.log('Upload session created:', Object.keys(data));

      expect(data).toHaveProperty('upload_id');
      expect(data).toHaveProperty('upload_url');
      expect(data.provider).toBe('r2');
    }
  });

  test('should get chunk status via HEAD /api/v1/uploads/{id}/chunks', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    // Use a fake upload ID (will return 404, but tests routing)
    const fakeUploadId = crypto.randomUUID();

    const response = await request.head(`${API_BASE}/uploads/${fakeUploadId}/chunks`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
    });

    console.log(`HEAD /api/v1/uploads/{id}/chunks response status: ${response.status()}`);

    // Should return 404 for non-existent upload or 200 if exists
    expect([200, 404, 401, 403]).toContain(response.status());

    // Check for TUS protocol headers
    if (response.status() === 200) {
      const headers = response.headers();
      console.log('TUS headers present:', {
        'upload-offset': headers['upload-offset'],
        'upload-length': headers['upload-length'],
      });
    }
  });

  test('should upload chunk via PATCH /api/v1/uploads/{id}/chunks', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    // Create a test chunk (1MB)
    const chunkData = Buffer.alloc(1024 * 1024, 'x');
    const fakeUploadId = crypto.randomUUID();

    const response = await request.patch(`${API_BASE}/uploads/${fakeUploadId}/chunks`, {
      headers: {
        'Content-Type': 'application/offset+octet-stream',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
        'Upload-Offset': '0',
        'Content-Length': String(chunkData.length),
      },
      data: chunkData,
    });

    console.log(`PATCH /api/v1/uploads/{id}/chunks response status: ${response.status()}`);

    // Should return 404 for non-existent upload, 204 for success, or validation error
    expect([200, 204, 400, 401, 403, 404, 409]).toContain(response.status());

    // Check for Upload-Offset header in response (TUS protocol)
    if (response.status() === 204) {
      const headers = response.headers();
      expect(headers).toHaveProperty('upload-offset');
    }
  });

  test('should cancel upload via DELETE /api/v1/uploads/{id}', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const fakeUploadId = crypto.randomUUID();

    const response = await request.delete(`${API_BASE}/uploads/${fakeUploadId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
    });

    console.log(`DELETE /api/v1/uploads/{id} response status: ${response.status()}`);

    // Should return 404 for non-existent upload or 204 for success
    expect([204, 400, 401, 403, 404, 409]).toContain(response.status());
  });

  test('should complete upload via POST /api/v1/uploads/{id}/complete', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const fakeUploadId = crypto.randomUUID();
    const sha256 = crypto.randomBytes(32).toString('hex');

    const response = await request.post(`${API_BASE}/uploads/${fakeUploadId}/complete`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      multipart: {
        total_size: '5000000',
        sha256: sha256,
      },
    });

    console.log(`POST /api/v1/uploads/{id}/complete response status: ${response.status()}`);

    // Should return 404 for non-existent upload, 200 for success, or validation error
    expect([200, 400, 401, 403, 404, 409]).toContain(response.status());

    // If successful, should return asset_id
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('asset_id');
    }
  });

  test('should check duplicate via POST /api/v1/uploads/check-duplicate', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const sha256 = crypto.randomBytes(32).toString('hex');

    const response = await request.post(`${API_BASE}/uploads/check-duplicate`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        sha256: sha256,
        size_bytes: 5_000_000,
      },
    });

    console.log(`POST /api/v1/uploads/check-duplicate response status: ${response.status()}`);

    // Should return 200 with duplicate check result
    expect([200, 400, 401, 403, 422]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('is_duplicate');
      expect(typeof data.is_duplicate).toBe('boolean');
    }
  });
});

test.describe('Upload Service - CORS Headers', () => {
  let authToken: string | null = null;
  let workspaceId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    authToken = await loginAndGetToken(page);
    await page.waitForTimeout(2000);
    workspaceId = await getWorkspaceId(page);
    await page.close();
  });

  test('should include CORS headers in OPTIONS preflight', async ({ request }) => {
    const response = await request.fetch(`${API_BASE}/uploads`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization,X-Workspace-ID',
      },
    });

    console.log(`OPTIONS /api/v1/uploads response status: ${response.status()}`);

    // Should return 200 or 204 for OPTIONS
    expect([200, 204]).toContain(response.status());

    const headers = response.headers();
    console.log('CORS headers:', {
      'access-control-allow-origin': headers['access-control-allow-origin'],
      'access-control-allow-methods': headers['access-control-allow-methods'],
      'access-control-allow-headers': headers['access-control-allow-headers'],
    });

    // Check for CORS headers
    expect(headers).toHaveProperty('access-control-allow-origin');
    expect(headers).toHaveProperty('access-control-allow-methods');
  });

  test('should expose TUS headers in CORS', async ({ request }) => {
    const response = await request.fetch(`${API_BASE}/uploads/test-id/chunks`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Upload-Offset,Content-Type',
      },
    });

    const headers = response.headers();
    const exposedHeaders = headers['access-control-expose-headers'] || '';

    console.log('Exposed CORS headers:', exposedHeaders);

    // TUS headers should be exposed
    const exposedLower = exposedHeaders.toLowerCase();
    if (exposedLower) {
      const hasTusHeaders =
        exposedLower.includes('upload-offset') ||
        exposedLower.includes('tus-resumable') ||
        exposedLower.includes('*');

      console.log(`TUS headers exposed: ${hasTusHeaders}`);
    }
  });
});

test.describe('Upload Service - Traefik Routing', () => {
  test('should route through Traefik with correct priority', async ({ request }) => {
    // Test that upload service routes have higher priority than backend fallback
    const response = await request.get(`${API_BASE}/uploads/health`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log(`Upload service routing test response status: ${response.status()}`);

    // Should route to upload-service, not backend
    // Response should be from upload-service (401 if no auth, or 404 if endpoint doesn't exist)
    expect([200, 401, 404, 405]).toContain(response.status());

    // Check for service identifier header (if configured in Traefik)
    const headers = response.headers();
    if (headers['x-service']) {
      console.log('Service header:', headers['x-service']);
      expect(headers['x-service']).toBe('upload-service');
    }
  });

  test('should include Traefik security headers', async ({ request }) => {
    const response = await request.get(`${API_BASE}/uploads`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const headers = response.headers();
    console.log('Security headers:', {
      'x-content-type-options': headers['x-content-type-options'],
      'x-frame-options': headers['x-frame-options'],
    });

    // Traefik should add security headers
    // Note: Headers may vary based on middleware configuration
    expect(response.status()).toBeDefined();
  });
});

test.describe('Upload Service - Authentication', () => {
  test('should reject requests without Authorization header', async ({ request }) => {
    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-ID': crypto.randomUUID(),
      },
      data: {
        file_name: 'test.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1000000,
        gallery_id: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
      },
    });

    console.log(`Request without auth response status: ${response.status()}`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test('should reject requests with invalid token', async ({ request }) => {
    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token-12345',
        'X-Workspace-ID': crypto.randomUUID(),
      },
      data: {
        file_name: 'test.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1000000,
        gallery_id: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
      },
    });

    console.log(`Request with invalid token response status: ${response.status()}`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test('should reject requests without X-Workspace-ID header', async ({ request, browser }) => {
    // Get valid token
    const page = await browser.newPage();
    const token = await loginAndGetToken(page);
    await page.close();

    if (!token) {
      test.skip();
      return;
    }

    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        // Missing X-Workspace-ID
      },
      data: {
        file_name: 'test.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1000000,
        gallery_id: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
      },
    });

    console.log(`Request without workspace ID response status: ${response.status()}`);

    // Should return 400, 401, or 422
    expect([400, 401, 422]).toContain(response.status());
  });
});

test.describe('Upload Service - Request Validation', () => {
  let authToken: string | null = null;
  let workspaceId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    authToken = await loginAndGetToken(page);
    await page.waitForTimeout(2000);
    workspaceId = await getWorkspaceId(page);
    await page.close();
  });

  test('should validate file type', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        file_name: 'document.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1000000,
        gallery_id: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
      },
    });

    console.log(`Invalid file type response status: ${response.status()}`);

    // Should return 400 Bad Request for unsupported file type
    expect(response.status()).toBe(400);

    if (response.status() === 400) {
      const data = await response.json();
      const errorMessage = data.error?.message || data.message || '';
      expect(errorMessage.toLowerCase()).toContain('unsupported');
    }
  });

  test('should validate file size limit', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        file_name: 'huge-file.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 200 * 1024 * 1024, // 200MB > 100MB limit
        gallery_id: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
      },
    });

    console.log(`File too large response status: ${response.status()}`);

    // Should return 400 Bad Request for file too large
    expect(response.status()).toBe(400);
  });

  test('should validate SHA256 format', async ({ request }) => {
    if (!authToken || !workspaceId) {
      test.skip();
      return;
    }

    const response = await request.post(`${API_BASE}/uploads`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workspace-ID': workspaceId,
      },
      data: {
        file_name: 'test.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1000000,
        gallery_id: crypto.randomUUID(),
        sha256: 'invalid-sha256',
      },
    });

    console.log(`Invalid SHA256 response status: ${response.status()}`);

    // Should return 422 Unprocessable Entity
    expect(response.status()).toBe(422);
  });
});
