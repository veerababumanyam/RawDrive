import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// M39 Round 4 RED→GREEN: existence + shape checks for E5-S2, E6-S2, E7-S3,
// E8-S2, E9-S2. We check file presence + minimal contract rather than
// importing (imports fail the whole file when a module is missing, which
// swallows the remaining assertions). Full interaction flows are covered
// by Playwright specs in e2e/ (run via docker compose run playwright per
// project rules).

const FRONTEND_ROOT = resolve(__dirname, "../../../..");
function fileExists(rel: string): boolean {
  return existsSync(resolve(FRONTEND_ROOT, rel));
}
function fileContains(rel: string, needle: string | RegExp): boolean {
  const p = resolve(FRONTEND_ROOT, rel);
  if (!existsSync(p)) return false;
  const c = readFileSync(p, "utf8");
  return typeof needle === "string" ? c.includes(needle) : needle.test(c);
}

describe("M39 E5-S2: admin NewUserDialog", () => {
  it("NewUserDialog component file exists", () => {
    expect(fileExists("src/components/admin/NewUserDialog.tsx")).toBe(true);
  });
  it("NewUserDialog is a default-exported React component", () => {
    expect(fileContains("src/components/admin/NewUserDialog.tsx", /export default/)).toBe(true);
  });
});

describe("M39 E6-S2: forgot + reset password pages", () => {
  it("forgot-password page exists", () => {
    expect(fileExists("src/app/forgot-password/page.tsx")).toBe(true);
  });
  it("reset-password page exists", () => {
    expect(fileExists("src/app/reset-password/page.tsx")).toBe(true);
  });
});

describe("M39 E7-S3: dealer admin UI action components", () => {
  it("DealerSearchInput exists", () => {
    expect(fileExists("src/components/admin/DealerSearchInput.tsx")).toBe(true);
  });
  it("DealerDeleteConfirmDialog exists", () => {
    expect(fileExists("src/components/admin/DealerDeleteConfirmDialog.tsx")).toBe(true);
  });
});

describe("M39 E8-S2: audit log filters", () => {
  it("AuditLogFilters exists", () => {
    expect(fileExists("src/components/admin/AuditLogFilters.tsx")).toBe(true);
  });
});

describe("M39 E9-S2: photo-trail feed page", () => {
  it("photo-trail page exists", () => {
    expect(fileExists("src/app/(dashboard)/photo-trail/page.tsx")).toBe(true);
  });
});

describe("M39 API helpers", () => {
  it("lib/api/admin exports a createUser helper", () => {
    expect(fileContains("src/lib/api/admin.ts", /export\s+(async\s+)?function\s+createUser\b/)).toBe(true);
  });
  it("lib/api/auth exports a requestPasswordReset helper", () => {
    expect(fileContains("src/lib/api/auth.ts", /export\s+(async\s+)?function\s+requestPasswordReset\b/)).toBe(true);
  });
  it("lib/api/auth exports a resetPassword helper", () => {
    expect(fileContains("src/lib/api/auth.ts", /export\s+(async\s+)?function\s+resetPassword\b/)).toBe(true);
  });
});
