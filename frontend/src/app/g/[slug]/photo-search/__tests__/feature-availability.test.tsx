import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PublicPhotoSearchPage from "../page";
import {
  PhotoSearchDisabledError,
  PhotoSearchUnavailableError,
} from "@/lib/api/ai";

// 3i / FE-5: the public Find-Me page must show the honest "disabled" /
// "unavailable" panels — NOT the generic error toast — when the backend reports
// the feature is off (403) or the service is down (503). Critically, the page
// chooses that panel from a TYPED error (status-keyed) thrown by
// searchPublicFaceInGallery, not from a regex on the backend's error copy, so a
// backend wording change cannot silently break it.

// Mock the photo-search client + scope helper. The error CLASSES are NOT mocked
// (real classes imported above) so the page's typed-error guards exercise the
// genuine instanceof checks.
const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/api/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ai")>();
  return {
    ...actual,
    searchPublicFaceInGallery: searchMock,
    withPublicScope: (path: string) => path,
  };
});

vi.mock("@/components/gallery/decrypted-thumb", () => ({
  DecryptedThumb: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function installCameraMocks() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
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

// Drive the page through consent → camera → capture so the search runs and the
// caught error decides which panel renders.
async function captureWith(rejection: unknown) {
  const { getUserMedia } = installCameraMocks();
  installCanvasMocks();
  searchMock.mockRejectedValue(rejection);
  await renderPage();

  fireEvent.click(await screen.findByRole("checkbox"));
  const startBtn = screen.getByRole("button", { name: /start camera/i });
  await waitFor(() => expect(startBtn).toBeEnabled());
  fireEvent.click(startBtn);

  // Camera opens asynchronously (post-consent); flush so the preview stage
  // mounts the <video> element before we stamp dimensions on it.
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

  const video = await waitFor(() => {
    const el = document.querySelector("video");
    if (!el) throw new Error("camera preview video did not mount");
    return el;
  });
  Object.defineProperty(video, "videoWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(video, "videoHeight", {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: () => 4,
  });
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const captureBtn = await screen.findByRole("button", {
    name: /capture & search/i,
  });
  await waitFor(() => expect(captureBtn).toBeEnabled());
  fireEvent.click(captureBtn);
}

describe("standalone Find-Me feature-availability panels (3i / FE-5)", () => {
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

  it("shows the honest 'unavailable' panel (not the generic error) on a 503 PhotoSearchUnavailableError", async () => {
    // Reworded message proves the panel is chosen from the TYPED error, not the text.
    await captureWith(
      new PhotoSearchUnavailableError("totally different backend copy"),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/photo search isn.t available right now/i),
      ).toBeInTheDocument(),
    );
    // The friendly fallback CTA is present; the raw error message is NOT shown.
    expect(
      screen.getByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/totally different backend copy/i),
    ).not.toBeInTheDocument();
  });

  it("shows the honest 'disabled' panel (not the generic error) on a 403 PhotoSearchDisabledError", async () => {
    await captureWith(
      new PhotoSearchDisabledError("photo search disabled for this gallery"),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/photo search isn.t enabled here/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/hasn.t enabled photo search/i),
    ).toBeInTheDocument();
  });

  it("a plain Error (no typed status signal) falls through to the inline error detail, not the friendly panels", async () => {
    await captureWith(new Error("network blip"));

    await waitFor(() =>
      expect(screen.getByText(/network blip/i)).toBeInTheDocument(),
    );
    // Neither friendly panel is mistakenly shown for an untyped error.
    expect(
      screen.queryByText(/photo search isn.t available right now/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/photo search isn.t enabled here/i),
    ).not.toBeInTheDocument();
  });
});
