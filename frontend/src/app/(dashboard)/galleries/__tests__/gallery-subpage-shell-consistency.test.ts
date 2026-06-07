import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-static regression tests for the gallery /galleries/{id} workspace
// sub-pages. Mirrors the F-042/F-043 style in this directory: read the file
// and assert structural guarantees, no DB / network / render harness needed.
//
// Why this exists: the gallery sub-pages were converged onto ONE canonical
// container — GalleryPageShell (which renders GalleryWorkspaceNav at an
// identical width/position on every tab) + GalleryPageHeader — so switching
// tabs no longer makes the nav strip jump. A self-merge silently reverted
// SETTINGS and PHOTO-SEARCH off that shell back to hand-rolled
// `PageContainer + GalleryWorkspaceNav + PageHeader`, leaving cover/detail on
// the shell and breaking the "all sub-pages look the same" guarantee.
//
// These tests fail against that reverted source and pass once the pages are
// restored to the canonical shell — so a future merge can't silently revert
// them again without going red.

const frontendRoot = path.resolve(__dirname, "../../../../..");

const SHELL_IMPORT =
  /import\s*{[^}]*\bGalleryPageShell\b[^}]*}\s*from\s*"@\/components\/gallery\/gallery-page-shell"/;
const HEADER_IMPORT =
  /import\s*{[^}]*\bGalleryPageHeader\b[^}]*}\s*from\s*"@\/components\/gallery\/gallery-page-header"/;
const RESIZABLE_SPLIT_IMPORT =
  /import\s*{[^}]*\bResizableWorkspaceSplit\b[^}]*}\s*from\s*"@\/components\/gallery\/resizable-workspace-split"/;

// Pages that MUST share the canonical workspace shell. Preview is deliberately
// excluded because it renders the exact client gallery with owner chrome.
const CANONICAL_SHELL_PAGES = [
  "src/app/(dashboard)/galleries/[id]/page.tsx",
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
  "src/app/(dashboard)/galleries/[id]/settings/page.tsx",
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
  "src/app/(dashboard)/galleries/[id]/sales/page.tsx",
  "src/app/(dashboard)/galleries/[id]/delivery/page.tsx",
  "src/app/(dashboard)/galleries/[id]/ai/page.tsx",
] as const;

// Overview keeps a bespoke editable title/publish header; every sub-page with a
// document/workbench header uses the canonical GalleryPageHeader.
const CANONICAL_HEADER_PAGES = [
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
  "src/app/(dashboard)/galleries/[id]/settings/page.tsx",
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
  "src/app/(dashboard)/galleries/[id]/sales/page.tsx",
  "src/app/(dashboard)/galleries/[id]/delivery/page.tsx",
  "src/app/(dashboard)/galleries/[id]/ai/page.tsx",
] as const;

const RESIZABLE_WORKBENCH_PAGES = [
  "src/app/(dashboard)/galleries/[id]/page.tsx",
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
  "src/app/(dashboard)/galleries/[id]/settings/page.tsx",
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
] as const;

function readPage(relPath: string): string {
  return fs.readFileSync(path.join(frontendRoot, relPath), "utf8");
}

describe("gallery sub-page shell consistency", () => {
  it.each(CANONICAL_SHELL_PAGES)(
    "%s renders on the canonical GalleryPageShell",
    (relPath) => {
      const source = readPage(relPath);

      expect(source).toMatch(SHELL_IMPORT);
      expect(source).toContain("<GalleryPageShell");
    },
  );

  it.each(RESIZABLE_WORKBENCH_PAGES)(
    "%s uses the shared persisted resizable split for desktop rails",
    (relPath) => {
      const source = readPage(relPath);

      expect(source).toMatch(RESIZABLE_SPLIT_IMPORT);
      expect(source).toContain("<ResizableWorkspaceSplit");
      expect(source).toContain("rawdrive:gallery-workspace:");
      expect(source).toContain("split:v1");
      expect(source).toContain("secondarySide=");
    },
  );

  it.each(CANONICAL_HEADER_PAGES)(
    "%s renders on the canonical GalleryPageHeader",
    (relPath) => {
      const source = readPage(relPath);

      expect(source).toMatch(HEADER_IMPORT);
      expect(source).toContain("<GalleryPageHeader");
    },
  );

  it.each(CANONICAL_SHELL_PAGES)(
    "%s does NOT hand-roll the reverted PageContainer shell (anti-revert guard)",
    (relPath) => {
      const source = readPage(relPath);

      // The regression signature: GalleryPageShell got swapped for a
      // hand-rolled `PageContainer` (+ a directly-imported GalleryWorkspaceNav,
      // which the shell is supposed to own internally). Neither should reappear
      // on these pages.
      expect(source).not.toMatch(/from\s*"@\/components\/ui\/page-container"/);
      expect(source).not.toMatch(
        /from\s*"@\/components\/gallery\/gallery-workspace-nav"/,
      );
    },
  );

  it("preview remains exact client render chrome, not a workspace shell", () => {
    const source = readPage(
      "src/app/(dashboard)/galleries/[id]/preview/page.tsx",
    );

    expect(source).toContain("<PreviewChrome");
    expect(source).toContain("<PublicGalleryBody");
    expect(source).not.toContain("<GalleryPageShell");
  });
});
