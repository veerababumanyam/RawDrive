import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("public photo-search index readiness state", () => {
  it("routes an empty face index to a distinct result state", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/g/[slug]/photo-search/page.tsx"),
      "utf8",
    );

    expect(source).toContain('"result-index-empty"');
    expect(source).toContain('result.index_status === "empty"');
    expect(source).toContain("Face search is still indexing this gallery");
  });
});
