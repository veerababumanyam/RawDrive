import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveApiBaseUrl } from "../base-url";

describe("resolveApiBaseUrl", () => {
  it("uses the internal API URL for server-rendered public gallery calls", () => {
    expect(
      resolveApiBaseUrl({
        isServer: true,
        env: {
          INTERNAL_API_BASE_URL: "http://backend:8080",
          NEXT_PUBLIC_API_URL: "http://localhost:8080",
        },
      }),
    ).toBe("http://backend:8080");
  });

  it("keeps browser calls on the public API URL", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {
          INTERNAL_API_BASE_URL: "http://backend:8080",
          NEXT_PUBLIC_API_URL: "http://localhost:8080",
        },
      }),
    ).toBe("http://localhost:8080");
  });

  it("keeps public gallery API clients on the runtime API-base helper", () => {
    const publicGalleryClientPaths = [
      "src/lib/api/galleries.ts",
      "src/lib/api/commerce.ts",
      "src/lib/api/ai.ts",
    ];

    for (const clientPath of publicGalleryClientPaths) {
      const source = readFileSync(join(process.cwd(), clientPath), "utf8");
      expect(source).toContain("getApiBaseUrl");
      expect(source).not.toContain('const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"');
    }
  });
});
