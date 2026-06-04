import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const previewPagePath = join(
  process.cwd(),
  "src/app/(dashboard)/galleries/[id]/preview/page.tsx",
);

function readPreviewPage() {
  return readFileSync(previewPagePath, "utf8");
}

describe("gallery owner preview E2EE contracts", () => {
  it("keeps encryption metadata when mapping owner assets into public preview assets", () => {
    const source = readPreviewPage();

    expect(source).toContain("is_encrypted: a.is_encrypted");
    expect(source).toContain("media_encryption: a.media_encryption");
    expect(source).toContain("resolvedCoverAsset");
    expect(source).toContain("designCoverAsset={resolvedCoverAsset}");
  });

  it("threads the owner access token into the public Hero + Grid so E2EE photos decrypt in the preview", () => {
    const source = readPreviewPage();

    // The owner token must be captured at render and forwarded as the decrypt
    // bearer to BOTH shared public components. Without it, the components fetch
    // the encrypted /storage bytes anonymously (no Authorization, no ?at=) and
    // the byte serve 401/403s — leaving the photographer's own preview with
    // blank "Image unavailable" tiles for an unpublished/private E2EE gallery.
    expect(source).toContain("getStoredAccessToken()");
    const viewerTokenProps = source.match(/viewerToken=\{viewerToken\}/g) ?? [];
    expect(viewerTokenProps.length).toBeGreaterThanOrEqual(2);
  });
});
