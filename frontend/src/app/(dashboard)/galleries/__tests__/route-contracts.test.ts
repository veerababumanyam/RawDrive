import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const dashboardRoot = path.join(repoRoot, "src/app/(dashboard)");

function readFiles(root: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...readFiles(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("gallery route contracts", () => {
  it("keeps gallery-scoped destinations backed by real pages", () => {
    expect(fs.existsSync(path.join(dashboardRoot, "galleries/[id]/ai/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "streams/[id]/page.tsx"))).toBe(true);
  });

  it("does not link to orphaned gallery AI Studio routes", () => {
    const files = readFiles(path.join(repoRoot, "src"), (file) => file.endsWith(".tsx") || file.endsWith(".ts"));
    const offenders = files.filter(
      (file) => !file.includes("__tests__") && fs.readFileSync(file, "utf8").includes("ai-studio"),
    );

    expect(offenders).toEqual([]);
  });

  // F-042: the active-filter chips must reuse the shared XMark icon from the
  // icon registry instead of hand-rolling an inline close-glyph <svg>. The
  // inline SVG (path d="M6 18L18 6M6 6l12 12") drifted from the registry's
  // 1.5px stroke default and re-implemented an icon that already exists.
  it("renders filter-chip dismiss glyphs via the shared XMark icon, not inline SVG", () => {
    const source = fs.readFileSync(
      path.join(dashboardRoot, "galleries/page.tsx"),
      "utf8",
    );

    // The shared icon must be imported and used.
    expect(source).toContain("XMark");
    expect(source).toMatch(/import\s*{[^}]*\bXMark\b[^}]*}\s*from\s*"@\/components\/icons"/);
    expect(source).toContain("<XMark");

    // No hand-rolled close-glyph SVG path should remain anywhere on this page.
    expect(source).not.toContain("M6 18L18 6M6 6l12 12");
  });

  it("exposes a real gallery publish-state switch on gallery cards", () => {
    const source = fs.readFileSync(
      path.join(dashboardRoot, "galleries/page.tsx"),
      "utf8",
    );

    expect(source).toContain("updateGallery");
    expect(source).toContain("toggleGalleryPublish");
    expect(source).toContain('role="switch"');
    expect(source).toContain("aria-checked={gallery.is_published}");
    expect(source).toContain("publish-state-toggle");
  });

  it("opens gallery-card share actions for copy, email, and WhatsApp without sharing unpublished galleries", () => {
    const source = fs.readFileSync(
      path.join(dashboardRoot, "galleries/page.tsx"),
      "utf8",
    );

    expect(source).toContain("GalleryShareMenu");
    expect(source).toContain("shareMenuGalleryId");
    expect(source).toContain("Copy link");
    expect(source).toContain("Email");
    expect(source).toContain("WhatsApp");
    expect(source).toContain("mailto:");
    expect(source).toContain("https://wa.me/?text=");
    expect(source).toContain("Publish this gallery before sharing client links.");
    expect(source).toContain("appendStoredGalleryKeyFragment(base, gallery.id)");
  });

  it("creates durable share links before copying gallery-detail public URLs", () => {
    const source = fs.readFileSync(
      path.join(dashboardRoot, "galleries/[id]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("createGalleryShareLink");
    expect(source).toContain("createWorkingShareUrl");
    expect(source).toContain("setUrlSearchParamBeforeFragment");
    expect(source).toContain('access_mode: "public"');
    expect(source).toContain('channel,');
    expect(source).toContain("Sign in again to create a share link.");
  });

  it("keeps owner preview actions inside the dashboard preview route", () => {
    const coverSource = fs.readFileSync(
      path.join(dashboardRoot, "galleries/[id]/cover/page.tsx"),
      "utf8",
    );
    const shareSource = fs.readFileSync(
      path.join(repoRoot, "src/components/gallery/gallery-share-center.tsx"),
      "utf8",
    );

    expect(coverSource).toContain("href={`/galleries/${galleryId}/preview`}");
    expect(shareSource).toContain("href={`/galleries/${gallery.id}/preview`}");
    expect(coverSource).not.toContain("href={`/g/${gallery.slug}`}");
    expect(shareSource).not.toContain("href={`/g/${gallery.slug}?mode=client`}");
  });
});
