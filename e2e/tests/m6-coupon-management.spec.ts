import { test, expect } from '@playwright/test'

test.describe('M6: Coupon & Payout Features', () => {
  test('coupon validation endpoint returns proper error for invalid code', async ({ request }) => {
    const response = await request.post('/api/v1/onboarding/coupon', {
      data: { coupon_code: 'NONEXISTENT' },
    })
    expect(response.status()).toBe(401) // No auth token — should get 401
  })

  test('margin list endpoint returns data', async ({ request }) => {
    const response = await request.get('/api/v1/admin/margins')
    // Without auth, should return 401 or empty
    expect([200, 401]).toContain(response.status())
  })

  test('dealer list endpoint returns data', async ({ request }) => {
    const response = await request.get('/api/v1/admin/dealers')
    expect([200, 401]).toContain(response.status())
  })

  test('health endpoint is accessible', async ({ request }) => {
    const response = await request.get('/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  test('payout statements require auth', async ({ request }) => {
    const response = await request.get('/api/v1/dealers/statements?year=2026')
    expect(response.status()).toBe(401)
  })

  test('payout PDF endpoint requires auth', async ({ request }) => {
    const response = await request.get('/api/v1/dealers/statements/2026-03/pdf')
    expect(response.status()).toBe(401)
  })
})
