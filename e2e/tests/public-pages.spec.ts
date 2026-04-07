import { test, expect } from '@playwright/test'

test.describe('Public Pages', () => {
  test('landing page loads and has hero', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page).toHaveTitle(/rawdrive/i)
  })

  test('landing page has navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation')).toBeVisible()
    await expect(page.getByRole('link', { name: /features/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /pricing/i })).toBeVisible()
  })

  test('landing page has CTA buttons', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /start free|get started/i })).toBeVisible()
  })

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByText(/starter/i)).toBeVisible()
    await expect(page.getByText(/pro/i)).toBeVisible()
  })

  test('features page loads', async ({ page }) => {
    await page.goto('/features')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  })

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByText(/privacy|data protection/i)).toBeVisible()
  })

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('refund page loads', async ({ page }) => {
    await page.goto('/refund')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('navigation between pages works', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /pricing/i }).click()
    await expect(page).toHaveURL(/pricing/)
    await page.getByRole('link', { name: /features/i }).click()
    await expect(page).toHaveURL(/features/)
  })

  test('footer links work', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /privacy/i }).click()
    await expect(page).toHaveURL(/privacy/)
  })

  test('landing page loads within 3 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(3000)
  })

  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })
})
