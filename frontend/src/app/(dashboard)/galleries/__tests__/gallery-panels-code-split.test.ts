import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PERF-SPLIT — source-static regression tests proving the heavy,
// conditionally-rendered gallery panels are pulled out of their route's
// first-load JS via next/dynamic, mirroring the PERF-24 PhotoLightbox
// contract in gallery-detail-perf-a11y.test.ts. They fail against the
// pre-fix source (static imports) and pass after the fix, with no DB,
// network, or render harness needed.
//
// Before this fix the whole app had exactly one next/dynamic boundary
// (the PhotoLightbox in galleries/[id]/page.tsx). These panels were
// statically imported even though each only renders behind a user
// action / data condition, so they shipped in the initial route bundle.

const frontendRoot = path.resolve(__dirname, "../../../../..");

function read(relFromSrc: string): string {
  return fs.readFileSync(path.join(frontendRoot, "src", relFromSrc), "utf8");
}

// A static `import { Name } from "path"` for a panel that only renders on
// demand is the anti-pattern. After the fix the symbol must be produced by
// next/dynamic instead, with a token-styled loading placeholder.
function expectDynamicNotStatic(
  source: string,
  symbol: string,
  importPath: string,
) {
  // No top-level static named import of the panel.
  const staticImport = new RegExp(
    `import\\s*{[^}]*\\b${symbol}\\b[^}]*}\\s*from\\s*"${importPath.replace(
      /[/\\^$*+?.()|[\]{}]/g,
      "\\$&",
    )}"`,
  );
  expect(source).not.toMatch(staticImport);

  // The panel is produced by a next/dynamic() boundary that imports the
  // same module path.
  const dyn = new RegExp(
    `const\\s+${symbol}\\s*=\\s*dynamic\\(`,
  );
  expect(source).toMatch(dyn);
  expect(source).toContain(`import("${importPath}")`);

  // next/dynamic must be imported.
  expect(source).toMatch(/import\s+dynamic\s+from\s+"next\/dynamic"/);

  // The dynamic() call carries a loading placeholder (not a bare default).
  expect(source).toContain("loading:");
}

describe("PERF-SPLIT — heavy gallery panels are code-split via next/dynamic", () => {
  it("AI panel: galleries/[id]/ai loads GalleryAIPanel lazily, not statically", () => {
    const source = read("app/(dashboard)/galleries/[id]/ai/page.tsx");
    expectDynamicNotStatic(
      source,
      "GalleryAIPanel",
      "@/components/gallery/gallery-ai-panel",
    );
    // The loading placeholder must be token-styled, not a hardcoded primitive.
    expect(source).toMatch(/bg-surface-[a-z-]+/);
    expect(source).not.toMatch(/bg-(neutral|gray|slate|zinc)-\d/);
  });

  it("Embedded videos panel: galleries/[id] loads EmbeddedVideosPanel lazily, not statically", () => {
    const source = read("app/(dashboard)/galleries/[id]/page.tsx");
    expectDynamicNotStatic(
      source,
      "EmbeddedVideosPanel",
      "@/components/gallery/embedded-videos-panel",
    );
    // Token-styled placeholder, no Tailwind primitive scales.
    expect(source).not.toMatch(/bg-(neutral|gray|slate|zinc)-\d/);
  });

  it("Product preview panel: public-gallery-products loads ProductPreview lazily, not statically", () => {
    const source = read("components/gallery/public-gallery-products.tsx");
    expectDynamicNotStatic(
      source,
      "ProductPreview",
      "@/components/gallery/product-preview",
    );
    expect(source).not.toMatch(/bg-(neutral|gray|slate|zinc)-\d/);
  });

  it("does not regress the existing PhotoLightbox dynamic boundary", () => {
    const source = read("app/(dashboard)/galleries/[id]/page.tsx");
    expect(source).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(\s*"@\/components\/gallery\/photo-lightbox"\s*\)\s*\.then\(/,
    );
  });
});
