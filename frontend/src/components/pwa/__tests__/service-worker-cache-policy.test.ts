import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("service worker cache policy", () => {
  const source = readFileSync(join(process.cwd(), "public/service-worker.js"), "utf8");

  it("bypasses cache for security-critical worker scripts", () => {
    expect(source).toContain("isSecurityCriticalWorker(url)");
    expect(source).toContain("/upload-screening.worker");
    expect(source).toContain('cache: "no-store"');
  });
});
