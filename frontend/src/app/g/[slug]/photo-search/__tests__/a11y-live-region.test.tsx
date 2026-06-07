import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PublicPhotoSearchPage from "../page";

// FE-4 / slice 3l (WCAG 4.1.3 — Status Messages, AA): the surviving public
// Find-Me capture surface is a normal page route (not a fixed-inset modal, so
// dialog semantics do NOT apply), but its capture stage swaps visual panels
// without moving focus. These tests assert the accessibility affordances that
// DO apply to this surface:
//   1. the <video> preview is labelled,
//   2. a polite live region announces capture progress/results, and
//   3. that region escalates to assertive (role="alert") on camera failure.

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/api/ai", () => ({
  searchPublicFaceInGallery: searchMock,
  isPhotoSearchDisabledError: () => false,
  isPhotoSearchUnavailableError: () => false,
  withPublicScope: (path: string) => path,
}));

vi.mock("@/components/gallery/decrypted-thumb", () => ({
  DecryptedThumb: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function installCameraMocks(getUserMedia = vi.fn()) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  if (getUserMedia.getMockImplementation() === undefined) {
    getUserMedia.mockResolvedValue(stream);
  }
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    set: vi.fn(),
    get: () => null,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
  return { getUserMedia, track };
}

function installCanvasMocks() {
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue({ drawImage: vi.fn() }) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(["jpegbytes"], { type: "image/jpeg" }));
  } as typeof HTMLCanvasElement.prototype.toBlob;
}

async function renderPage() {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <Suspense fallback={null}>
        <PublicPhotoSearchPage params={Promise.resolve({ slug: "wedding" })} />
      </Suspense>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return utils;
}

async function acceptConsentAndOpenCamera() {
  const consent = await screen.findByRole("checkbox");
  fireEvent.click(consent);
  const startBtn = screen.getByRole("button", { name: /start camera/i });
  fireEvent.click(startBtn);

  // Drive the preview <video> to "ready" so the capture button enables.
  await waitFor(() => {
    const video = document.querySelector("video");
    if (!video) throw new Error("camera preview video did not mount");
  });
  const video = document.querySelector("video") as HTMLVideoElement;
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 });
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 });
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("public Find-Me capture a11y (FE-4 / 3l)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    searchMock.mockReset();
  });

  it("labels the camera preview <video> for screen readers", async () => {
    installCameraMocks();
    await renderPage();
    await acceptConsentAndOpenCamera();

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("aria-label", "Camera preview");
  });

  it("mounts a polite status live region that announces capture progress", async () => {
    installCameraMocks();
    installCanvasMocks();
    // Hold the search pending so we can observe the "searching" announcement.
    let resolveSearch!: (v: unknown) => void;
    searchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    await renderPage();

    // Live region exists from the first capture render and is polite by default.
    const live = await screen.findByTestId("photo-search-live-region");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("role", "status");
    expect(live).toHaveAttribute("aria-atomic", "true");

    await acceptConsentAndOpenCamera();

    const captureBtn = await screen.findByRole("button", {
      name: /capture & search/i,
    });
    await waitFor(() => expect(captureBtn).toBeEnabled());
    fireEvent.click(captureBtn);

    // Mid-flight: the region announces the in-progress search.
    await waitFor(() =>
      expect(screen.getByTestId("photo-search-live-region")).toHaveTextContent(
        /searching this gallery/i,
      ),
    );

    // Resolve as "no face" → the region announces the terminal result.
    await act(async () => {
      resolveSearch({
        found: false,
        faces_detected: 0,
        asset_ids: [],
        count: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() =>
      expect(screen.getByTestId("photo-search-live-region")).toHaveTextContent(
        /no face detected/i,
      ),
    );
  });

  it("escalates the live region to an assertive alert on camera failure", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(
        new DOMException("denied", "NotAllowedError"),
      );
    installCameraMocks(getUserMedia);
    await renderPage();

    const consent = await screen.findByRole("checkbox");
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: /start camera/i }));

    await waitFor(() => {
      const live = screen.getByTestId("photo-search-live-region");
      expect(live).toHaveAttribute("role", "alert");
      expect(live).toHaveAttribute("aria-live", "assertive");
      expect(live).toHaveTextContent(/camera unavailable/i);
    });
  });
});
