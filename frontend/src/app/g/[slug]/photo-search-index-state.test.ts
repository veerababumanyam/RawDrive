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

  it("uses a portrait camera focus reticle for face capture", async () => {
    const source = await readFile(
      join(process.cwd(), "src/app/g/[slug]/photo-search/page.tsx"),
      "utf8",
    );

    expect(source).toContain("h-4/5 w-2/5 rounded-full");
    expect(source).not.toContain("h-2/3 w-2/3 rounded-full");
  });
});
