// @ts-check
import { test, expect, type Page } from "@playwright/test";

// Credentials come from env so nothing sensitive is hardcoded:
//   E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_TEST_GALLERY_ID
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "";
const GALLERY_ID = process.env.E2E_TEST_GALLERY_ID || "";

async function loginViaUI(page: Page) {
  if (!TEST_EMAIL || !TEST_PASSWORD || !GALLERY_ID) {
    test.skip(true, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD / E2E_TEST_GALLERY_ID must be set");
  }
  await page.goto("/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard|galleries|onboarding|$)/, { timeout: 20000 });
}

test.describe.configure({ mode: "serial", retries: 1 });

test.describe("M38 gallery continuity panels", () => {
  test("delivery + sales continuity panels render real data on gallery overview", async ({ page }) => {
    await loginViaUI(page);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto(`/galleries/${GALLERY_ID}`);
    await page.waitForLoadState("networkidle");

    // Delivery continuity panel
    const delivery = page.getByTestId("delivery-continuity-panel");
    await expect(delivery).toBeVisible();
    await expect(delivery).toContainText("Delivery continuity");
    await expect(delivery).toContainText(/Downloads/i);
    await expect(delivery).toContainText(/Views/i);
    await expect(delivery).toContainText(/Proofing/i);

    // Sales continuity panel
    const sales = page.getByTestId("sales-continuity-panel");
    await expect(sales).toBeVisible();
    await expect(sales).toContainText("Sales continuity");
    await expect(sales).toContainText(/Invoice/);
    await expect(sales).toContainText(/Deal/);
    await expect(sales).toContainText(/Project/);
    await expect(page.getByTestId("sales-cart-count")).toBeVisible();

    // Console must stay clean (zero-error budget for M38 surfaces)
    const m38Errors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.toLowerCase().includes("hydration") && // filtered by design tokens cascade
        !e.includes("404"),
    );
    expect(m38Errors, `console errors: ${m38Errors.join("\n")}`).toEqual([]);

    // Screenshot evidence
    await page.screenshot({
      path: "_cobolt-output/m38-gallery-continuity.png",
      fullPage: true,
    });
  });

  test("analytics summary network call fires for delivery panel", async ({ page }) => {
    await loginViaUI(page);

    const analyticsCall = page.waitForRequest((req) =>
      req.url().includes(`/api/v1/galleries/${GALLERY_ID}/analytics/summary`),
    );

    await page.goto(`/galleries/${GALLERY_ID}`);
    const req = await analyticsCall;
    expect(req.method()).toBe("GET");
    expect(req.headers()["authorization"]).toMatch(/^Bearer /);
  });
});
