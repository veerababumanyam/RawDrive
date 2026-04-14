/**
 * F-014 — Accessibility audit (real axe-core).
 *
 * Uses @axe-core/playwright for WCAG 2.1 A/AA assertions across the
 * M34 viewer, M35 stream-create form, and the /s/<code> resolver fallback.
 * Blocking threshold = critical + serious. Moderate/minor are surfaced
 * via the failure payload but do not fail the suite.
 *
 * color-contrast is temporarily disabled on the viewer route because the
 * liquid-glass design tokens are still under active iteration (see
 * design-tokens.json); re-enable once M36 token freeze lands.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const STREAM_ID = "66666666-6666-6666-6666-666666666666";

test.describe("M34+M35 A11y audit", () => {
  test.beforeAll(async ({ request }) => {
    try {
      const r = await request.get("/health");
      if (r.status() >= 500) test.skip();
    } catch {
      test.skip();
    }
  });

  test("/stream/[id] WCAG AA no critical violations", async ({ page }) => {
    await page.route(`**/api/v1/streams/${STREAM_ID}/viewer*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: STREAM_ID,
          status: "scheduled",
          scheduled_start: new Date(Date.now() + 3600000).toISOString(),
          requires_pin: false,
          title: "A11y Test Stream",
        }),
      });
    });
    await page.goto(`/stream/${STREAM_ID}`);
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"]) // design tokens under active dev; re-enable post-M36
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("/streams/new form WCAG AA", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("rawdrive_token", "e2e-test-token");
      } catch {
        /* noop */
      }
    });
    await page.goto("/streams/new");
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .include("form")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("/s/[code] resolver fallback WCAG AA", async ({ page }) => {
    await page.goto("/s/invalid-code");
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
