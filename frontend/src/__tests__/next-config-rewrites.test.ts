import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config rewrites", () => {
  const originalInternal = process.env.INTERNAL_API_BASE_URL;
  const originalPublic = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalInternal === undefined) {
      delete process.env.INTERNAL_API_BASE_URL;
    } else {
      process.env.INTERNAL_API_BASE_URL = originalInternal;
    }
    if (originalPublic === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalPublic;
    }
  });

  it("uses the internal API base for server-side rewrites when configured", async () => {
    process.env.INTERNAL_API_BASE_URL = "http://backend:8080";
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080";

    const rewrites = await nextConfig.rewrites?.();

    expect(Array.isArray(rewrites)).toBe(true);
    expect(rewrites).toContainEqual({
      source: "/auth/:path*",
      destination: "http://backend:8080/auth/:path*",
    });
  });

  it("falls back to the public API base outside container mode", async () => {
    delete process.env.INTERNAL_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080";

    const rewrites = await nextConfig.rewrites?.();

    expect(Array.isArray(rewrites)).toBe(true);
    expect(rewrites).toContainEqual({
      source: "/auth/:path*",
      destination: "http://localhost:8080/auth/:path*",
    });
  });
});
