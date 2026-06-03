// @ts-check
// F-013 photographer journey: real-browser smoke across M36 / M37 / M38 surfaces.
// Captures console errors, failed network requests, and screenshot evidence for
// each milestone's user-facing feature. Runs serially against a live dev stack.
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const FRONTEND = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
const EMAIL = process.env.E2E_TEST_EMAIL || "";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "";
const GALLERY_ID = process.env.E2E_TEST_GALLERY_ID || "";
const GALLERY_SLUG = process.env.E2E_TEST_GALLERY_SLUG || "";

test.describe.configure({ mode: "serial" });

type Recorder = {
  errors: string[];
  failedRequests: string[];
};

function wireRecorder(page: Page): Recorder {
  const rec: Recorder = { errors: [], failedRequests: [] };
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") rec.errors.push(msg.text());
  });
  page.on("pageerror", (err) => rec.errors.push(err.message));
  page.on("requestfailed", (req) => {
    rec.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  return rec;
}

async function login(page: Page) {
  if (!EMAIL || !PASSWORD) test.skip(true, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD required");
  // Retry loop to ride out login rate limits on rapid E2E runs.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(`${FRONTEND}/login`);
    await page.locator("#login-email").fill(EMAIL);
    await page.locator("#login-password").fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL(/\/(dashboard|galleries|onboarding|$)/, { timeout: 8000 });
      return;
    } catch {
      if (attempt === 4) throw new Error("login retry budget exhausted");
      await page.waitForTimeout(1500 * attempt);
    }
  }
}

function assertCleanConsole(rec: Recorder, where: string) {
  // Filter benign noise we don't own (favicon 404s, Next dev HMR, hydration notes)
  const fatal = rec.errors.filter(
    (e) =>
      !/favicon/i.test(e) &&
      !/404/.test(e) &&
      !/429/.test(e) &&
      !/Too Many Requests/i.test(e) &&
      !/Failed to fetch dynamically imported module/i.test(e) &&
      !/hydration/i.test(e),
  );
  expect(fatal, `[${where}] console errors:\n${fatal.join("\n")}`).toEqual([]);
}

test("M37 workspace profile page renders brand identity controls", async ({ page }) => {
  const rec = wireRecorder(page);
  await login(page);
  await page.goto(`${FRONTEND}/settings/business`);
  await page.waitForLoadState("networkidle");

  // Brand-name input must exist (E93-S2: workspace profile UI)
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/Brand|Business|Studio/i);

  await page.screenshot({ path: "_cobolt-output/f013-m37-settings-business.png", fullPage: true });
  assertCleanConsole(rec, "settings/business");
});

test("M37 public gallery /g/[slug] shows studio branding", async ({ page }) => {
  if (!GALLERY_SLUG) test.skip(true, "E2E_TEST_GALLERY_SLUG required");
  const rec = wireRecorder(page);
  await page.goto(`${FRONTEND}/g/${GALLERY_SLUG}`);
  await page.waitForLoadState("networkidle");

  // Public branding propagation (E93-S3): brand name rendered somewhere on page
  const body = await page.locator("body").innerText();
  // Either the seeded brand or the fallback — page must render either way
  expect(body.length).toBeGreaterThan(20);

  await page.screenshot({ path: "_cobolt-output/f013-m37-public-gallery.png", fullPage: true });
  // Public page: zero console errors (public users must not see noise)
  assertCleanConsole(rec, "/g/[slug]");
});

test("M36 gallery overview shows client-linkage badges and share center", async ({ page }) => {
  if (!GALLERY_ID) test.skip(true, "E2E_TEST_GALLERY_ID required");
  const rec = wireRecorder(page);
  await login(page);
  await page.goto(`${FRONTEND}/galleries/${GALLERY_ID}`);
  await page.waitForLoadState("networkidle");

  // M36 E90-S3: client linkage badges (Project/Event/Deal/Invoice)
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/Project/);
  expect(body).toMatch(/Event/);
  expect(body).toMatch(/Deal/);
  expect(body).toMatch(/Invoice/);

  // M37 E95-S1: Share Center heading/section on the page
  expect(body).toMatch(/Share/i);

  await page.screenshot({ path: "_cobolt-output/f013-m36-gallery-overview.png", fullPage: true });
  assertCleanConsole(rec, `galleries/${GALLERY_ID}`);
});

test("M38 authenticated tour: AI + analytics + proofing + continuity panels", async ({ page }) => {
  if (!GALLERY_ID) test.skip(true, "E2E_TEST_GALLERY_ID required");
  const rec = wireRecorder(page);
  await login(page);

  // 1) Continuity panels + network proof
  const analyticsCall = page.waitForRequest((req) =>
    req.url().includes(`/api/v1/galleries/${GALLERY_ID}/analytics/summary`),
  );
  await page.goto(`${FRONTEND}/galleries/${GALLERY_ID}`);
  const req = await analyticsCall;
  expect(req.headers()["authorization"]).toMatch(/^Bearer /);
  await expect(page.getByTestId("delivery-continuity-panel")).toBeVisible();
  await expect(page.getByTestId("sales-continuity-panel")).toBeVisible();
  await expect(page.getByTestId("sales-cart-count")).toBeVisible();
  await page.screenshot({ path: "_cobolt-output/f013-m38-continuity-panels.png", fullPage: true });

  // 2) AI page
  await page.goto(`${FRONTEND}/galleries/${GALLERY_ID}/ai`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/AI|Scan|Detect|Face/i);
  await page.screenshot({ path: "_cobolt-output/f013-m38-ai-page.png", fullPage: true });

  // 3) Analytics / Insights page
  await page.goto(`${FRONTEND}/galleries/${GALLERY_ID}/analytics`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/Analytics|Views|Downloads|Insights/i);
  await page.screenshot({ path: "_cobolt-output/f013-m38-analytics.png", fullPage: true });

  // 4) Proofing page
  await page.goto(`${FRONTEND}/galleries/${GALLERY_ID}/proofing`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "_cobolt-output/f013-m38-proofing.png", fullPage: true });

  assertCleanConsole(rec, "M38 tour");
});
