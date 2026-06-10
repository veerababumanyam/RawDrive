import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const providerPath = join(
  process.cwd(),
  "src/components/upload/dashboard-upload-provider.tsx",
);

function readProviderSource(): string {
  return readFileSync(providerPath, "utf8");
}

describe("DashboardUploadProvider", () => {
  it("keeps the dashboard upload bar visible without registering a leave-site prompt", () => {
    const source = readProviderSource();
    const statusBarStart = source.indexOf("function DashboardUploadStatusBar");
    const providerStart = source.indexOf(
      "export function DashboardUploadProvider",
    );
    const statusBarSource = source.slice(statusBarStart, providerStart);

    expect(statusBarStart).toBeGreaterThan(-1);
    expect(providerStart).toBeGreaterThan(statusBarStart);
    expect(statusBarSource).toContain('data-testid="dashboard-upload-status"');
    expect(statusBarSource).toContain(
      "Upload continues while you use the dashboard",
    );
    expect(statusBarSource).toContain("Open gallery");
    expect(statusBarSource).not.toContain("beforeunload");
    expect(statusBarSource).not.toContain("addEventListener");
  });
});
