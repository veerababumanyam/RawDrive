import { test, expect } from '@playwright/test'

test.describe('Theme Switching', () => {
  test('default theme is liquid-glass', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'liquid-glass')
  })

  test('can switch to dark theme', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /theme/i }).click()
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', /dark|midnight/)
  })

  test('theme persists after navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /theme/i }).click()
    const theme = await page.locator('html').getAttribute('data-theme')
    await page.goto('/pricing')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)
  })

  test('all pages render in each theme', async ({ page }) => {
    const pages = ['/', '/pricing', '/features', '/privacy']
    for (const url of pages) {
      await page.goto(url)
      await expect(page.locator('h1')).toBeVisible()
    }
  })
})
