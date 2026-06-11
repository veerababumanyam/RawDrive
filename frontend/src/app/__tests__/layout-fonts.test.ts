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

  it("keeps the app-wide text scale larger through Tailwind token mappings", () => {
    const globals = readFileSync(join(appRoot, "globals.css"), "utf8");

    expect(globals).toContain("--type-xs: 0.9rem;");
    expect(globals).toContain("--type-sm: 1.05rem;");
    expect(globals).toContain("--type-base: 1.2rem;");
    expect(globals).toContain("--type-lg: 1.35rem;");
    expect(globals).toContain("--text-base: var(--type-base);");
    expect(globals).toContain(
      "--text-base--line-height: var(--leading-base);",
    );
  });
});
