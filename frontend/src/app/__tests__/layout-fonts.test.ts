import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(process.cwd(), "src", "app");

describe("RootLayout font loading", () => {
  it("does not load Google web fonts because design tokens require system fonts", () => {
    const layout = readFileSync(join(appRoot, "layout.tsx"), "utf8");
    const globals = readFileSync(join(appRoot, "globals.css"), "utf8");

    expect(layout).not.toContain("next/font/google");
    expect(globals).not.toContain("--font-inter");
    expect(globals).not.toContain("--font-manrope");
  });
});
