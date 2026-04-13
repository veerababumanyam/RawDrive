import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const dashboardRoot = path.join(repoRoot, "src/app/(dashboard)");

function readFiles(root: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...readFiles(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("gallery route contracts", () => {
  it("keeps gallery-scoped destinations backed by real pages", () => {
    expect(fs.existsSync(path.join(dashboardRoot, "galleries/[id]/ai/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(dashboardRoot, "streams/[id]/page.tsx"))).toBe(true);
  });

  it("does not link to orphaned gallery AI Studio routes", () => {
    const files = readFiles(path.join(repoRoot, "src"), (file) => file.endsWith(".tsx") || file.endsWith(".ts"));
    const offenders = files.filter(
      (file) => !file.includes("__tests__") && fs.readFileSync(file, "utf8").includes("ai-studio"),
    );

    expect(offenders).toEqual([]);
  });
});
