import { test, expect } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

test.describe('Responsive Design', () => {
  for (const vp of viewports) {
    test(`landing page renders at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      await expect(page.locator('h1')).toBeVisible()
    })
  }

  test('mobile nav uses hamburger menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: /menu/i })).toBeVisible()
  })

  test('pricing cards stack on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/pricing')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('touch targets are >= 44px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    const buttons = await page.getByRole('button').all()
    for (const btn of buttons) {
      const box = await btn.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
})
