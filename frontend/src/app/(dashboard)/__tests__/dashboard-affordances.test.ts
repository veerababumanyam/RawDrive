import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-level regression guard for the dashboard UAT (2026-06-04), matching the
// repo's existing dashboard-metric-links.test.ts convention. It pins the fix
// SHAPE so the dead affordances can't silently come back; the behavioural proof
// of the overflow menu lives in dashboard/recent-gallery-menu.test.tsx.

const repoRoot = path.resolve(__dirname, "../../../..");
const pagePath = path.join(repoRoot, "src/app/(dashboard)/dashboard/page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

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
    expect(source).toContain('label: "Active Clients",');
    expect(source).toContain('value: "0",');
    expect(source).toContain('label: "Revenue This Month",');
    expect(source).toContain('value: "₹0",');
    // Neither card may regress to the bare em-dash placeholder.
    expect(source).not.toMatch(/label: "Active Clients",\s*\n\s*value: "—"/);
    expect(source).not.toMatch(
      /label: "Revenue This Month",\s*\n\s*value: "—"/,
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
});
