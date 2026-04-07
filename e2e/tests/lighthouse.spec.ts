import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('landing page DOM content loaded < 3s', async ({ page }) => {
    const start = Date.now()
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    expect(Date.now() - start).toBeLessThan(3000)
  })

  test('pricing page loads < 3s', async ({ page }) => {
    const start = Date.now()
    await page.goto('/pricing')
    await page.waitForLoadState('domcontentloaded')
    expect(Date.now() - start).toBeLessThan(3000)
  })

  test('no console errors on landing page', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('images have alt text', async ({ page }) => {
    await page.goto('/')
    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      expect(alt).toBeTruthy()
    }
  })
})
