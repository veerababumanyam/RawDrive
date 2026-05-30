import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dependency-advisory regression guard for F-038.
 * ------------------------------------------------
 * Next.js had two HIGH-severity App Router "Middleware / Proxy bypass via
 * segment-prefetch routes" advisories. This repo ships an active
 * `frontend/src/middleware.ts` (per-subdomain rewrite), so any future auth
 * enforcement added there would be silently bypassable on a vulnerable pin.
 *
 *   GHSA-267c-6grr-h53f (HIGH): next >= 16.0.0, < 16.2.5  → first patched 16.2.5
 *   GHSA-26hh-7cqf-hhc6 (HIGH): next >= 16.0.0, < 16.2.6  → first patched 16.2.6
 *
 * Both ranges (verified against the live GitHub Advisory DB) are cleared by
 * pinning to 16.2.6, the higher of the two patched floors. This test locks the
 * floor so a regression to <16.2.6 (e.g. a careless revert to 16.2.3) fails
 * CI. It is a pure read of package.json — no network, no DB.
 */

// The higher of the two patched floors. Pins below this are vulnerable to at
// least one of the HIGH advisories above.
const PATCHED_FLOOR = "16.2.6";

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

// Parse the stable "X.Y.Z" portion of an exact pin (these are pinned exactly,
// no caret/range), ignoring any pre-release/build suffix.
function parseExactPin(raw: string): SemverParts {
  const stripped = raw.replace(/^[~^]/, "");
  const core = stripped.split(/[-+]/)[0];
  const segments = core.split(".");
  expect(
    segments.length,
    `expected an exact X.Y.Z pin, got "${raw}"`,
  ).toBeGreaterThanOrEqual(3);
  const [major, minor, patch] = segments.map((n) => Number.parseInt(n, 10));
  for (const value of [major, minor, patch]) {
    expect(Number.isNaN(value), `unparseable version segment in "${raw}"`).toBe(false);
  }
  return { major, minor, patch };
}

// Returns true when `actual` >= `floor`.
function meetsFloor(actual: SemverParts, floor: SemverParts): boolean {
  if (actual.major !== floor.major) return actual.major > floor.major;
  if (actual.minor !== floor.minor) return actual.minor > floor.minor;
  return actual.patch >= floor.patch;
}

function readPackageJson(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  // __tests__ -> lib -> src -> frontend
  const pkgPath = path.resolve(__dirname, "../../../package.json");
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

describe("F-038: Next.js pin clears the App Router middleware-bypass advisories", () => {
  const floor = parseExactPin(PATCHED_FLOOR);

  it("pins `next` at or above the patched floor (>= 16.2.6)", () => {
    const pkg = readPackageJson();
    const pinned = pkg.dependencies?.next;
    expect(pinned, "`next` must be declared in dependencies").toBeTruthy();
    expect(
      meetsFloor(parseExactPin(pinned), floor),
      `next is pinned to "${pinned}", below the patched floor ${PATCHED_FLOOR} ` +
        `(vulnerable to GHSA-267c-6grr-h53f / GHSA-26hh-7cqf-hhc6)`,
    ).toBe(true);
  });

  it("pins `eslint-config-next` to the same patched floor (toolchain alignment)", () => {
    const pkg = readPackageJson();
    const pinned = pkg.devDependencies?.["eslint-config-next"];
    expect(pinned, "`eslint-config-next` must be declared in devDependencies").toBeTruthy();
    expect(
      meetsFloor(parseExactPin(pinned), floor),
      `eslint-config-next is pinned to "${pinned}", below ${PATCHED_FLOOR}`,
    ).toBe(true);
  });

  it("keeps `next` and `eslint-config-next` on the same version", () => {
    // Next's eslint config must track the framework version to avoid lint
    // rules drifting from runtime behaviour.
    const pkg = readPackageJson();
    expect(pkg.dependencies?.next).toBe(pkg.devDependencies?.["eslint-config-next"]);
  });
});
