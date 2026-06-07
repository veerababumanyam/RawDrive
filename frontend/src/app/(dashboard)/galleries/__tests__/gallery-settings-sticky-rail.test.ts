import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const globalsPath = path.join(repoRoot, "app/globals.css");

function readGlobals(): string {
  return fs.readFileSync(globalsPath, "utf8");
}

describe("gallery settings sticky category rail", () => {
  it("keeps the settings category rail top-sticky instead of stretched", () => {
    const css = readGlobals();

    expect(css).toContain(
      ".gallery-settings-workbench {\n    align-items: start;",
    );
    expect(css).toContain(".gallery-settings-rail {\n    align-self: start;");
    expect(css).toContain(
      "max-height: calc(100dvh - var(--navbar-height) - var(--space-8));",
    );
  });
});
