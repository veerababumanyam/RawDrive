import { test, expect } from '@playwright/test'

test.describe('Onboarding Flow', () => {
  test('state selection page renders', async ({ page }) => {
    await page.goto('/onboarding/state-selection')
    await expect(page.getByText(/state|select/i)).toBeVisible()
  })

  test('state dropdown has Indian states', async ({ page }) => {
    await page.goto('/onboarding/state-selection')
    await expect(page.getByText(/maharashtra|karnataka|delhi/i)).toBeVisible()
  })

  test('profile page renders', async ({ page }) => {
    await page.goto('/onboarding/profile')
    await expect(page.getByText(/business|studio|name/i)).toBeVisible()
  })

  test('progress indicator shows steps', async ({ page }) => {
    await page.goto('/onboarding/state-selection')
    await expect(page.getByText(/step|1|2|3/i)).toBeVisible()
  })

  test('onboarding completion page renders', async ({ page }) => {
    await page.goto('/onboarding/complete')
    await expect(page.getByText(/complete|welcome|workspace/i)).toBeVisible()
  })

  test('dashboard shell loads after onboarding', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText(/dashboard|welcome/i)).toBeVisible()
  })
})
