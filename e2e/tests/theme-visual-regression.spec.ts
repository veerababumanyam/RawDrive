import { test, expect, type Page } from "@playwright/test";

/**
 * Per-theme visual regression for the design system.
 *
 * Renders the public marketing surfaces in each of the three themes
 * (liquid-glass, liquid-glass-dark, midnight) and snapshots them. The goal
 * is to catch palette regressions, focus-ring/contrast drift, and broken
 * glass surfaces across themes — exactly the class of bug that slipped
 * through manual review before (teal palette not matching the logo, the
 * loud active/focus ring in the lightbox).
 *
 * Public, unauthenticated routes only so the spec runs without a seeded
 * session. Snapshots are tolerant (maxDiffPixelRatio) because system fonts
 * differ slightly across CI runners.
 *
 * Update baselines intentionally with:
 *   docker compose run --rm playwright npx playwright test \
 *     theme-visual-regression --update-snapshots
 */

const THEMES = ["liquid-glass", "liquid-glass-dark", "midnight"] as const;

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "landing", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "login", path: "/login" },
];

async function applyTheme(page: Page, theme: string): Promise<void> {
  // Mirror ThemeProvider: persist the choice and set the attribute the
  // compiled CSS targets, before the app's init script runs.
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage may be unavailable in some sandboxes */
      }
      document.documentElement.dataset.theme = value;
    },
    ["rawdrive-theme", theme],
  );
}

test.describe("design-system themes render correctly", () => {
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`${theme} — ${route.name}`, async ({ page }) => {
        await applyTheme(page, theme);
        await page.goto(route.path, { waitUntil: "networkidle" });

        // Pin the theme on the live document too, in case the init script
        // resolved OS preference before our attribute was read.
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);

        // Disable animations so fade-ups/shimmer don't cause flaky diffs.
        await page.addStyleTag({
          content:
            "*,*::before,*::after{animation:none !important;transition:none !important}",
        });
        await page.waitForTimeout(250);

        await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
          animations: "disabled",
        });
      });
    }
  }
});

test.describe("token contract is present", () => {
  test("core CSS custom properties resolve per theme", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const theme of THEMES) {
      const vars = await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        const s = getComputedStyle(document.documentElement);
        return {
          accent: s.getPropertyValue("--accent-default").trim(),
          textPrimary: s.getPropertyValue("--text-primary").trim(),
          surfaceBase: s.getPropertyValue("--surface-base").trim(),
          focus: s.getPropertyValue("--border-focus").trim(),
        };
      }, theme);
      expect(vars.accent, `${theme} --accent-default`).not.toBe("");
      expect(vars.textPrimary, `${theme} --text-primary`).not.toBe("");
      expect(vars.surfaceBase, `${theme} --surface-base`).not.toBe("");
      expect(vars.focus, `${theme} --border-focus`).not.toBe("");
    }
  });
});
