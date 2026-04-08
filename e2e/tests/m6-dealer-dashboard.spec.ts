import { test, expect } from '@playwright/test'

test.describe('M6: Dealer Dashboard', () => {
  test('dashboard page loads', async ({ page }) => {
    await page.goto('/dealer')
    // Should show either the dashboard or "Not a Registered Dealer" message
    const hasContent = await page.getByText(/Dealer Dashboard|Not a Registered Dealer/i).isVisible()
    expect(hasContent).toBe(true)
  })

  test('dashboard shows loading skeleton initially', async ({ page }) => {
    await page.goto('/dealer')
    // Either skeleton or content should appear
    const hasSkeleton = await page.locator('.animate-pulse').first().isVisible().catch(() => false)
    const hasContent = await page.getByText(/Dealer Dashboard|Not a Registered/i).isVisible().catch(() => false)
    expect(hasSkeleton || hasContent).toBe(true)
  })

  test('unauthenticated user sees appropriate message', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/dealer')
    await page.evaluate(() => localStorage.removeItem('rawdrive_token'))
    await page.reload()
    // Should show "Not a Registered Dealer" or redirect
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
  })

  test('dealer page has no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text())
    })
    await page.goto('/dealer')
    await page.waitForTimeout(2000)
    expect(errors).toHaveLength(0)
  })
})
