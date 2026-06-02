import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const dashboardRoot = path.join(repoRoot, "src/app/(dashboard)");
const dashboardPagePath = path.join(dashboardRoot, "dashboard/page.tsx");

describe("dashboard metric links", () => {
  it("links every dashboard metric card to its real workspace page", () => {
    const source = fs.readFileSync(dashboardPagePath, "utf8");

    for (const href of ["/galleries", "/crm/contacts", "/settings/storage", "/billing"]) {
      expect(source).toContain(`href: "${href}"`);
    }

    expect(source).toContain("<Link");
    expect(source).toContain("aria-label={`Open ${stat.label}`}");
    expect(source).not.toContain("<article");
  });

  it("keeps dashboard-only clutter out of the dashboard", () => {
    const source = fs.readFileSync(dashboardPagePath, "utf8");

    expect(source).not.toContain("Gallery Activity");
    expect(source).not.toContain("GalleryActivityWidget");
    expect(source).not.toContain("PwaInstallCard");
    expect(source).not.toContain("Install RawDrive App");
  });

  it("keeps quick-action dashboard text white/readable in dark themes", () => {
    const source = fs.readFileSync(dashboardPagePath, "utf8");

    expect(source).toContain("text-text-primary");
    expect(source).toContain("text-accent transition-transform group-hover:scale-110");
    expect(source).not.toContain("p-4 text-accent transition-colors");
  });

  it("keeps every dashboard metric destination backed by an existing page", () => {
    expect(fs.existsSync(path.join(dashboardRoot, "galleries/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "crm/contacts/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "settings/storage/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "billing/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "settings/pwa/page.tsx"))).toBe(true);
  });
});
