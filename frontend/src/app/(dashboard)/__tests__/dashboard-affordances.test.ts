import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-level regression guard for the dashboard UAT (2026-06-04), matching the
// repo's existing dashboard-metric-links.test.ts convention. It pins the fix
// SHAPE so the dead affordances can't silently come back; the behavioural proof
// of the overflow menu lives in dashboard/recent-gallery-menu.test.tsx.

const repoRoot = path.resolve(__dirname, "../../../..");
const pagePath = path.join(repoRoot, "src/app/(dashboard)/dashboard/page.tsx");
const globalsPath = path.join(repoRoot, "src/app/globals.css");
const source = fs.readFileSync(pagePath, "utf8");
const globals = fs.readFileSync(globalsPath, "utf8");

describe("dashboard affordances (UAT 2026-06-04)", () => {
  it("BUG-3: the welcome banner ⋮ is a real, persisted dismiss (not a dead button)", () => {
    // Persisted, compiler-safe dismissal is wired.
    expect(source).toContain("function dismissWelcomeBanner()");
    expect(source).toContain("const welcomeDismissed = useSyncExternalStore(");
    // The banner is gated on the dismissed flag.
    expect(source).toContain("{!welcomeDismissed && (");
    // The control is a labelled GlassIconButton firing the dismiss, not a raw
    // <button> with a no-op ⋮.
    expect(source).toMatch(/label="Dismiss welcome banner"/);
    expect(source).toContain("onClick={dismissWelcomeBanner}");
    // The dead raw dismiss button is gone.
    expect(source).not.toContain(
      'className="rounded-full p-2 text-text-tertiary',
    );
  });

  it("BUG-6/7: empty stat cards show an honest zero, not a loading-looking em-dash", () => {
    expect(source).toContain('label: "Active clients",');
    expect(source).toContain('value: "0",');
    expect(source).toContain('label: "Revenue this month",');
    expect(source).toContain('value: "₹0",');
    // Neither card may regress to the bare em-dash placeholder.
    expect(source).not.toMatch(/label: "Active clients",\s*\n\s*value: "—"/);
    expect(source).not.toMatch(
      /label: "Revenue this month",\s*\n\s*value: "—"/,
    );
  });

  it("BUG-2: the recent-gallery card wires a real overflow menu", () => {
    expect(source).toMatch(
      /import\s*\{\s*RecentGalleryMenu\s*\}\s*from\s*["']\.\/recent-gallery-menu["']/,
    );
    expect(source).toContain("<RecentGalleryMenu");
    expect(source).toContain("onDeleted={handleGalleryDeleted}");
    expect(source).toContain("const refreshStorageUsage = useCallback(");
    expect(source).toContain("refreshStorageUsage();");
    // The bare, behaviourless ⋮ glyph that used to sit in the card header is gone.
    expect(source).not.toContain(
      '<MoreVertical className="h-4 w-4 text-text-tertiary',
    );
  });

  it("keeps dashboard summary cards compact and grouped with quick actions", () => {
    expect(source).toContain('className="dashboard-page"');
    expect(source).toContain("Quick actions");
    expect(source).toContain("Recent galleries");
    expect(source).not.toContain("Recent activity");
    expect(source).not.toContain("Quick Actions");
    expect(source).not.toContain("Recent Galleries");
    expect(source).not.toContain("Recent Activity");
    expect(globals).not.toContain("dashboard-activity");
    expect(source).toContain('className="dashboard-overview-grid"');
    expect(source).toContain('className="dashboard-stats-grid"');
    expect(source).toContain(
      'className="surface-panel dashboard-stat-card group"',
    );
    expect(source).toContain('className="dashboard-stat-card__body"');
    expect(source).toContain(
      'className="surface-panel dashboard-quick-panel"',
    );
    expect(source).toContain(
      'className="dashboard-content-grid dashboard-content-grid--single"',
    );
    expect(source).toContain("object-contain");
    expect(source).not.toContain(
      'className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"',
    );
    expect(source).not.toContain("font-bold uppercase tracking-[0.22em]");
    expect(globals).toContain(".dashboard-page");
    expect(globals).toContain(".dashboard-stats-grid");
    expect(globals).toContain("repeat(\n    auto-fit,");
    expect(globals).toContain(
      "minmax(min(100%, calc(var(--space-20) * 3.25)), calc(var(--space-20) * 5.5))",
    );
    expect(globals).toContain("justify-content: start;");
    expect(globals).toContain("align-items: start;");
    expect(globals).toContain("grid-template-areas:");
    expect(globals).toContain("min-height: var(--touch-target-min);");
    expect(globals).not.toContain(
      "min-height: calc(var(--space-20) + var(--space-6));",
    );
    const statLabelStart = globals.indexOf(".dashboard-stat-card__label");
    const statLabelEnd = globals.indexOf(
      ".dashboard-stat-card__value",
      statLabelStart,
    );
    const statLabelBlock = globals.slice(statLabelStart, statLabelEnd);
    expect(statLabelBlock).not.toContain("text-transform: uppercase;");
    const statValueStart = globals.indexOf(".dashboard-stat-card__value");
    const statValueEnd = globals.indexOf(
      ".dashboard-stat-card__progress",
      statValueStart,
    );
    const statValueBlock = globals.slice(statValueStart, statValueEnd);
    expect(statValueBlock).toContain("font-size: var(--type-lg);");
    expect(statValueBlock).not.toContain("font-size: var(--type-2xl);");
  });
});
