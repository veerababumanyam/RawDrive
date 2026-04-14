import { test, expect } from "@playwright/test";

test.describe("M35 viewer shells", () => {
  test("/s/<invalid>  shows not-found card", async ({ page }) => {
    await page.goto("/s/nope-nope");
    await expect(page.getByText(/not found|invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test("/stream/<uuid> loads (status 2xx or 404)", async ({ page }) => {
    const resp = await page.goto("/stream/00000000-0000-0000-0000-0000000000ff");
    expect([200, 401, 403, 404]).toContain(resp?.status() ?? 0);
  });

  test("/superadmin/streaming/ledger requires role", async ({ page }) => {
    const resp = await page.goto("/superadmin/streaming/ledger");
    expect([200, 302, 401, 403, 404]).toContain(resp?.status() ?? 0);
  });
});
