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

// Pages that MUST share the canonical workspace shell. (cover + detail already
// use it; these two regressed and are the unit under fix.)
const CANONICAL_SHELL_PAGES = [
  "src/app/(dashboard)/galleries/[id]/settings/page.tsx",
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
] as const;

function readPage(relPath: string): string {
  return fs.readFileSync(path.join(frontendRoot, relPath), "utf8");
}

describe("gallery sub-page shell consistency", () => {
  it.each(CANONICAL_SHELL_PAGES)(
    "%s renders on the canonical GalleryPageShell + GalleryPageHeader",
    (relPath) => {
      const source = readPage(relPath);

      expect(source).toMatch(SHELL_IMPORT);
      expect(source).toContain("<GalleryPageShell");
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
      expect(source).not.toMatch(
        /from\s*"@\/components\/ui\/page-container"/,
      );
      expect(source).not.toMatch(
        /from\s*"@\/components\/gallery\/gallery-workspace-nav"/,
      );
    },
  );

  it("cover stays on the same canonical shell (the consistency reference)", () => {
    // Cover was never reverted — it is the reference the two fixed pages must
    // match. Pin it so "all sub-pages look the same" can't drift from here.
    const source = readPage("src/app/(dashboard)/galleries/[id]/cover/page.tsx");
    expect(source).toMatch(SHELL_IMPORT);
    expect(source).toContain("<GalleryPageShell");
  });
});
