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
});
