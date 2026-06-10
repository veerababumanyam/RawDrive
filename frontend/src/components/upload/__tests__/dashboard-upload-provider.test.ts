import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardUploadProvider } from "../dashboard-upload-provider";

const uploadState = vi.hoisted(() => ({
  pathname: "/dashboard",
  useUpload: vi.fn(),
}));

function mockUpload(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    addFiles: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(),
    retryAll: vi.fn(),
    dismiss: vi.fn(),
    clearFinished: vi.fn(),
    cancelAll: vi.fn(),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    isPaused: false,
    ...overrides,
  };
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => uploadState.pathname,
}));

vi.mock("@/lib/api/base-url", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "token",
}));

vi.mock("@/hooks/use-upload", () => ({
  isActiveUploadStatus: (status: string) =>
    [
      "uploading",
      "pending",
      "screening",
      "encrypting",
      "indexing_faces",
      "paused",
    ].includes(status),
  useUpload: uploadState.useUpload,
}));

const providerPath = join(
  process.cwd(),
  "src/components/upload/dashboard-upload-provider.tsx",
);

function readProviderSource(): string {
  return readFileSync(providerPath, "utf8");
}

afterEach(() => {
  cleanup();
  uploadState.pathname = "/dashboard";
  uploadState.useUpload.mockReset();
  vi.restoreAllMocks();
});

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
      "Upload continues while you use RawDrive",
    );
    expect(statusBarSource).toContain("Messages");
    expect(statusBarSource).toContain("Settings");
    expect(statusBarSource).toContain("Open gallery");
    expect(statusBarSource).not.toContain("cancelAll");
    expect(statusBarSource).not.toContain("beforeunload");
    expect(statusBarSource).not.toContain("addEventListener");
  });

  it("keeps gallery upload configuration while routed-away uploads are active", () => {
    const source = readProviderSource();

    expect(source).toContain("pendingClearOwnerRef");
    expect(source).toContain("hasActiveUploads");
    expect(source).toContain("isActiveUploadStatus(item.status)");
    expect(source).toContain("if (hasActiveUploads)");
    expect(source).toContain("return current;");
    expect(source).toContain("pendingClearOwnerRef.current = ownerKey");
  });

  it("shows routed-away active uploads without installing a leave-site prompt", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    uploadState.useUpload.mockReturnValue(
      mockUpload({
        items: [
          {
            id: "upload-1",
            file: new File(["photo-bytes"], "photo.jpg", {
              type: "image/jpeg",
            }),
            progress: 0,
            status: "uploading",
            uploadDestination: { galleryId: "gallery-1" },
          },
        ],
      }),
    );

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement("main", null, "Dashboard"),
      ),
    );

    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();
    expect(screen.getByText(/Uploading 1 file/i)).toBeInTheDocument();
    expect(screen.getByText("Open gallery")).toHaveAttribute(
      "href",
      "/galleries/gallery-1",
    );
    expect(
      addEventListener.mock.calls.filter(([type]) => type === "beforeunload"),
    ).toHaveLength(0);
  });

  it("hides the routed-away status bar when every upload is complete", () => {
    uploadState.useUpload.mockReturnValue(
      mockUpload({
        items: [
          {
            id: "upload-1",
            file: new File(["photo-bytes"], "photo.jpg", {
              type: "image/jpeg",
            }),
            progress: 100,
            status: "complete",
            uploadDestination: { galleryId: "gallery-1" },
          },
        ],
      }),
    );

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement("main", null, "Dashboard"),
      ),
    );

    expect(
      screen.queryByTestId("dashboard-upload-status"),
    ).not.toBeInTheDocument();
  });
});
