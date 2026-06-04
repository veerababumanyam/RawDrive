import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const srcRoot = join(process.cwd(), "src");

describe("dashboard sidebar width cascade", () => {
  it("keeps collapsed sidebar width in sync across themed body descendants", () => {
    const globals = readFileSync(join(srcRoot, "app", "globals.css"), "utf8");
    const dashboardLayout = readFileSync(
      join(srcRoot, "app", "(dashboard)", "layout.tsx"),
      "utf8",
    );
    const sidebarShell = readFileSync(
      join(srcRoot, "components", "layout", "navigation", "SidebarShell.tsx"),
      "utf8",
    );

    expect(globals).toMatch(
      /@media \(min-width: 768px\)[\s\S]*html\[data-sidebar-collapsed="true"\],\s*html\[data-sidebar-collapsed="true"\] body\s*{[^}]*--sidebar-width:\s*var\(--sidebar-width-collapsed\);/s,
    );
    expect(globals).toContain(".sidebar-shell");
    expect(globals).toContain("width: min(");
    expect(dashboardLayout).toContain("md:w-[calc(100%-var(--sidebar-width))]");
    expect(dashboardLayout).toContain("md:ml-[var(--sidebar-width)]");
    expect(sidebarShell).toContain("sidebar-shell fixed");
    expect(sidebarShell).not.toContain("w-[var(--sidebar-width)]");
  });

  it("scopes collapsed label hiding to desktop so mobile drawers stay usable", () => {
    const globals = readFileSync(join(srcRoot, "app", "globals.css"), "utf8");
    const beforeDesktopMedia = globals.slice(
      0,
      globals.indexOf("@media (min-width: 768px)"),
    );

    expect(globals).toMatch(
      /@media \(min-width: 768px\)[\s\S]*html\[data-sidebar-collapsed="true"\] \.sidebar-collapse-hide\s*{[^}]*display:\s*none !important;/s,
    );
    expect(beforeDesktopMedia).not.toContain(
      'html[data-sidebar-collapsed="true"] .sidebar-collapse-hide',
    );
  });

  it("keeps the mobile menu trigger out of the desktop header grid", () => {
    const globals = readFileSync(join(srcRoot, "app", "globals.css"), "utf8");
    const dashboardLayout = readFileSync(
      join(srcRoot, "app", "(dashboard)", "layout.tsx"),
      "utf8",
    );

    expect(dashboardLayout).toContain("dashboard-header__mobile-nav");
    expect(globals).toMatch(
      /@media \(min-width: 768px\)[\s\S]*\.dashboard-header__mobile-nav\s*{[^}]*display:\s*none;/s,
    );
    expect(dashboardLayout).not.toContain("lg:hidden");
  });

  it("pins the collapse affordance to the sidebar seam without consuming nav space", () => {
    const globals = readFileSync(join(srcRoot, "app", "globals.css"), "utf8");
    const sidebarShell = readFileSync(
      join(srcRoot, "components", "layout", "navigation", "SidebarShell.tsx"),
      "utf8",
    );

    expect(sidebarShell).toContain("sidebar-collapse-button");
    expect(sidebarShell).not.toContain("mb-6 hidden md:flex");
    expect(globals).toMatch(
      /\.sidebar-collapse-button\s*{[^}]*display:\s*none;[^}]*}/s,
    );
    expect(globals).toMatch(
      /@media \(min-width: 768px\)[\s\S]*\.sidebar-collapse-button\s*{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*top:\s*var\(--space-8\);[^}]*transform:\s*translateX\(50%\);/s,
    );
  });

  it("supports persistent user resizing through the sidebar width variable", () => {
    const globals = readFileSync(join(srcRoot, "app", "globals.css"), "utf8");
    const sidebarShell = readFileSync(
      join(srcRoot, "components", "layout", "navigation", "SidebarShell.tsx"),
      "utf8",
    );

    expect(sidebarShell).toContain("rawdrive:sidebar:expanded-width");
    expect(sidebarShell).toContain(
      'document.documentElement.style.setProperty("--sidebar-width-expanded"',
    );
    expect(sidebarShell).toContain(
      'document.body?.style.setProperty("--sidebar-width-expanded"',
    );
    expect(sidebarShell).toContain('role="separator"');
    expect(sidebarShell).toContain("sidebar-resize-handle");
    expect(sidebarShell).toContain("aria-valuenow={expandedWidth}");
    expect(globals).toMatch(
      /@media \(min-width: 768px\)[\s\S]*\.sidebar-resize-handle\s*{[^}]*position:\s*absolute;[^}]*cursor:\s*col-resize;/s,
    );
    expect(globals).toContain(
      'html[data-sidebar-resizing="true"] .sidebar-shell',
    );
  });
});
