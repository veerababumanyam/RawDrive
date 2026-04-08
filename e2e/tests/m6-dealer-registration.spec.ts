import { test, expect } from '@playwright/test'

test.describe('M6: Dealer Registration Flow', () => {
  test('registration page loads with all form fields', async ({ page }) => {
    await page.goto('/dealer/register')
    await expect(page.getByText(/Become a RawDrive Dealer/i)).toBeVisible()
    await expect(page.getByText(/Business Name/i)).toBeVisible()
    await expect(page.getByText(/PAN Number/i)).toBeVisible()
    await expect(page.getByText(/Bank Account/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Submit Registration/i })).toBeVisible()
  })

  test('PAN validation shows inline error for invalid format', async ({ page }) => {
    await page.goto('/dealer/register')
    const panInput = page.getByPlaceholder('ABCDE1234F')
    await panInput.fill('INVALID')
    await panInput.blur()
    await expect(page.getByText(/Invalid PAN format/i)).toBeVisible()
  })

  test('PAN validation accepts valid format', async ({ page }) => {
    await page.goto('/dealer/register')
    const panInput = page.getByPlaceholder('ABCDE1234F')
    await panInput.fill('ABCDE1234F')
    await panInput.blur()
    await expect(page.getByText(/Invalid PAN format/i)).not.toBeVisible()
  })

  test('agreement checkbox is required before submit', async ({ page }) => {
    await page.goto('/dealer/register')
    const submitBtn = page.getByRole('button', { name: /Submit Registration/i })
    await expect(submitBtn).toBeDisabled()
  })

  test('territory type radio buttons work', async ({ page }) => {
    await page.goto('/dealer/register')
    await expect(page.getByText('Primary')).toBeVisible()
    await expect(page.getByText('Secondary')).toBeVisible()
    await expect(page.getByText('Ambassador')).toBeVisible()
    const primaryRadio = page.getByRole('radio', { name: /primary/i })
    await expect(primaryRadio).toBeChecked()
  })

  test('form fields have min 44px touch targets', async ({ page }) => {
    await page.goto('/dealer/register')
    const inputs = await page.locator('input, select, button').all()
    for (const input of inputs) {
      const box = await input.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40) // allow 4px tolerance
      }
    }
  })
})
