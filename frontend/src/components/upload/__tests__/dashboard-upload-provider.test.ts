import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DashboardUploadProvider,
  useDashboardUploadContext,
} from "../dashboard-upload-provider";

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
  cancelUploadsConfirmationMessage: (activeCount?: number) =>
    `Cancel ${activeCount ?? "all"} active/queued upload${activeCount === 1 ? "" : "s"}?`,
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
  vi.useRealTimers();
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
    expect(statusBarSource).toContain("Retry failed");
    expect(statusBarSource).toContain("upload.retryAll");
    expect(statusBarSource).toContain("Cancel uploads");
    expect(statusBarSource).toContain("window.confirm");
    expect(statusBarSource).toContain("cancelUploadsConfirmationMessage");
    expect(statusBarSource).toContain("upload.cancelAll");
    expect(statusBarSource).not.toContain("Hide upload status");
    expect(statusBarSource).not.toContain("onHideStatus");
    expect(statusBarSource).not.toContain("beforeunload");
    expect(statusBarSource).not.toContain("addEventListener");
    expect(source).toContain('data-testid="dashboard-upload-file-input"');
    expect(source).toContain('data-testid="dashboard-upload-folder-input"');
    expect(source).toContain("openFilePicker");
    expect(source).toContain("openFolderPicker");
    expect(source).toContain("shouldRetainPickerFiles");
    expect(source).toContain("const uploadPanelOpen = activeCount > 0;");
    expect(source).toContain("folderPickerLocked");
    expect(source).toContain("Selecting folder");
    expect(source).toContain("FOLDER_PICKER_HANDOFF_LOCK_MS");
    expect(source).toContain("hasActiveUploads || shouldRetainPickerFiles");
    expect(source).toContain('addEventListener("cancel"');
    expect(source).not.toContain("uploadStatusBarHidden");
    expect(source).not.toContain("setUploadStatusBarHidden");
  });

  it("keeps gallery upload configuration while routed-away uploads are active", () => {
    const source = readProviderSource();

    expect(source).toContain("pendingClearOwnerRef");
    expect(source).toContain("hasActiveUploads");
    expect(source).toContain("hasActiveUploadsRef");
    expect(source).toContain("shouldRetainPickerFilesRef");
    expect(source).toContain("isActiveUploadStatus(item.status)");
    expect(source).toContain(
      "if (hasActiveUploads || shouldRetainPickerFiles) return;",
    );
    expect(source).toContain("const pickerHasFiles =");
    expect(source).toContain("Boolean(folderInputRef.current?.files?.length)");
    expect(source).toContain("shouldRetainPickerFilesRef.current");
    expect(source).toContain("pickerCallbackRef.current = null;");
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

  it("keeps routed-away folder upload status visible until a terminal state", () => {
    const upload = mockUpload({
      items: [
        {
          id: "upload-1",
          file: new File(["photo-bytes"], "photo.jpg", {
            type: "image/jpeg",
          }),
          progress: 24,
          status: "uploading",
          uploadDestination: { galleryId: "gallery-1" },
        },
      ],
    });
    uploadState.useUpload.mockReturnValue(upload);

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement("main", null, "Dashboard"),
      ),
    );

    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hide upload status" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel uploads" }),
    ).toBeInTheDocument();
    expect(upload.cancelAll).not.toHaveBeenCalled();
    expect(upload.clearFinished).not.toHaveBeenCalled();
    expect(upload.items).toHaveLength(1);
  });

  it("does not cancel routed-away uploads unless the user confirms", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const upload = mockUpload({
      items: [
        {
          id: "upload-1",
          file: new File(["photo-bytes"], "photo.jpg", {
            type: "image/jpeg",
          }),
          progress: 24,
          status: "uploading",
          uploadDestination: { galleryId: "gallery-1" },
        },
      ],
    });
    uploadState.useUpload.mockReturnValue(upload);

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement("main", null, "Dashboard"),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel uploads" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Cancel 1 active/queued upload?"),
    );
    expect(upload.cancelAll).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel uploads" }));
    expect(upload.cancelAll).toHaveBeenCalledTimes(1);
  });

  it("keeps a mixed folder batch visible and reports aggregate progress", () => {
    uploadState.useUpload.mockReturnValue(
      mockUpload({
        items: [
          {
            id: "upload-1",
            file: new File(["a".repeat(100)], "complete.jpg", {
              type: "image/jpeg",
            }),
            progress: 100,
            status: "complete",
            uploadDestination: { galleryId: "gallery-1" },
          },
          {
            id: "upload-2",
            file: new File(["b".repeat(100)], "uploading.jpg", {
              type: "image/jpeg",
            }),
            progress: 50,
            status: "uploading",
            uploadDestination: { galleryId: "gallery-1" },
          },
          {
            id: "upload-3",
            file: new File(["c".repeat(100)], "pending.jpg", {
              type: "image/jpeg",
            }),
            progress: 0,
            status: "pending",
            uploadDestination: { galleryId: "gallery-1" },
          },
          {
            id: "upload-4",
            file: new File(["d".repeat(100)], "failed.jpg", {
              type: "image/jpeg",
            }),
            progress: 25,
            status: "error",
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
    expect(screen.getByText("Uploading 2 of 4 files")).toBeInTheDocument();
    expect(screen.getByText("175 B / 400 B · 44%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel uploads" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry failed" }),
    ).toBeInTheDocument();
  });

  it("keeps a single active file upload visible", () => {
    uploadState.useUpload.mockReturnValue(
      mockUpload({
        items: [
          {
            id: "upload-1",
            file: new File(["0123456789"], "single.jpg", {
              type: "image/jpeg",
            }),
            progress: 60,
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
    expect(screen.getByText("Uploading 1 file")).toBeInTheDocument();
    expect(screen.getByText("6 B / 10 B · 60%")).toBeInTheDocument();
  });

  it("opens a provider-owned folder picker so selected folder files survive route changes", () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    const onFilesSelected = vi.fn();
    uploadState.useUpload.mockReturnValue(mockUpload());

    function PickerHarness() {
      const context = useDashboardUploadContext();
      return createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            context?.openFolderPicker({
              accept: "image/jpeg",
              onFilesSelected,
            }),
        },
        "Open folder",
      );
    }

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    const folderInput = screen.getByTestId(
      "dashboard-upload-folder-input",
    ) as HTMLInputElement;
    expect(click).toHaveBeenCalledTimes(1);
    expect(folderInput.accept).toBe("image/jpeg");

    const file = new File(["photo-bytes"], "photo.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(folderInput, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("locks the routed-away status bar while the folder picker is open", () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    const onFilesSelected = vi.fn();
    uploadState.useUpload.mockReturnValue(mockUpload());

    function PickerHarness() {
      const context = useDashboardUploadContext();
      return createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            context?.openFolderPicker({
              accept: "image/jpeg",
              onFilesSelected,
            }),
        },
        "Open folder",
      );
    }

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    expect(
      screen.queryByTestId("dashboard-upload-status"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();
    expect(screen.getByText("Selecting folder")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel uploads" }),
    ).not.toBeInTheDocument();
  });

  it("releases the folder-picker status lock when folder selection is cancelled", () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    uploadState.useUpload.mockReturnValue(mockUpload());

    function PickerHarness() {
      const context = useDashboardUploadContext();
      return createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            context?.openFolderPicker({
              accept: "image/jpeg",
              onFilesSelected: vi.fn(),
            }),
        },
        "Open folder",
      );
    }

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();

    const folderInput = screen.getByTestId("dashboard-upload-folder-input");
    fireEvent(folderInput, new Event("cancel"));

    expect(
      screen.queryByTestId("dashboard-upload-status"),
    ).not.toBeInTheDocument();
  });

  it("keeps the folder-picker status lock through selected-file handoff", () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const onFilesSelected = vi.fn();
    let upload = mockUpload();
    uploadState.useUpload.mockImplementation(() => upload);

    function PickerHarness() {
      const context = useDashboardUploadContext();
      return createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            context?.openFolderPicker({
              accept: "image/jpeg",
              onFilesSelected,
            }),
        },
        "Open folder",
      );
    }

    const view = render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    const folderInput = screen.getByTestId(
      "dashboard-upload-folder-input",
    ) as HTMLInputElement;
    const file = new File(["photo-bytes"], "photo.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(folderInput, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();
    expect(screen.getByText("Selecting folder")).toBeInTheDocument();

    upload = mockUpload({
      items: [
        {
          id: "upload-1",
          file: new File(["0123456789"], "single.jpg", {
            type: "image/jpeg",
          }),
          progress: 60,
          status: "uploading",
          uploadDestination: { galleryId: "gallery-1" },
        },
      ],
    });

    view.rerender(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();
    expect(screen.getByText("Uploading 1 file")).toBeInTheDocument();
    expect(screen.getByText("6 B / 10 B · 60%")).toBeInTheDocument();
    expect(screen.queryByText("Selecting folder")).not.toBeInTheDocument();
  });

  it("releases the folder-picker status lock after an empty selection grace period", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const onFilesSelected = vi.fn();
    uploadState.useUpload.mockReturnValue(mockUpload());

    function PickerHarness() {
      const context = useDashboardUploadContext();
      return createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            context?.openFolderPicker({
              accept: "image/jpeg",
              onFilesSelected,
            }),
        },
        "Open folder",
      );
    }

    render(
      createElement(
        DashboardUploadProvider,
        null,
        createElement(PickerHarness),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    const folderInput = screen.getByTestId("dashboard-upload-folder-input");
    fireEvent.change(folderInput, { target: { files: [] } });

    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });

    expect(screen.getByTestId("dashboard-upload-status")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(
      screen.queryByTestId("dashboard-upload-status"),
    ).not.toBeInTheDocument();
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

  it("hides the routed-away status bar when every upload has failed", () => {
    uploadState.useUpload.mockReturnValue(
      mockUpload({
        items: [
          {
            id: "upload-1",
            file: new File(["photo-bytes"], "photo.jpg", {
              type: "image/jpeg",
            }),
            progress: 10,
            status: "error",
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

  it("hides the routed-away status bar after cancellation clears the queue", () => {
    uploadState.useUpload.mockReturnValue(mockUpload({ items: [] }));

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
