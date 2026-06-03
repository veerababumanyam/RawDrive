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

  it("does not intercept cross-origin gallery storage requests", () => {
    expect(source).toContain("url.origin !== self.location.origin");
  });

  it("returns a fallback response when same-origin gallery asset fetches fail uncached", () => {
    expect(source).toContain('cached || new Response("", { status: 504');
  });

  it("does not cache opaque image responses for CORS fetches", () => {
    expect(source).toContain('cached?.type === "opaque" && request.mode !== "no-cors"');
    expect(source).toContain('response.ok && response.type !== "opaque"');
    expect(source).not.toContain('response.ok || response.type === "opaque"');
  });

  it("does not let one failed precache URL reject service worker install", () => {
    expect(source).not.toContain("cache.addAll(PRECACHE_URLS)");
    expect(source).toContain("safePrecache(cache, PRECACHE_URLS)");
    expect(source).toContain("SW precache skipped:");
  });
});
