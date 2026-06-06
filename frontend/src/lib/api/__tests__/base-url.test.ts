import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveApiBaseUrl, resolveBrowserApiBaseUrl } from "../base-url";

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue;
      files.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

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

  it("keeps local browser calls on the public API URL", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {
          INTERNAL_API_BASE_URL: "http://backend:8080",
          NEXT_PUBLIC_API_URL: "http://localhost:8080",
        },
        locationHostname: "localhost",
      }),
    ).toBe("http://localhost:8080");
  });

  it("keeps server-rendered storage URLs on a browser-resolvable local API URL", () => {
    expect(
      resolveBrowserApiBaseUrl({
        env: {
          INTERNAL_API_BASE_URL: "http://backend:8080",
        },
        locationHostname: "localhost",
      }),
    ).toBe("http://localhost:8080");
  });

  it("uses public production API URLs for server-rendered storage URLs", () => {
    expect(
      resolveBrowserApiBaseUrl({
        env: {
          INTERNAL_API_BASE_URL: "https://api.rawdrive.in",
        },
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("does not leak a localhost public API URL into production browser hosts", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {
          NEXT_PUBLIC_API_URL: "http://localhost:8080",
        },
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("does not leak a private service-name API URL into production browser hosts", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {
          NEXT_PUBLIC_API_URL: "http://backend:8080",
        },
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("keeps explicit non-local public API URLs on production browser hosts", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {
          NEXT_PUBLIC_API_URL: "https://api.rawdrive.in",
        },
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("uses production API for server-rendered storage URLs when env only has a private service name", () => {
    expect(
      resolveBrowserApiBaseUrl({
        env: {
          NEXT_PUBLIC_API_URL: "http://backend:8080",
        },
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("falls back to the production API on non-local browser hosts", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {},
        locationHostname: "rawdrive.in",
      }),
    ).toBe("https://api.rawdrive.in");
  });

  it("keeps the localhost fallback for local browser hosts", () => {
    expect(
      resolveApiBaseUrl({
        isServer: false,
        env: {},
        locationHostname: "localhost",
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
      expect(source).not.toContain(
        'const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"',
      );
    }
  });

  it("keeps localhost API fallback centralized outside tests", () => {
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root).filter((path) => {
      if (path.endsWith(join("src", "lib", "api", "base-url.ts"))) {
        return false;
      }
      const source = readFileSync(path, "utf8");
      return (
        source.includes(
          'process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"',
        ) ||
        source.includes(
          'process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"',
        )
      );
    });

    expect(offenders).toEqual([]);
  });
});
