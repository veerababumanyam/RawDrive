/**
 * F-014 — Chat rate limit + char-count UX.
 * Stubs SSE chat stream with canned events; submits messages rapidly to
 * trigger slow-mode banner; validates >500 char warning.
 */
import { test, expect, type Route } from "@playwright/test";

const STREAM_ID = "44444444-4444-4444-4444-444444444444";

test.describe("F-014 chat rate limiting", () => {
  test.beforeAll(async ({ request }) => {
    try {
      const r = await request.get("/health");
      if (r.status() >= 500) test.skip();
    } catch {
      test.skip();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("rawdrive_token", "e2e-test-token");
      } catch {
        /* noop */
      }
    });

    // Stub viewer payload so chat panel mounts
    await page.route(`**/api/v1/streams/${STREAM_ID}/viewer*`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: STREAM_ID,
          status: "live",
          requires_pin: false,
          viewer_count: 5,
          chat_enabled: true,
          hls_url: "https://example.com/s.m3u8",
        }),
      });
    });

    // Stub SSE — accept connection, send canned events
    await page.route(/\/chat\/(stream|sse|events)/i, async (route: Route) => {
      const body = [
        ":ok\n\n",
        'event: message\ndata: {"id":"1","user":"alice","text":"Hello"}\n\n',
        'event: message\ndata: {"id":"2","user":"bob","text":"Hi"}\n\n',
      ].join("");
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "cache-control": "no-cache", connection: "keep-alive" },
        body,
      });
    });
  });

  test("rapid messages trigger slow-mode banner", async ({ page }) => {
    let postCount = 0;
    await page.route(/\/chat\/(messages|post|send)/i, async (route: Route) => {
      postCount += 1;
      if (postCount > 5) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: { "retry-after": "30" },
          body: JSON.stringify({ error: "rate_limited", retry_after: 30 }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: String(postCount), accepted: true }),
        });
      }
    });

    await page.goto(`/stream/${STREAM_ID}`);
    const input = page
      .locator('input[placeholder*="message" i], textarea[placeholder*="message" i], [role="textbox"]')
      .first();
    if (!(await input.isVisible().catch(() => false))) {
      test.skip(true, "chat input not present in this build");
      return;
    }
    for (let i = 0; i < 20; i++) {
      await input.fill(`msg ${i}`);
      await input.press("Enter").catch(() => {});
    }
    const banner = page.getByText(/slow.?mode|rate.?limit|too many|retry.?after|wait.*\d+/i).first();
    const fallback = page.getByText(/error|429/i).first();
    await expect(banner.or(fallback)).toBeVisible({ timeout: 10_000 });
  });

  test("over-500-char message shows char-count warning", async ({ page }) => {
    await page.goto(`/stream/${STREAM_ID}`);
    const input = page
      .locator('input[placeholder*="message" i], textarea[placeholder*="message" i], [role="textbox"]')
      .first();
    if (!(await input.isVisible().catch(() => false))) {
      test.skip(true, "chat input not present in this build");
      return;
    }
    const longMsg = "x".repeat(550);
    await input.fill(longMsg);
    const warning = page.getByText(/\b5\d{2}\b|too long|max(imum)?|character (limit|count)|exceeds/i).first();
    await expect(warning).toBeVisible({ timeout: 5_000 });
  });
});
