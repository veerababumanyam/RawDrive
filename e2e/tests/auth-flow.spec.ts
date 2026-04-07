import { test, expect } from '@playwright/test'

test.describe('Auth Flow', () => {
  test('register page loads', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /register|create|sign up/i })).toBeVisible()
  })

  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })

  test('register shows Google OAuth button', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
  })

  test('register has terms checkbox', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('checkbox')).toBeVisible()
  })

  test('login has magic link option', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(/magic link/i)).toBeVisible()
  })

  test('register links to login', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('link', { name: /login|sign in|already/i }).click()
    await expect(page).toHaveURL(/login/)
  })

  test('login links to register', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /register|sign up|create/i }).click()
    await expect(page).toHaveURL(/register/)
  })

  test('empty form submission shows validation', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('button', { name: /register|create|sign up/i }).click()
    await expect(page.getByText(/required|enter|valid/i)).toBeVisible()
  })
})
